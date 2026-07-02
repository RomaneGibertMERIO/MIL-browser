/**
 * Standard plugin loader.
 *
 * Responsible for seeding builtin standard plugins into IndexedDB on
 * application startup. It is called once from the application bootstrap
 * sequence before any UI is rendered.
 *
 * Seeding logic:
 * 1. Fetch each known builtin standard JSON from public/standards/.
 * 2. Validate the JSON against StandardPluginSchema (Zod).
 * 3. Check the stored version. If none exists, or if the stored
 *    schemaVersion is lower than the fetched one, upsert the standard.
 * 4. Run profile migrations for any stale profiles belonging to the
 *    newly updated standard.
 *
 * This loader never deletes existing user profiles — it only migrates them.
 *
 * Design decisions:
 * - The list of builtin standard file names is the only hardcoded value in
 *   the plugin system. Adding a new standard requires adding one entry to
 *   BUILTIN_STANDARD_FILES and placing the JSON in public/standards/.
 * - All network and DB errors are caught and surfaced as LoadResult entries
 *   so the caller can display a warning without crashing.
 * - fetch() is used (not import()) so the files are served as static assets
 *   and can be updated at deploy time without a code build.
 */

import { StandardPluginSchema } from "../domain/standard";
import { ProfileSchema } from "../domain/profile";
import type { StandardPlugin } from "../domain/standard";
import { getStandardById, upsertStandard } from "../db/repositories/standards.repo";
import { getProfilesByStandard, getProfileById, upsertProfile } from "../db/repositories/profiles.repo";
import { migrateProfiles } from "./migrationEngine";

// ---------------------------------------------------------------------------
// Builtin standard file list
// ---------------------------------------------------------------------------

/**
 * Filenames under public/standards/ that are shipped with the application.
 * Add new entries here when a new standard plugin is created.
 */
const BUILTIN_STANDARD_FILES: string[] = [
  "mil-std-810h.json",
  "stanag-4370-aectp-230.json",
];

/**
 * Map from standard plugin filename to its companion profiles seed file.
 * Profiles are only seeded once; they are not re-seeded on subsequent startups
 * unless the profile id does not exist in the database.
 */
const BUILTIN_PROFILE_FILES: Partial<Record<string, string>> = {
  "mil-std-810h.json": "mil-std-810h-profiles.json",
};

// ---------------------------------------------------------------------------
// LoadResult
// ---------------------------------------------------------------------------

export interface StandardLoadResult {
  id: string;
  status: "seeded" | "updated" | "unchanged" | "error";
  message?: string;
}

// ---------------------------------------------------------------------------
// loadBuiltinStandards
// ---------------------------------------------------------------------------

/**
 * Seeds all builtin standard plugins into IndexedDB.
 * Must be called once during application bootstrap before any view renders.
 * Safe to call on every startup — subsequent calls are effectively no-ops.
 */
export async function loadBuiltinStandards(): Promise<StandardLoadResult[]> {
  const results: StandardLoadResult[] = [];

  for (const filename of BUILTIN_STANDARD_FILES) {
    const result = await loadOneStandard(`/standards/${filename}`, filename);
    results.push(result);
  }

  return results;
}

// ---------------------------------------------------------------------------
// loadStandardFromFile (user-imported standard)
// ---------------------------------------------------------------------------

/**
 * Loads and validates a standard plugin from a user-provided File object.
 * Used by the Standards management page import flow.
 * Returns the parsed StandardPlugin on success, or throws on validation failure.
 */
export async function loadStandardFromFile(file: File): Promise<StandardPlugin> {
  const text = await file.text();
  const raw: unknown = JSON.parse(text);
  return StandardPluginSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function loadOneStandard(url: string, filename: string): Promise<StandardLoadResult> {
  let raw: unknown;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        id: url,
        status: "error",
        message: `HTTP ${response.status} when fetching ${url}`,
      };
    }
    raw = (await response.json()) as unknown;
  } catch (err) {
    return {
      id: url,
      status: "error",
      message: `Network error fetching ${url}: ${String(err)}`,
    };
  }

  let plugin: StandardPlugin;
  try {
    plugin = StandardPluginSchema.parse(raw);
  } catch (err) {
    return {
      id: url,
      status: "error",
      message: `Validation failed for ${url}: ${String(err)}`,
    };
  }

  const id = plugin.manifest.id;
  const existing = await getStandardById(id);

  if (existing !== undefined && existing.manifest.schemaVersion >= plugin.manifest.schemaVersion) {
    return { id, status: "unchanged" };
  }

  await upsertStandard(plugin);

  // Seed builtin profiles for this standard if a companion file exists.
  const profileFile = BUILTIN_PROFILE_FILES[filename];
  if (profileFile !== undefined) {
    await seedBuiltinProfiles(`/standards/${profileFile}`);
  }

  // Migrate any existing profiles that reference this standard.
  if (existing !== undefined) {
    await migrateExistingProfiles(plugin);
    return { id, status: "updated" };
  }

  return { id, status: "seeded" };
}

/**
 * Fetches all profiles for the given standard and applies pending migrations.
 * Upserts only those profiles that were actually changed.
 */
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

/**
 * Fetches and seeds builtin profile records from a companion JSON file.
 * Only inserts profiles that do not already exist in the database,
 * preventing re-seeding on subsequent startups.
 */
async function seedBuiltinProfiles(url: string): Promise<void> {
  let raw: unknown;
  try {
    const response = await fetch(url);
    if (!response.ok) return;
    raw = (await response.json()) as unknown;
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
