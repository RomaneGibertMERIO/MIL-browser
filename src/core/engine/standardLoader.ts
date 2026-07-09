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
// Importation directe du fichier JSON
// ---------------------------------------------------------------------------
// On importe directement le fichier. Si ton fichier est dans le dossier 'public',
// tu peux utiliser un chemin relatif (ex: "../../../public/database.json").
// Adapte le chemin relatif ci-dessous selon la position réelle de ton fichier :
import globalDatabase from "../../../public/database.json";

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
  // Plus besoin de fetch ! On utilise directement l'objet importé statiquement.
  const globalData = globalDatabase as any;

  if (!globalData) {
    return [{ 
      id: "global-seed", 
      status: "error", 
      message: `database.json introuvable au moment de la compilation.` 
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
// loadStandardFromFile
// ---------------------------------------------------------------------------

export async function loadStandardFromFile(file: File): Promise<StandardPlugin> {
  const text = await file.text();
  const raw: unknown = JSON.parse(text);
  return StandardPluginSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function loadOneStandard(filename: string): Promise<StandardLoadResult> {
  const basePath = isElectron ? "./standards/" : "/standards/";
  const url = basePath + filename;

  let raw: unknown;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return {
        id: filename,
        status: "error",
        message: `HTTP ${response.status} when fetching ${url}`,
      };
    }

    raw = await response.json();
  } catch (err) {
    return {
      id: filename,
      status: "error",
      message: `Network error fetching ${url}: ${String(err)}`,
    };
  }

  let plugin: StandardPlugin;

  try {
    plugin = StandardPluginSchema.parse(raw);
  } catch (err) {
    return {
      id: filename,
      status: "error",
      message: `Validation failed for ${url}: ${String(err)}`,
    };
  }

  const id = plugin.manifest.id;
  const existing = await getStandardById(id);

  if (
    existing !== undefined &&
    existing.manifest.schemaVersion >= plugin.manifest.schemaVersion
  ) {
    return { id, status: "unchanged" };
  }

  await upsertStandard(plugin);

  const profileFile = BUILTIN_PROFILE_FILES[filename];

  if (profileFile !== undefined) {
    const profileUrl = isElectron
      ? "./standards/" + profileFile
      : "/standards/" + profileFile;

    await seedBuiltinProfiles(profileUrl);
  }

  if (existing !== undefined) {
    await migrateExistingProfiles(plugin);
    return { id, status: "updated" };
  }

  return { id, status: "seeded" };
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

async function migrateExistingProfiles(
  standard: StandardPlugin
): Promise<void> {
  const profiles = await getProfilesByStandard(standard.manifest.id);
  const migrated = migrateProfiles(profiles, standard);

  for (let i = 0; i < profiles.length; i++) {
    const before = profiles[i];
    const after = migrated[i];

    if (
      before !== undefined &&
      after !== undefined &&
      before.schemaVersion !== after.schemaVersion
    ) {
      await upsertProfile(after);
    }
  }
}

// ---------------------------------------------------------------------------
// Seed profiles
// ---------------------------------------------------------------------------

async function seedBuiltinProfiles(url: string): Promise<void> {
  let raw: unknown;

  try {
    const response = await fetch(url);
    if (!response.ok) return;
    raw = await response.json();
  } catch {
    return;
  }

  if (!Array.isArray(raw)) return;

  for (const item of raw) {
    const parsed = ProfileSchema.safeParse(item);
    if (!parsed.success) continue;

    const existing = await getProfileById(parsed.data.id);

    if (existing === undefined) {
      await upsertProfile(parsed.data);
    }
  }
}
