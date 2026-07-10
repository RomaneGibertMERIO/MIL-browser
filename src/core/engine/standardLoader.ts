/**
 * Standard plugin loader.
 *
 * Single-file database seeder. Processes the global `database.json` asset
 * on startup, seeding both standards/taxonomies and built-in profiles.
 */
import { getAllStandards } from "../db/repositories/standards.repo";
import { z } from "zod";


import { StandardPluginSchema } from "../domain/standard";
import { ProfileSchema } from "../domain/profile";
import { getStandardById, seedBuiltinStandard, upsertStandard } from "../db/repositories/standards.repo";
import { getProfilesByStandard, seedBuiltinProfile, upsertProfile } from "../db/repositories/profiles.repo";
import { migrateProfiles } from "./migrationEngine";
import type { StandardPlugin } from "../domain/standard";
import builtinDatabase from "./database.json";
import { assertValidStandard, getProfileIntegrityErrors } from "./dataIntegrity";

// ---------------------------------------------------------------------------
// DÉCLARATION POUR TYPESCRIPT (Évite les erreurs de compilation sur window)
// ---------------------------------------------------------------------------
export interface StandardLoadResult {
  id: string;
  status: "seeded" | "updated" | "unchanged" | "error";
  message?: string;
}

// ---------------------------------------------------------------------------
// Main Entry Point (Built-in Seed)
// ---------------------------------------------------------------------------

/**
 * Loads everything from the unique global database via the Electron bridge.
 */
export async function loadBuiltinStandards(): Promise<StandardLoadResult[]> {
  try {
    // 1. Traiter les Standards / Taxonomies
    const standardResults = await seedStandards(builtinDatabase.standards ?? []);

    // 2. Traiter les Profils globaux
    await seedBuiltinProfiles(builtinDatabase.profiles ?? []);

    return standardResults;
  } catch (err) {
    return [{ id: "global-seed", status: "error", message: `Failed to execute global seed: ${String(err)}` }];
  }
}

// ---------------------------------------------------------------------------
// loadStandardFromFile (Utilisé par StandardsPage.tsx pour l'import manuel)
// ---------------------------------------------------------------------------

/**
 * Parses a manually uploaded JSON file, validates it, and saves it in the DB.
 */
export async function loadStandardFromFile(file: File): Promise<StandardPlugin> {
  const text = await file.text();
  const raw: unknown = JSON.parse(text);
  
  // Validation Zod du fichier importé
  const plugin = StandardPluginSchema.parse(raw);
  assertValidStandard(plugin);
  const existing = await getStandardById(plugin.manifest.id);
  if (plugin.manifest.isBuiltin || existing?.manifest.isBuiltin) {
    throw new Error("Deployment standards cannot be replaced through file import.");
  }
  if (existing !== undefined && existing.manifest.schemaVersion > plugin.manifest.schemaVersion) {
    throw new Error(
      `Cannot downgrade standard "${plugin.manifest.id}" from schema version ${existing.manifest.schemaVersion} to ${plugin.manifest.schemaVersion}.`,
    );
  }
  
  // Sauvegarde dans le repository Dexie
  await upsertStandard(plugin);
  
  return plugin;
}

// ---------------------------------------------------------------------------
// Internal Seeders
// ---------------------------------------------------------------------------

async function seedStandards(standardsRaw: unknown[]): Promise<StandardLoadResult[]> {
  const results: StandardLoadResult[] = [];

  for (const item of standardsRaw) {
    try {
      const plugin = StandardPluginSchema.parse(item);
      console.log("Parsed standard:", plugin.manifest.id);
      assertValidStandard(plugin);
      console.log("Validated standard:", plugin.manifest.id);
      const id = plugin.manifest.id;
      const existing = await getStandardById(id);
      
      // Si le standard existe déjà et que l'utilisateur l'a personnalisé (isBuiltin === false)
      // on ne l'écrase pas avec la version d'usine.
      if (existing !== undefined && !existing.manifest.isBuiltin) {
        results.push({ id, status: "unchanged", message: "User customized version preserved." });
        continue;
      }

      // Si le standard existe déjà et possède une version égale ou supérieure, on ne touche à rien
      if (existing !== undefined && existing.manifest.schemaVersion > plugin.manifest.schemaVersion) {
        results.push({ id, status: "unchanged" });
        continue;
      }

      if (existing !== undefined && existing.manifest.schemaVersion === plugin.manifest.schemaVersion) {
        // Refresh de sécurité uniquement si le standard en base est resté purement "builtin"
        await seedBuiltinStandard(plugin);
        console.log("Refreshed builtin standard:", id);
        results.push({ id, status: "unchanged" });
        continue;
      }

      await seedBuiltinStandard(plugin);

      if (existing !== undefined) {
        // Exécuter les migrations si la structure change
        await migrateExistingProfiles(plugin);
        results.push({ id, status: "updated" });
      } else {
        results.push({ id, status: "seeded" });
      }
    } catch (err) {
      console.error(
        "FAILED STANDARD:",
        (item as any)?.manifest?.id,
        err
      );
      
        if (err instanceof z.ZodError) {
        console.table(err.issues);
         }
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
  console.log("Profiles start");

console.log(
  "Standards in DB:",
  (await getAllStandards()).map(s => s.manifest.id)
);

console.log(
  "Lookup:",
  await getStandardById("mil-std-810h")
);
  
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

    const standard = await getStandardById(parsed.data.standardId);
    if (standard === undefined) {
      throw new Error(`Builtin profile "${parsed.data.id}" references unknown standard "${parsed.data.standardId}".`);
    }
    const integrityErrors = getProfileIntegrityErrors(parsed.data, standard);
    if (integrityErrors.length > 0) {
      throw new Error(`Invalid builtin profile "${parsed.data.id}": ${integrityErrors.join("; ")}`);
    }
    await seedBuiltinProfile(parsed.data);

    // On n'insère le profil que s'il n'existe pas déjà pour protéger l'espace utilisateur
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

    if (before !== undefined && after !== undefined && before.source === "user" && before.schemaVersion !== after.schemaVersion) {
      await upsertProfile(after);
    }
  }
}
