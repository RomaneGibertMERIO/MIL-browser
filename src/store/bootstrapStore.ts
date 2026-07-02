/**
 * Bootstrap store.
 *
 * Tracks the completion of the application startup sequence:
 * 1. Open the IndexedDB database (Dexie).
 * 2. Seed / migrate builtin standard plugins.
 * 3. Restore last navigation state from AppSettings.
 *
 * All views must check `bootstrapStore.ready` before rendering.
 * While `ready === false`, the application shows a full-screen loading state.
 * If `error !== null`, the application shows an error screen.
 *
 * This store is in-memory only. It resets to `{ ready: false, error: null }`
 * on every page load, which is the correct behavior — the bootstrap sequence
 * must run on every startup.
 */

import { create } from "zustand";

// ---------------------------------------------------------------------------
// Store state & actions
// ---------------------------------------------------------------------------

interface BootstrapState {
  /** True once the DB is open, standards are seeded, and settings are loaded. */
  ready: boolean;
  /** Non-null when the bootstrap sequence encountered a fatal error. */
  error: string | null;

  setReady: () => void;
  setError: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Store instance
// ---------------------------------------------------------------------------

/**
 * Global bootstrap status store.
 * Used by the root App component to gate rendering of the application shell.
 */
export const useBootstrapStore = create<BootstrapState>((set) => ({
  ready: false,
  error: null,

  setReady: () => set({ ready: true, error: null }),
  setError: (message) => set({ error: message }),
}));
