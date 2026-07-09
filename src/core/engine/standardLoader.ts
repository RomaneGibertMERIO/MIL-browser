/**
 * Standard plugin loader.
 *
 * Single-file database seeder. Processes the global `database.json` asset
 * on startup, seeding both standards/taxonomies and built-in profiles.
 */

import { StandardPluginSchema } from "../domain/standard";
import { ProfileSchema } from "../domain/profile";
import { getStandardById, upsertStandard } from "../db/repositories/standards.repo";
import { getProfilesByStandard, getProfileById, upsertProfile } from "../db/repositories/profiles.repo";
import { migrateProfiles } from "./migrationEngine";
import type { StandardPlugin } from "../domain/standard";

// ---------------------------------------------------------------------------
// Runtime environment detection
// ---------------------------------------------------------------------------

const isElectron =
  typeof navigator !== "undefined" &&
  navigator.userAgent.toLowerCase().includes("electron");

export interface StandardLoadResult {
  id: string;
  status: "seeded" | "updated" | "unchanged" | "error";
  message?: string;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Loads everything from the unique global database.json asset.
 */
export async function loadBuiltinStandards(): Promise<StandardLoadResult[]> {
  let url = "";

  if (isElectron) {
    // En Electron packagé, le dossier 'public' se retrouve souvent un niveau au-dessus de 'dist'
    // ou accessible via le chemin relatif de l'application. 
    // Si 'database.json' a été mis à la racine de public, il est à côté de 'dist' (donc '../database.json')
    // Si ton build Vite met tout dans 'dist', alors './database.json' fonctionne.
    // Pour être ultra-robuste avec le protocole file://, on teste le chemin relatif correct :
    url = window.location.pathname.includes('/dist/') 
      ? "../database.json" 
      : "./database.json";
  } else {
    url = "/database.json";
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      // Sécurité : si le premier chemin échoue en Electron, on tente le chemin alternatif direct au cas où
      if (isElectron && url === "../database.json") {
        const fallbackResponse = await fetch("./database.json");
        if (fallbackResponse.ok) {
          const globalData = await fallbackResponse.json();
          const standardResults = await seedStandards(globalData.standards ?? []);
          await seedBuiltinProfiles(globalData.profiles ?? []);
          return standardResults;
        }
      }
      return [{ id: "global-seed", status: "error", message: `HTTP ${response.status} fetching ${url}` }];
    }

    const globalData = await response.json();

    // 1. Traiter les Standards / Taxonomies
    const standardResults = await seedStandards(globalData.standards ?? []);

    // 2. Traiter les Profils globaux
    await seedBuiltinProfiles(globalData.profiles ?? []);

    return standardResults;
  } catch (err) {
    return [{ id: "global-seed", status: "error", message: `Failed to execute global seed: ${String(err)}` }];
  }
}

/**
 * Manual file upload fallback (e.g., admin interface import).
 */
export async function loadStandardFromFile(file: File): Promise<StandardPlugin> {
  const text = await file.text();
  const raw: unknown = JSON.parse(text);
  return StandardPluginSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// Internal Seeders
// ---------------------------------------------------------------------------

async function seedStandards(standardsRaw: unknown[]): Promise<StandardLoadResult[]> {
  const results: StandardLoadResult[] = [];

  for (const item of standardsRaw) {
    try {
      const plugin = StandardPluginSchema.parse(item);
      const id = plugin.manifest.id;
      const existing = await getStandardById(id);

      // Si le standard existe déjà et possède une version égale ou supérieure, on ne touche à rien
      if (existing !== undefined && existing.manifest.schemaVersion >= plugin.manifest.schemaVersion) {
        results.push({ id, status: "unchanged" });
        continue;
      }

      await upsertStandard(plugin);

      if (existing !== undefined) {
        // Exécuter les migrations si la structure change
        await migrateExistingProfiles(plugin);
        results.push({ id, status: "updated" });
      } else {
        results.push({ id, status: "seeded" });
      }
    } catch (err) {
      results.push({
        id: (item as any)?.manifest?.id ?? "unknown-standard",
        status: "error",
        message: `Validation failed for standard: ${String(err)}`,
      });
    }
  }

  return results;
}

async function seedBuiltinProfiles(profilesRaw: unknown[]): Promise<void> {
  for (const item of profilesRaw) {
    // On force le cast en (item as any) pour permettre le spread d'un objet inconnu
    const patchedItem = {
      ...(item as any),
      source: "builtin",
      status: (item as any).status ?? "approved",
      author: (item as any).author ?? "Admin",
    };

    const parsed = ProfileSchema.safeParse(patchedItem);
    if (!parsed.success) {
      console.error("Validation error seeding profile:", parsed.error);
      continue;
    }

    const existing = await getProfileById(parsed.data.id);

    // On n'insert le profil que s'il n'existe pas déjà pour protéger l'user-space
    if (existing === undefined) {
      await upsertProfile(parsed.data);
    }
  }
}

// ---------------------------------------------------------------------------
// Migration Engine
// ---------------------------------------------------------------------------

async function migrateExistingProfiles(standard: StandardPlugin): Promise<void> {
  const profiles = await getProfilesByStandard(standard.manifest.id);
  const migrated = migrateProfiles(profiles, standard);

  for (let i = 0; i < profiles.length; i++) {
    const before = profiles[i];
    const after = migrated[i];

    if (before !== undefined && after !== undefined && before.schemaVersion !== after.schemaVersion) {
      await upsertProfile(after);
    }
  }
}
