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
import type { Profile } from "../domain/profile";
import type { StandardPlugin } from "../domain/standard";
import type { ExportEnvelope } from "../domain/tree";
import { upsertProfile, getAllProfiles } from "../db/repositories/profiles.repo";
import { upsertStandard, getAllStandards } from "../db/repositories/standards.repo";
import { migrateProfiles } from "./migrationEngine";

// ---------------------------------------------------------------------------
// Application version constant
// ---------------------------------------------------------------------------

const CURRENT_DB_VERSION = 1;
const APP_VERSION = "2.0.0";

// ---------------------------------------------------------------------------
// exportDatabase
// ---------------------------------------------------------------------------

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

export interface ImportResult {
  profilesImported: number;
  standardsImported: number;
  errors: string[];
}

export async function importDatabase(file: File): Promise<ImportResult> {
  const result: ImportResult = {
    profilesImported: 0,
    standardsImported: 0,
    errors: [],
  };

  let envelope: any;
  try {
    const text = await file.text();
    envelope = JSON.parse(text);
    console.log("📥 [Import Engine] Fichier JSON décodé :", envelope);
  } catch {
    result.errors.push("File is not valid JSON.");
    console.error("❌ [Import Engine] Le fichier n'est pas un JSON valide.");
    return result;
  }

  if (typeof envelope !== "object" || envelope === null) {
    result.errors.push("Import file has invalid structure.");
    console.error("❌ [Import Engine] Structure de l'enveloppe JSON invalide.");
    return result;
  }

  // 1️⃣ ─── IMPORT DES NORMES (STANDARDS) ───
  if (envelope.exportMeta && Array.isArray(envelope.exportMeta.standards)) {
    console.log(`📊 [Import Engine] Nombre de normes détectées : ${envelope.exportMeta.standards.length}`);
    
    for (const std of envelope.exportMeta.standards) {
      try {
        // Correction de la structure ici : pas d'id racine, tout va dans manifest et les tableaux obligatoires sont initialisés vides
        await upsertStandard({
          manifest: {
            id: std.id,
            label: std.id.toUpperCase(),
            description: `Imported standard ${std.id.toUpperCase()}`,
            version: "1.0.0",
            schemaVersion: std.schemaVersion ?? 1,
            organization: "User",
            isBuiltin: false
          },
          nodes: [], // Requis par le type de la norme
          profileSchema: {
            version: std.schemaVersion ?? 1,
            fields: [],
            datasetColumns: [
              { key: "time", label: "Time", unit: "", axis: "x", type: "string", required: true, color: null },
              { key: "temp_c", label: "Temperature", unit: "°C", axis: "none", type: "number", required: true, color: null },
              { key: "rh_percent", label: "Humidity", unit: "%", axis: "none", type: "number", required: true, color: null }
            ]
          },
          migrations: [] // Requis par le type de la norme
        } as unknown as StandardPlugin); // Typecast de sécurité si l'interface possède d'autres champs requis
        
        result.standardsImported++;
      } catch (err: any) {
        result.errors.push(`Failed to import standard ${std.id}: ${err.message}`);
        console.error(`❌ [Import Engine] Erreur sur la norme ${std.id}:`, err);
      }
    }
  }

  // 2️⃣ ─── IMPORT DES PROFILS ───
  const profilesArray = envelope.profiles ?? [];
  if (Array.isArray(profilesArray)) {
    console.log(`📊 [Import Engine] Nombre de profils détectés : ${profilesArray.length}`);

    for (const item of profilesArray) {
      const parsed = ProfileSchema.safeParse(item);

      if (!parsed.success) {
        const errorMsg = `Profile validation failed (ID: ${item?.id ?? "Inconnu"}): ${parsed.error.issues[0]?.message ?? "unknown error"}`;
        result.errors.push(errorMsg);
        console.error("❌ [Import Engine] Échec de validation Zod sur le profil :", parsed.error.format(), "Objet brut :", item);
        continue;
      }

      try {
        await upsertProfile(parsed.data);
        result.profilesImported++;
      } catch (err: any) {
        result.errors.push(`Database write failed for profile ${item.name}: ${err.message}`);
        console.error(`❌ [Import Engine] Impossible d'écrire le profil ${item.name} en BDD:`, err);
      }
    }
  }

  console.log(`✅ [Import Engine] Fin de l'opération. Normes: ${result.standardsImported}, Profils: ${result.profilesImported}, Erreurs: ${result.errors.length}`);
  return result;
}

// ---------------------------------------------------------------------------
// exportProfilesForStandard
// ---------------------------------------------------------------------------

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
