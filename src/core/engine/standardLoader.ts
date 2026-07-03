/**
 * Standard plugin loader.
 *
 * Responsible for seeding builtin standard plugins into IndexedDB on
 * application startup. It is called once from the application bootstrap
 * sequence before any UI is rendered.
 */

import { StandardPluginSchema } from "../domain/standard";
import { ProfileSchema } from "../domain/profile";
import type { StandardPlugin } from "../domain/standard";
import { getStandardById, upsertStandard } from "../db/repositories/standards.repo";
import { getProfilesByStandard, getProfileById, upsertProfile } from "../db/repositories/profiles.repo";
import { migrateProfiles } from "./migrationEngine";

// ---------------------------------------------------------------------------
// Runtime environment detection
// ---------------------------------------------------------------------------

const isElectron =
  typeof navigator !== "undefined" &&
  navigator.userAgent.toLowerCase().includes("electron");

// ---------------------------------------------------------------------------
// Builtin standard file list
// ---------------------------------------------------------------------------

const BUILTIN_STANDARD_FILES: string[] = [
  "mil-std-810h.json",
  "stanag-4370-aectp-230.json",
];

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

export async function loadBuiltinStandards(): Promise<StandardLoadResult[]> {
  const results: StandardLoadResult[] = [];

  for (const filename of BUILTIN_STANDARD_FILES) {
    const result = await loadOneStandard(filename);
    results.push(result);
  }

  return results;
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
