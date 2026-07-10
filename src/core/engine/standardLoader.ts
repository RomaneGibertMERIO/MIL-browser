import { StandardPluginSchema } from "../domain/standard";
import { ProfileSchema } from "../domain/profile";
import { getStandardById, upsertStandard } from "../db/repositories/standards.repo";
import { getProfilesByStandard, getProfileById, upsertProfile } from "../db/repositories/profiles.repo";
import { migrateProfiles } from "./migrationEngine";
import type { StandardPlugin } from "../domain/standard";

// AJOUT DES MODULES NODE.JS POUR LIRE LE FICHIER EXTERNE
import path from "path";
import fs from "fs";
import { app } from "electron";

export interface StandardLoadResult {
  id: string;
  status: "seeded" | "updated" | "unchanged" | "error";
  message?: string;
}

export async function loadBuiltinStandards(): Promise<StandardLoadResult[]> {
  let globalData: any = null;

  try {
    // Détermination du chemin selon si l'app est packagée ou en dev
    const isDev = !app.isPackaged;
    const jsonPath = isDev
      ? path.join(__dirname, "../src/core/engine/database.json") // Ajuste selon l'arborescence de sortie
      : path.join(process.resourcesPath, "database.json");

    if (fs.existsSync(jsonPath)) {
      const rawData = fs.readFileSync(jsonPath, "utf-8");
      globalData = JSON.parse(rawData);
    }
  } catch (fileErr) {
    return [{ id: "global-seed", status: "error", message: `Erreur lecture fichier: ${String(fileErr)}` }];
  }

  // TON CODE DE DEBUG ICI
  const debugProfilesCount = globalData?.profiles?.length ?? "INDÉFINI (Clé absente)";
  const debugStandardsCount = globalData?.standards?.length ?? "INDÉFINI";
  throw new Error(`[DEBUG BDD] Standards: ${debugStandardsCount} | Profils: ${debugProfilesCount}`);

  // ... (le reste de ton code de validation et de seeding reste identique)
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
