import { db } from "../schema";
import type { Profile } from "../../domain/profile";

// ... (Garder les fonctions de Reads inchangées)

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Inserts or replaces a profile in the database.
 * The sync event is automatically handled by Dexie hooks in schema.ts
 */
export async function upsertProfile(profile: Profile): Promise<void> {
  await db.transaction("rw", [db.profiles, db.syncEvents], async () => {
    const existing = await db.profiles.get(profile.id);
    
    // CORRECTION : Uniquement bloquer si le NOUVEAU profil que l'on essaie d'insérer prétend 
    // toujours être un asset d'origine "builtin", ou si on tente d'écraser un builtin sans changer sa source.
    if (existing?.source === "builtin" && profile.source === "builtin") {
      throw new Error(`Cannot overwrite deployment asset profile: ${profile.id}`);
    }

    // Déclenche automatiquement le hook "creating" ou "updating" de schema.ts
    await db.profiles.put(profile);
  });
}

/**
 * Installs or refreshes a profile shipped with the application.
 */
export async function seedBuiltinProfile(profile: Profile): Promise<void> {
  if (profile.source !== "builtin") {
    throw new Error(`Profile "${profile.id}" is not a builtin profile.`);
  }

  await db.transaction("rw", db.profiles, async () => {
    const existing = await db.profiles.get(profile.id);
    if (existing !== undefined && existing.source !== "builtin") {
      throw new Error(`Builtin profile id conflicts with user profile: ${profile.id}`);
    }
    await db.profiles.put(profile);
  });
}

/**
 * Deletes a profile by id.
 * The tombstone event is automatically handled by Dexie hooks in schema.ts
 */
export async function deleteProfile(id: string): Promise<void> {
  await db.transaction("rw", [db.profiles, db.syncEvents], async () => {
    // Déclenche automatiquement le hook "deleting" de schema.ts
    await db.profiles.delete(id);
  });
}

/**
 * Replaces all user-source profiles for a given standard.
 */
export async function replaceUserProfiles(
  standardId: string,
  profiles: Profile[],
): Promise<void> {
  await db.transaction("rw", [db.profiles, db.syncEvents], async () => {
    await db.profiles
      .where("standardId")
      .equals(standardId)
      .and((p) => p.source === "user")
      .delete();

    for (const profile of profiles) {
      // Déclenche automatiquement le hook pour chaque profil inséré
      await db.profiles.put(profile);
    }
  });
}
