/**
 * Domain model for sync events and device identity.
 *
 * The sync architecture is append-only: every write to the local database
 * also appends a SyncEvent to the syncEvents store. On reconnect, unsynced
 * events are pushed to the server and remote events are pulled.
 *
 * Design decisions:
 * - SyncEvent.payload is z.unknown() because it can carry a Profile,
 *   a StandardPlugin, or a deletion tombstone. Consumers narrow it
 *   via the operation field.
 * - deviceId is a stable random UUID generated once and stored in
 *   localStorage (the only use of localStorage in the new architecture).
 *   It is used to filter out echo events during pull.
 * - timestamp is a Unix millisecond integer, not an ISO string, to
 *   support efficient range queries in IndexedDB.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// SyncEntity — identifies which store an event belongs to
// ---------------------------------------------------------------------------

export const SyncEntitySchema = z.enum(["profile", "standard"]);

export type SyncEntity = z.infer<typeof SyncEntitySchema>;

// ---------------------------------------------------------------------------
// SyncOperation
// ---------------------------------------------------------------------------

export const SyncOperationSchema = z.enum(["upsert", "delete"]);

export type SyncOperation = z.infer<typeof SyncOperationSchema>;

// ---------------------------------------------------------------------------
// SyncEvent
// ---------------------------------------------------------------------------

/**
 * An immutable record of a single write operation performed on this device.
 * The syncEvents store accumulates these entries; they are pushed to the
 * server and acknowledged by updating AppSettings.sync.lastSyncAt.
 */
export const SyncEventSchema = z.object({
  /** Client-generated UUID. Globally unique across all devices. */
  id: z.string().min(1),
  deviceId: z.string().min(1),
  /** Unix milliseconds. Used for ordered pull queries. */
  timestamp: z.number().int().nonnegative(),
  operation: SyncOperationSchema,
  entity: SyncEntitySchema,
  /**
   * Full entity snapshot for upsert, or { id: string } tombstone for delete.
   * Callers must narrow using operation before accessing.
   */
  payload: z.unknown(),
});

export type SyncEvent = z.infer<typeof SyncEventSchema>;

// ---------------------------------------------------------------------------
// SyncSettings
// ---------------------------------------------------------------------------

/**
 * Persisted sync configuration stored in AppSettings.
 * All fields are optional — sync is entirely opt-in.
 */
export const SyncSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  endpoint: z.string().url().optional(),
  /** Bearer token for the sync endpoint. Never logged. */
  token: z.string().optional(),
  /** ISO-8601 timestamp of the last successful sync. */
  lastSyncAt: z.string().datetime().nullable().default(null),
  /** Opaque cursor returned by the server for delta pulls. */
  cursor: z.string().nullable().default(null),
});

export type SyncSettings = z.infer<typeof SyncSettingsSchema>;

// ---------------------------------------------------------------------------
// AppSettings
// ---------------------------------------------------------------------------

/**
 * Application-level preferences persisted in the "settings" store.
 * Stored as key-value pairs with a fixed set of known keys.
 */
export const AppSettingsSchema = z.object({
  /** The key is always "app_settings" — acts as a singleton row. */
  key: z.literal("app_settings"),
  activeStandardId: z.string().nullable().default(null),
  lastView: z.enum(["assistant", "browse", "library", "standards", "settings"]).default("assistant"),
  sync: SyncSettingsSchema,
  /** Vide = mode autonome (socle builtin). Renseigné = le dépôt central fait autorité. */
  gitRepoPath: z.string().default(""),
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;
