import { db } from "../schema";
import type { Profile } from "../../domain/profile";
import { useAppStore } from "../../../store/appStore";
import { getDeviceId } from "../../utils/deviceId";

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
    // Synchro interne (pull/seed/soumission/résolution) : on ne stage AUCUN
    // événement — l'appelant a positionné db.isSyncingInternal.
    if (db.isSyncingInternal) {
      await db.profiles.put(profile);
      return;
    }

    // Édition/création utilisateur : on écrit l'objet ET son événement de synchro
    // de façon DÉTERMINISTE (dans la transaction, hook neutralisé), pour qu'il
    // soit visible dès le refreshLocalChanges que l'appelant enchaîne. Sinon les
    // hooks "creating"/"updating" écrivent l'événement en différé (setTimeout) et
    // le refresh immédiat le manque : la modification n'apparaissait dans la Sync
    // qu'à l'action suivante (bug "il faut le faire deux fois").
    const before = await db.profiles.get(profile.id);
    const existingEvent = await db.syncEvents.get(profile.id);
    const isNew = before === undefined;

    db.isSyncingInternal = true;
    try {
      await db.profiles.put(profile);
    } finally {
      db.isSyncingInternal = false;
    }

    // Built-in d'usine non converti : pas de staging (cohérent avec les hooks).
    if (profile.source === "builtin") return;

    // "create" figé à la création, préservé ensuite (Created vs Modified).
    const resolvedOrigin = ((existingEvent as any)?.origin ?? (isNew ? "create" : "update")) as "create" | "update";
    await db.syncEvents.put({
      id: profile.id,
      deviceId: getDeviceId(),
      timestamp: Date.now(),
      operation: "upsert",
      entity: "profile",
      // Objet complet : pas de reconstruction obj+mods (pas de bug de clés
      // pointées imbriquées), le diff voit donc bien les changements de champs.
      payload: profile,
      // Référence du diff : état d'avant la 1re modif non synchronisée, conservé
      // à travers les éditions. On le garde AUSSI pour un objet "Created" édité
      // après sa création (état = version créée), afin de montrer ce qui a été
      // changé depuis la création. `previous` ne sert QU'À L'AFFICHAGE (jamais au
      // submit/pull/approve). Un objet fraîchement créé (isNew) n'a rien avant.
      previous: isNew ? undefined : ((existingEvent as any)?.previous ?? before),
      origin: resolvedOrigin,
    });
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
    // "Officiel" = déjà approuvé, OU dérivé d'un officiel. Le 2e cas se lit via
    // l'événement (origin "update") tant qu'il existe, ET via `proposalOrigin`
    // ("update") qui SURVIT à la soumission (l'événement, lui, est purgé au push).
    // Sans ce dernier, supprimer un officiel édité PUIS poussé le hard-supprimait
    // sans revue (viole spec §17).
    const wasOfficial =
      existing.status === "approved" ||
      (event as any)?.origin === "update" ||
      (existing as any).proposalOrigin === "update";
    if (wasOfficial) {
      // upsertProfile stage l'événement de façon DÉTERMINISTE (origin "update"
      // conservé, payload portant pendingDeletion) → la demande de suppression
      // apparaît dans la Sync dès le refreshLocalChanges que l'appelant enchaîne.
      await upsertProfile({ ...existing, status: "local", pendingDeletion: true });
      return { reviewRequested: true };
    }
  }

  // Non-officiel, en mode partagé — deux cas :
  //  • Brouillon LOCAL jamais poussé (status "local") : ABSENT du dépôt central →
  //    aucune trace à laisser. On purge simplement son événement de synchro : il
  //    DISPARAÎT de la liste de synchro (rien à « supprimer » côté central).
  //  • Soumission déjà poussée (status "pending") : PRÉSENTE au central → pierre
  //    tombale, pour la retirer au prochain push (= retrait de la proposition).
  // Écriture DÉTERMINISTE (hook neutralisé) pour être visible dès le refresh.
  const wasPushed = existing?.status === "pending";
  const was = db.isSyncingInternal;
  db.isSyncingInternal = true;
  try {
    await db.profiles.delete(id);
  } finally {
    db.isSyncingInternal = was;
  }
  if (existing && wasPushed) {
    await db.syncEvents.put({
      id,
      deviceId: getDeviceId(),
      timestamp: Date.now(),
      operation: "delete",
      entity: "profile",
      payload: { id, name: existing.name, standardId: existing.standardId },
    });
  } else {
    await db.syncEvents.delete(id);
  }
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
