/**
 * Import/export engine.
 *
 * Handles all data portability operations: exporting the user's database
 * to a single versioned JSON file and importing that file back (with
 * schema migration applied during import).
 */

import { ProfileSchema } from "../domain/profile";
import type { Profile } from "../domain/profile";
import type { StandardPlugin } from "../domain/standard";
import type { ExportEnvelope } from "../domain/tree";
import { upsertProfile, getAllProfiles } from "../db/repositories/profiles.repo";
import { upsertStandard, getAllStandards } from "../db/repositories/standards.repo";
import { migrateProfiles } from "./migrationEngine";
import { StandardPluginSchema } from "../domain/standard";

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
      // FIX TS7006: Typage explicite du paramètre 's' ici en tant que StandardPlugin
      standards: standards.map((s: StandardPlugin) => ({
        id: s.manifest.id,
        schemaVersion: s.profileSchema.version,
      })),
    },
    standards,
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
  if (Array.isArray(envelope.standards)) {
    console.log(`📊 [Import] ${envelope.standards.length} standards trouvés`);
    for (const item of envelope.standards) {
      const parsed = StandardPluginSchema.safeParse(item);
      if (!parsed.success) {
        const errorMsg = `Profile validation failed (ID: ${item?.id ?? "Inconnu"}): ${parsed.error.issues[0]?.message ?? "unknown error"}`;
        result.errors.push(errorMsg);
        
        console.error(`❌ [Import Engine] Échec de validation Zod sur le profil : ${item?.name ?? "Sans nom"}`);
        console.table(
          parsed.error.issues.map(i => ({
            path: i.path.join("."),
            code: i.code,
            message: i.message,
            received: (i as any).received ?? "unknown"
          }))
        );
        console.log("Objet brut en cause :", item);
        continue;
      }
      try {
        await upsertStandard(parsed.data);
        result.standardsImported++;
      } catch (err) {
        result.errors.push(`Failed importing standard ${parsed.data.manifest.id}`);
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
    standards: [standard],
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
}
