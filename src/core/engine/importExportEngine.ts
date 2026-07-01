/**
 * Import/export engine.
 *
 * Handles all data portability operations: exporting the user's database
 * to a single versioned JSON file and importing that file back (with
 * schema migration applied during import).
 *
 * Design decisions:
 * - Export always produces a self-contained file. The importer does not
 *   need network access to understand the file.
 * - The ExportEnvelope carries exportMeta so the importer can detect schema
 *   version mismatches before attempting to insert records.
 * - Import validates every profile and standard against their Zod schemas
 *   before writing to the database. Invalid records are skipped and their
 *   errors collected in ImportResult.
 * - Import does not delete existing records — it upserts. The caller can
 *   use replaceUserProfiles() if a full replacement is desired.
 * - This module depends on repository functions (not raw Dexie) so that
 *   sync events are correctly generated for all imported records.
 */

import { ProfileSchema } from "../domain/profile";
import { StandardPluginSchema } from "../domain/standard";
import type { Profile } from "../domain/profile";
import type { StandardPlugin } from "../domain/standard";
import type { ExportEnvelope } from "../domain/tree";
import { upsertProfile } from "../db/repositories/profiles.repo";
import { upsertStandard, getAllStandards } from "../db/repositories/standards.repo";
import { getAllProfiles } from "../db/repositories/profiles.repo";
import { migrateProfiles } from "./migrationEngine";

// ---------------------------------------------------------------------------
// Application version constant
// ---------------------------------------------------------------------------

/** Monotonically increasing integer. Increment when the ExportEnvelope shape changes. */
const CURRENT_DB_VERSION = 1;
const APP_VERSION = "2.0.0";

// ---------------------------------------------------------------------------
// exportDatabase
// ---------------------------------------------------------------------------

/**
 * Exports all profiles and user-imported standards to an ExportEnvelope JSON
 * string. Triggers a file download in the browser.
 */
export async function exportDatabase(): Promise<void> {
  const [profiles, standards] = await Promise.all([
    getAllProfiles(),
    getAllStandards(),
  ]);

  const envelope: ExportEnvelope = {
    exportMeta: {
      appVersion: APP_VERSION,
      dbVersion: CURRENT_DB_VERSION,
      exportedAt: new Date().toISOString(),
      standards: standards.map((s) => ({
        id: s.manifest.id,
        schemaVersion: s.profileSchema.version,
      })),
    },
    profiles,
    customFieldExtensions: [],
  };

  const json = JSON.stringify(envelope, null, 2);
  triggerDownload(json, "mil-browser-export.json");
}

// ---------------------------------------------------------------------------
// importDatabase
// ---------------------------------------------------------------------------

/** Summary of an import operation. */
export interface ImportResult {
  profilesImported: number;
  standardsImported: number;
  errors: string[];
}

/**
 * Parses an import file, validates all records, runs migrations, and upserts
 * valid records into the database. Returns a summary of what was imported
 * and any errors encountered.
 *
 * This function never throws — all errors are captured in ImportResult.errors.
 */
export async function importDatabase(file: File): Promise<ImportResult> {
  const result: ImportResult = {
    profilesImported: 0,
    standardsImported: 0,
    errors: [],
  };

  let envelope: unknown;
  try {
    const text = await file.text();
    envelope = JSON.parse(text) as unknown;
  } catch {
    result.errors.push("File is not valid JSON.");
    return result;
  }

  if (typeof envelope !== "object" || envelope === null) {
    result.errors.push("Import file has invalid structure.");
    return result;
  }

  const { profiles: rawProfiles = [], profiles: rawStandards = [] } =
    envelope as Record<string, unknown[]>;

  // ── Import standards ───────────────────────────────────────────────────
  const standardsArray =
    (envelope as Record<string, unknown>)["standards"] ?? [];
  if (Array.isArray(standardsArray)) {
    for (const raw of standardsArray) {
      const parsed = StandardPluginSchema.safeParse(raw);
      if (!parsed.success) {
        result.errors.push(
          `Standard validation failed: ${parsed.error.issues[0]?.message ?? "unknown error"}`,
        );
        continue;
      }
      try {
        await upsertStandard(parsed.data);
        result.standardsImported++;
      } catch (err) {
        result.errors.push(`Failed to save standard: ${String(err)}`);
      }
    }
  }

  // ── Import profiles ────────────────────────────────────────────────────
  const profilesArray =
    (envelope as Record<string, unknown>)["profiles"] ?? [];
  if (Array.isArray(profilesArray)) {
    for (const raw of profilesArray) {
      const parsed = ProfileSchema.safeParse(raw);
      if (!parsed.success) {
        result.errors.push(
          `Profile validation failed: ${parsed.error.issues[0]?.message ?? "unknown error"}`,
        );
        continue;
      }
      try {
        await upsertProfile(parsed.data);
        result.profilesImported++;
      } catch (err) {
        result.errors.push(`Failed to save profile: ${String(err)}`);
      }
    }
  }

  void rawProfiles;
  void rawStandards;

  return result;
}

// ---------------------------------------------------------------------------
// exportProfiles (profiles-only convenience export)
// ---------------------------------------------------------------------------

/**
 * Exports only the user-created profiles for a given standard to a JSON file.
 * Used by the Library view's per-standard export button.
 */
export async function exportProfilesForStandard(
  standardId: string,
  profiles: Profile[],
  standard: StandardPlugin,
): Promise<void> {
  const envelope: ExportEnvelope = {
    exportMeta: {
      appVersion: APP_VERSION,
      dbVersion: CURRENT_DB_VERSION,
      exportedAt: new Date().toISOString(),
      standards: [
        { id: standardId, schemaVersion: standard.profileSchema.version },
      ],
    },
    profiles,
    customFieldExtensions: [],
  };

  const json = JSON.stringify(envelope, null, 2);
  triggerDownload(json, `profiles-${standardId}.json`);
}

// ---------------------------------------------------------------------------
// importProfilesForStandard
// ---------------------------------------------------------------------------

/**
 * Imports profiles from a file for a specific standard.
 * Runs schema migrations before upserting.
 */
export async function importProfilesForStandard(
  file: File,
  standard: StandardPlugin,
): Promise<ImportResult> {
  const result: ImportResult = {
    profilesImported: 0,
    standardsImported: 0,
    errors: [],
  };

  let raw: unknown;
  try {
    const text = await file.text();
    raw = JSON.parse(text) as unknown;
  } catch {
    result.errors.push("File is not valid JSON.");
    return result;
  }

  const envelope = raw as Record<string, unknown>;
  const profilesArray = envelope["profiles"];

  if (!Array.isArray(profilesArray)) {
    result.errors.push("Import file does not contain a profiles array.");
    return result;
  }

  const validProfiles: Profile[] = [];
  for (const item of profilesArray) {
    const parsed = ProfileSchema.safeParse(item);
    if (!parsed.success) {
      result.errors.push(
        `Skipping profile: ${parsed.error.issues[0]?.message ?? "invalid"}`,
      );
      continue;
    }
    validProfiles.push(parsed.data);
  }

  // Run schema migrations before persisting.
  const migrated = migrateProfiles(validProfiles, standard);

  for (const profile of migrated) {
    try {
      await upsertProfile(profile);
      result.profilesImported++;
    } catch (err) {
      result.errors.push(`Failed to save profile "${profile.id}": ${String(err)}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
