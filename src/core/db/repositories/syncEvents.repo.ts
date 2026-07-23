/**
 * Sync events repository.
 *
 * Provides read access to the sync write-ahead log. Writes are performed
 * exclusively by the profile and standards repositories (via their internal
 * logXxxEvent helpers) — nothing else appends to this table.
 *
 * The sync engine uses this repository to pull unsynced events and to
 * prune acknowledged events after a successful push.
 */

import { db, standardSyncSummary } from "../schema";
import type { SyncEvent } from "../../domain/sync";
import { getDeviceId } from "../../utils/deviceId";

/**
 * Réécrit en résumé léger les événements de synchro de standards qui
 * contiennent encore la liste complète des noeuds (donc potentiellement des
 * images base64 de plusieurs Mo). Migration unique, exécutée au démarrage :
 * sans elle, les événements gonflés déjà présents continueraient de geler
 * refreshLocalChanges à chaque modification locale.
 *
 * @returns le nombre d'événements compactés.
 */
export async function compactStandardSyncEvents(): Promise<number> {
  let compacted = 0;
  const events = await db.syncEvents.where("entity").equals("standard").toArray();
  for (const ev of events) {
    const payload = ev.payload as any;
    // "nodes" présent = ancien format complet à alléger.
    if (payload && Array.isArray(payload.nodes)) {
      await db.syncEvents.put({ ...ev, payload: standardSyncSummary(payload) });
      compacted++;
    }
  }
  return compacted;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Returns all sync events from the current device that occurred after the
 * given Unix millisecond timestamp, ordered by timestamp ascending.
 * Used to build the push payload for the sync engine.
 */
export async function getUnsyncedEvents(sinceTimestamp: number): Promise<SyncEvent[]> {
  const deviceId = getDeviceId();
  return db.syncEvents
    .where("[deviceId+timestamp]")
    .between([deviceId, sinceTimestamp], [deviceId, Infinity], false, true)
    .sortBy("timestamp");
}

/**
 * Returns the total number of unsynced events.
 * Used by the sync status indicator in the UI.
 */
export async function countUnsyncedEvents(sinceTimestamp: number): Promise<number> {
  const deviceId = getDeviceId();
  return db.syncEvents
    .where("[deviceId+timestamp]")
    .between([deviceId, sinceTimestamp], [deviceId, Infinity], false, true)
    .count();
}

// ---------------------------------------------------------------------------
// Writes / maintenance
// ---------------------------------------------------------------------------

/**
 * Deletes all sync events that occurred before the given Unix millisecond
 * timestamp from the current device. Called after a successful push to
 * prevent unbounded growth of the sync log.
 */
export async function pruneAcknowledgedEvents(beforeTimestamp: number): Promise<void> {
  const deviceId = getDeviceId();
  await db.syncEvents
    .where("[deviceId+timestamp]")
    .between([deviceId, 0], [deviceId, beforeTimestamp], true, true)
    .delete();
}
