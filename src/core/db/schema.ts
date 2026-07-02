/**
 * IndexedDB schema definition using Dexie.
 *
 * This file owns the entire database structure. All version upgrades must be
 * added here as new version() blocks — never by editing existing blocks.
 *
 * Design decisions:
 * - A class-based Dexie subclass (rather than a plain Dexie instance) gives
 *   full TypeScript typing on each Table without separate type-assertion
 *   calls at every use site.
 * - The module exports a single `db` singleton. It is not a React Context
 *   value because repositories and engines need it in non-React contexts
 *   (background sync, migration engine). Components access the database
 *   through repository hooks, never directly.
 * - settings uses a literal "key" keyPath with a single "app_settings" row
 *   (singleton pattern). This avoids a separate localStorage dependency for
 *   app preferences.
 * - syncEvents accumulates indefinitely and is periodically pruned after a
 *   successful sync — pruning logic lives in syncEngine.ts, not here.
 */

import Dexie, { type Table } from "dexie";
import type { Profile } from "../domain/profile";
import type { StandardPlugin } from "../domain/standard";
import type { SyncEvent, AppSettings } from "../domain/sync";

// ---------------------------------------------------------------------------
// AppDatabase
// ---------------------------------------------------------------------------

export class AppDatabase extends Dexie {
  /**
   * All test profiles — both builtin seeds and user-created records.
   * Primary key: Profile.id (client-generated UUID).
   */
  profiles!: Table<Profile, string>;

  /**
   * Standard plugin definitions (MIL-STD-810H, DO-160G, …).
   * Primary key: StandardPlugin.manifest.id (stable slug).
   */
  standards!: Table<StandardPlugin, string>;

  /**
   * Write-ahead log for offline-first sync.
   * Primary key: SyncEvent.id.
   */
  syncEvents!: Table<SyncEvent, string>;

  /**
   * Application preferences — stored as a singleton row with key = "app_settings".
   */
  settings!: Table<AppSettings, string>;

  constructor() {
    super("mil_browser_v1");

    /**
     * Version 1 — initial schema.
     *
     * Index notation:
     *   "field"            — single-column index
     *   "[f1+f2]"          — compound index for multi-field queries
     *   "&field"           — unique index (& prefix)
     *   "++field"          — auto-increment (not used here — we use UUIDs)
     *
     * Only indexed fields appear here. Non-indexed fields are stored normally
     * but cannot be used as query criteria without a full table scan.
     */
    this.version(1).stores({
      //                   keyPath          additional indexes
      profiles:
        "id" +
        ", nodeId" +
        ", standardId" +
        ", updatedAt" +
        ", source" +
        ", [standardId+nodeId]",

      // Dexie supports dotted-path keyPaths for nested properties.
      standards: "manifest.id, manifest.organization, manifest.isBuiltin",

      syncEvents:
        "id" +
        ", timestamp" +
        ", entity" +
        ", [deviceId+timestamp]",

      settings: "key",
    });
  }
}

// ---------------------------------------------------------------------------
// Module singleton
// ---------------------------------------------------------------------------

/**
 * The single database connection used by the entire application.
 * Import this directly in repository files and engine modules.
 */
export const db = new AppDatabase();
