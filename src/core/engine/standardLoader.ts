import { StandardPluginSchema } from "../domain/standard";
import { ProfileSchema } from "../domain/profile";
import { getStandardById, upsertStandard } from "../db/repositories/standards.repo";
import { getProfilesByStandard, getProfileById, upsertProfile } from "../db/repositories/profiles.repo";
import { migrateProfiles } from "./migrationEngine";
import type { StandardPlugin } from "../domain/standard";

// ---------------------------------------------------------------------------
// DÉCLARATION POUR TYPESCRIPT (Évite les erreurs de compilation sur window)
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    electronAPI?: {
      getBuiltinDatabase: () => Promise<any>;
    };
  }
}

export interface StandardLoadResult {
  id: string;
  status: "seeded" | "updated" | "unchanged" | "error";
  message?: string;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Loads everything from the unique global database via the Electron bridge.
 */
export async function loadBuiltinStandards(): Promise<StandardLoadResult[]> {
  let globalData: any = null;

  // Récupération des données via le tunnel sécurisé preloads.js -> main.js
  if (window.electronAPI && typeof window.electronAPI.getBuiltinDatabase === "function") {
    globalData = await window.electronAPI.getBuiltinDatabase();
  }

  // LE CODE DE DEBUG (Déclenchera une erreur visible dans la console de l'app si les données arrivent)
  const debugProfilesCount = globalData?.profiles?.length ?? "INDÉFINI (Clé absente)";
  const debugStandardsCount = globalData?.standards?.length ?? "INDÉFINI";
  throw new Error(`[DEBUG BDD] Standards: ${debugStandardsCount} | Profils: ${debugProfilesCount}`);

  if (!globalData) {
    return [{ 
      id: "global-seed", 
      status: "error", 
      message: `database.json vide, introuvable ou inaccessible depuis le Main Process.` 
    }];
  }

  try {
    // 1. Traiter les Standards / Taxonomies
    const standardResults = await seedStandards(globalData.standards ?? []);

    // 2. Traiter les Profils globaux
    await seedBuiltinProfiles(globalData.profiles ?? []);

    return standardResults;
  } catch (err) {
    return [{ id: "global-seed", status: "error", message: `Failed to execute global seed: ${String(err)}` }];
  }
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
