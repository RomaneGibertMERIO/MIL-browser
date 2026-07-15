import { db } from "../schema";
import type { Profile } from "../../domain/profile";
import type { SyncEvent } from "../../domain/sync";
import { getDeviceId } from "../../utils/deviceId";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Enregistre ou met à jour un événement de synchronisation de profil unique.
 */
async function logProfileEvent(
  operation: SyncEvent["operation"],
  payload: any,
): Promise<void> {
  // SÉCURITÉ : Si l'application est en train de synchroniser le réseau,
  // on ne journalise pas pour éviter les boucles et doublons.
  if ((db as any).isSyncingInternal) return;

  const entityId = operation === "delete" ? String(payload.id) : String(payload.id);

  const event: SyncEvent = {
    id: entityId, // L'ID de l'événement est l'ID du profil : écrase le doublon précédent
    deviceId: getDeviceId(),
    timestamp: Date.now(),
    operation,
    entity: "profile",
    payload,
  };
  
  // .put() écrase au lieu d'empiler avec .add()
  await db.syncEvents.put(event);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getAllProfiles(): Promise<Profile[]> {
  return db.profiles.orderBy("updatedAt").reverse().toArray();
}

export async function getProfilesByStandard(standardId: string): Promise<Profile[]> {
  return db.profiles
    .where("standardId")
    .equals(standardId)
    .reverse()
    .sortBy("updatedAt");
}

export async function getProfilesByNodeId(nodeId: string): Promise<Profile[]> {
  return db.profiles.where("nodeId").equals(nodeId).toArray();
}

export async function getProfilesByStandardAndNode(
  standardId: string,
  nodeId: string,
): Promise<Profile[]> {
  return db.profiles
    .where("[standardId+nodeId]")
    .equals([standardId, nodeId])
    .toArray();
}

export async function getProfileById(id: string): Promise<Profile | undefined> {
  return db.profiles.get(id);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function upsertProfile(profile: Profile): Promise<void> {
  await db.transaction("rw", [db.profiles, db.syncEvents], async () => {
    const existing = await db.profiles.get(profile.id);
    
    if (existing?.source === "builtin") {
      throw new Error(`Cannot overwrite deployment asset profile: ${profile.id}`);
    }

    await db.profiles.put(profile);
    await logProfileEvent("upsert", profile);
  });
}

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

export async function deleteProfile(id: string): Promise<void> {
  await db.transaction("rw", [db.profiles, db.syncEvents], async () => {
    await db.profiles.delete(id);
    await logProfileEvent("delete", { id });
  });
}

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
      await db.profiles.put(profile);
      await logProfileEvent("upsert", profile);
    }
  });
}
