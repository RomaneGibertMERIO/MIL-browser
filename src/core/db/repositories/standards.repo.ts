/**
 * Standards repository.
 *
 * All database reads and writes for StandardPlugin entities go through
 * this module. Standards are not frequently mutated — they are seeded once
 * on startup and updated only when the user imports a new version.
 *
 * Unlike profiles, standard mutations also log a sync event so that a team
 * sharing a database instance can propagate custom standard extensions.
 */

import { db } from "../schema";
import type { StandardPlugin, StandardNode } from "../../domain/standard";
import type { SyncEvent } from "../../domain/sync";
import { getDeviceId } from "../../utils/deviceId";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function logStandardEvent(
  operation: SyncEvent["operation"],
  payload: unknown,
): Promise<void> {
  const event: SyncEvent = {
    id: crypto.randomUUID(),
    deviceId: getDeviceId(),
    timestamp: Date.now(),
    operation,
    entity: "standard",
    payload,
  };
  await db.syncEvents.add(event);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Returns all standards currently in the database. */
export async function getAllStandards(): Promise<StandardPlugin[]> {
  return db.standards.toArray();
}

/**
 * Returns a single standard by its manifest.id, or undefined if not found.
 */
export async function getStandardById(id: string): Promise<StandardPlugin | undefined> {
  return db.standards.get(id);
}

/**
 * Returns all builtin standards (those shipped with the application).
 */
export async function getBuiltinStandards(): Promise<StandardPlugin[]> {
  return db.standards.where("manifest.isBuiltin").equals(1).toArray();
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Inserts or replaces a standard plugin and logs a sync event.
 * Used both by the initial seeding pass and by the manual import flow.
 */
export async function upsertStandard(standard: StandardPlugin): Promise<void> {
  await db.transaction("rw", [db.standards, db.syncEvents], async () => {
    await db.standards.put(standard);
    await logStandardEvent("upsert", standard);
  });
}

/** Installs a bundled standard without recording it as a user sync event. */
export async function seedBuiltinStandard(standard: StandardPlugin): Promise<void> {
  if (!standard.manifest.isBuiltin) {
    throw new Error(`Standard "${standard.manifest.id}" is not builtin.`);
  }
  const existing = await db.standards.get(standard.manifest.id);
  if (existing !== undefined && !existing.manifest.isBuiltin) {
    throw new Error(`Builtin standard id conflicts with user standard: ${standard.manifest.id}`);
  }
  await db.standards.put(standard);
}

/**
 * Replaces the nodes array of an existing standard without touching the
 * rest of the plugin (schema, migrations, manifest). Used by the taxonomy
 */
export async function updateStandardNodes(
  standardId: string,
  nodes: StandardNode[],
): Promise<void> {
  const standard = await getStandardById(standardId);
  if (standard === undefined) {
    throw new Error(`Standard "${standardId}" not found.`);
  }

  // PLUG DE SURCHARGE : Si elle était builtin, on la transforme en version "user" 
  // pour protéger les modifications locales de l'utilisateur.
  const updatedStandard: StandardPlugin = {
    ...standard,
    manifest: {
      ...standard.manifest,
      isBuiltin: false // Devient une extension utilisateur !
    },
    nodes,
  };

  await upsertStandard(updatedStandard);
}

/**
 * Creates a brand-new user standard with an empty taxonomy and empty schema.
 * The caller is responsible for ensuring the id does not already exist.
 */
export async function createStandard(standard: StandardPlugin): Promise<void> {
  const existing = await getStandardById(standard.manifest.id);
  if (existing !== undefined) {
    throw new Error(`A standard with id "${standard.manifest.id}" already exists.`);
  }
  await upsertStandard(standard);
}

/**
 * Deletes a standard and all profiles that reference it, in a single
 * transaction. Also logs deletion events for each removed profile.
 *
 * Only user-imported standards may be deleted. Attempting to delete a
 * builtin standard is a caller error and will throw.
 */
export async function deleteStandardAndProfiles(id: string): Promise<void> {
  const standard = await getStandardById(id);
  if (!standard) return;
  if (standard.manifest.isBuiltin) {
    throw new Error(`Cannot delete builtin standard "${id}".`);
  }

  await db.transaction("rw", [db.standards, db.profiles, db.syncEvents], async () => {
    // Collect profile ids before deletion for tombstone events.
    const profileIds = await db.profiles
      .where("standardId")
      .equals(id)
      .primaryKeys();

    await db.profiles.where("standardId").equals(id).delete();

    for (const profileId of profileIds) {
      const event: SyncEvent = {
        id: crypto.randomUUID(),
        deviceId: getDeviceId(),
        timestamp: Date.now(),
        operation: "delete",
        entity: "profile",
        payload: { id: profileId },
      };
      await db.syncEvents.add(event);
    }

    await db.standards.delete(id);
    await logStandardEvent("delete", { id });
  });
}
