/**
 * Profile repository.
 *
 * All database reads and writes for Profile entities go through this module.
 * No component or engine accesses the `db.profiles` table directly.
 *
 * Every mutating operation also appends a SyncEvent so the sync engine can
 * push changes to the server without needing to know when writes happened.
 */

import { db } from "../schema";
import type { Profile } from "../../domain/profile";
import type { SyncEvent } from "../../domain/sync";
import { getDeviceId } from "../../utils/deviceId";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds a SyncEvent wrapping a profile mutation and persists it.
 * This is called inside every write operation so no write is ever unlogged.
 */
async function logProfileEvent(
  operation: SyncEvent["operation"],
  payload: unknown,
): Promise<void> {
  const event: SyncEvent = {
    id: crypto.randomUUID(),
    deviceId: getDeviceId(),
    timestamp: Date.now(),
    operation,
    entity: "profile",
    payload,
  };
  await db.syncEvents.add(event);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Returns all profiles in the database, sorted by updatedAt descending. */
export async function getAllProfiles(): Promise<Profile[]> {
  return db.profiles.orderBy("updatedAt").reverse().toArray();
}

/**
 * Returns all profiles belonging to the given standard, ordered by updatedAt
 * descending. This is the primary read path for the Assistant and Browse views.
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
 * Used by the Browse view when displaying profiles for a selected node.
 */
export async function getProfilesByNodeId(nodeId: string): Promise<Profile[]> {
  return db.profiles.where("nodeId").equals(nodeId).toArray();
}

/**
 * Returns all profiles whose standardId and nodeId both match.
 * Uses the compound index [standardId+nodeId] for a single-range query.
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
 * Inserts or replaces a profile in the database and logs a sync event.
 * The caller is responsible for setting updatedAt to the current timestamp
 * before calling this function.
 */
export async function upsertProfile(profile: Profile): Promise<void> {
  await db.transaction("rw", [db.profiles, db.syncEvents], async () => {
    await db.profiles.put(profile);
    await logProfileEvent("upsert", profile);
  });
}

/**
 * Deletes a profile by id and logs a tombstone sync event.
 * Silently succeeds if the profile does not exist.
 */
export async function deleteProfile(id: string): Promise<void> {
  await db.transaction("rw", [db.profiles, db.syncEvents], async () => {
    await db.profiles.delete(id);
    await logProfileEvent("delete", { id });
  });
}

/**
 * Replaces all user-source profiles for a given standard in a single
 * transaction. Used by the bulk-import flow.
 * Builtin profiles are not affected.
 */
export async function replaceUserProfiles(
  standardId: string,
  profiles: Profile[],
): Promise<void> {
  await db.transaction("rw", [db.profiles, db.syncEvents], async () => {
    // Remove all existing user profiles for this standard.
    await db.profiles
      .where("standardId")
      .equals(standardId)
      .and((p) => p.source === "user")
      .delete();

    // Insert the new batch.
    for (const profile of profiles) {
      await db.profiles.put(profile);
      await logProfileEvent("upsert", profile);
    }
  });
}
