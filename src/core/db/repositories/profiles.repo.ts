import { db } from "../schema";
import type { Profile } from "../../domain/profile";
import { useAppStore } from "../../../store/appStore";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Returns all profiles in the database, sorted by updatedAt descending. */
export async function getAllProfiles(): Promise<Profile[]> {
  return db.profiles.orderBy("updatedAt").reverse().toArray();
}

/**
 * Returns all profiles belonging to the given standard, ordered by updatedAt
 * descending.
 */
export async function getProfilesByStandard(standardId: string): Promise<Profile[]> {
  return db.profiles
    .where("standardId")
    .equals(standardId)
    .reverse()
    .sortBy("updatedAt");
}

/**
 * Returns all profiles whose nodeId exactly matches the given node.
 */
export async function getProfilesByNodeId(nodeId: string): Promise<Profile[]> {
  return db.profiles.where("nodeId").equals(nodeId).toArray();
}

/**
 * Returns all profiles whose standardId and nodeId both match.
 */
export async function getProfilesByStandardAndNode(
  standardId: string,
  nodeId: string,
): Promise<Profile[]> {
  return db.profiles
    .where("[standardId+nodeId]")
    .equals([standardId, nodeId])
    .toArray();
}

/**
 * Returns a single profile by its id, or undefined if not found.
 */
export async function getProfileById(id: string): Promise<Profile | undefined> {
  return db.profiles.get(id);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Inserts or replaces a profile in the database.
 * The sync event is automatically handled by Dexie hooks in schema.ts
 */
export async function upsertProfile(profile: Profile): Promise<void> {
  await db.transaction("rw", [db.profiles, db.syncEvents], async () => {
    //const existing = await db.profiles.get(profile.id);
    
    // CORRECTION : Uniquement bloquer si le NOUVEAU profil que l'on essaie d'insérer prétend 
    // toujours être un asset d'origine "builtin", ou si on tente d'écraser un builtin sans changer sa source.
    // COMMENTE POUR TEST TEMPORAIRE
    /*if (existing?.source === "builtin" && profile.source === "builtin") {
      throw new Error(`Cannot overwrite deployment asset profile: ${profile.id}`);
    }*/

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
    // Un profil de même id mais avec une source non-builtin ("user"/shared) est
    // la version PUBLIÉE/synchronisée de ce même profil du socle : publier le
    // socle built-in vers un dépôt conserve l'id mais bascule source -> "user"
    // (pour qu'il s'affiche "Official"). On la PRÉSERVE — on n'écrase jamais la
    // version synchronisée de l'utilisateur et on ne crashe pas le démarrage sur
    // cette collision d'id (même logique que seedStandards pour les standards).
    if (existing !== undefined && existing.source !== "builtin") {
      return;
    }
    await db.profiles.put(profile);
  });
}

/**
 * Deletes a profile by id.
 * The tombstone event is automatically handled by Dexie hooks in schema.ts
 */
export async function deleteProfile(id: string): Promise<{ reviewRequested: boolean }> {
  // Autonome : suppression PUREMENT locale — pas de pierre tombale (elle
  // « fuirait » vers un dépôt à la prochaine connexion) et purge de l'événement
  // de synchro résiduel.
  if (useAppStore.getState().repoMode === "local") {
    db.isSyncingInternal = true;
    try {
      await db.profiles.delete(id);
    } finally {
      db.isSyncingInternal = false;
    }
    await db.syncEvents.delete(id);
    return { reviewRequested: false };
  }

  // Partagé : supprimer un objet OFFICIEL — ou une copie locale DÉRIVÉE d'un
  // objet officiel (édité puis sauvegardé, donc syncEvent origin "update") — doit
  // passer par la revue admin (spec §17). On ne l'efface pas : on le marque en
  // demande de suppression, statut "local" (= modification non soumise, donc
  // protégée du pull qui écraserait autrement la marque avec la version centrale)
  // portant `pendingDeletion`. Le push la fait passer "pending" ; l'admin
  // approuve (suppression réelle) ou refuse (retour en approved).
  const existing = await db.profiles.get(id);
  if (existing) {
    const event = await db.syncEvents.get(id);
    const wasOfficial = existing.status === "approved" || (event as any)?.origin === "update";
    if (wasOfficial) {
      await upsertProfile({ ...existing, status: "local", pendingDeletion: true });
      return { reviewRequested: true };
    }
  }

  // Création/brouillon purement local (jamais officiel) : suppression directe.
  await db.transaction("rw", [db.profiles, db.syncEvents], async () => {
    // Déclenche automatiquement le hook "deleting" de schema.ts
    await db.profiles.delete(id);
  });
  return { reviewRequested: false };
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
