/**
 * Settings repository.
 *
 * AppSettings is stored as a singleton row in the "settings" store with
 * key = "app_settings". This module provides typed read/write helpers
 * so that callers never deal with the raw Dexie table directly.
 *
 * Design: get() returns a default when no settings row exists yet (first
 * launch). This eliminates the null-check burden from every caller.
 */

import { db } from "../schema";
import type { AppSettings, SyncSettings } from "../../domain/sync";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SETTINGS_KEY = "app_settings" as const;

// ---------------------------------------------------------------------------
// Default settings
// ---------------------------------------------------------------------------

function buildDefaultSettings(): AppSettings {
  return {
    key: SETTINGS_KEY,
    activeStandardId: null,
    lastView: "assistant",
    sync: {
      enabled: false,
      endpoint: undefined,
      token: undefined,
      lastSyncAt: null,
      cursor: null,
    },
    gitRepoPath: "Z:/mil-git-db.git", // <-- Par défaut
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Returns the current AppSettings, or the default settings if none are
 * persisted yet. Never throws.
 */
export async function getSettings(): Promise<AppSettings> {
  const stored = await db.settings.get(SETTINGS_KEY);
  return stored ?? buildDefaultSettings();
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Persists a full AppSettings record, replacing any existing row.
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.settings.put(settings);
}

/**
 * Convenience helper: updates only the sync sub-object.
 */
export async function saveSyncSettings(sync: SyncSettings): Promise<void> {
  const current = await getSettings();
  await saveSettings({ ...current, sync });
}

/**
 * Convenience helper: updates only the activeStandardId.
 */
export async function saveActiveStandard(standardId: string | null): Promise<void> {
  const current = await getSettings();
  await saveSettings({ ...current, activeStandardId: standardId });
}

/**
 * Convenience helper: updates only the lastView.
 */
export async function saveLastView(view: AppSettings["lastView"]): Promise<void> {
  const current = await getSettings();
  await saveSettings({ ...current, lastView: view });
}
