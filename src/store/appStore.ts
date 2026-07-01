/**
 * Application navigation store.
 *
 * Holds the current UI navigation state: which standard the user is browsing,
 * which node is selected, which top-level view is active, and whether the
 * user is in assistant or admin mode.
 *
 * This store is in-memory only — it is not persisted to IndexedDB. On page
 * reload, the settings repository restores lastView and activeStandardId.
 *
 * Design decisions:
 * - Active node is stored as { standardId, nodeId } rather than a resolved
 *   TaxonomyNodeItem, because TaxonomyNodeItem is a derived runtime type
 *   that must be re-built whenever the standard definition changes.
 * - The store never imports from the database layer — it receives values
 *   from the bootstrap sequence via setActiveStandard / setLastView.
 */

import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppMode = "assistant" | "admin";

export type AdminView = "browse" | "library" | "standards" | "settings";

/** Identifies the currently selected taxonomy node by stable ids. */
export interface ActiveNode {
  standardId: string;
  nodeId: string;
}

// ---------------------------------------------------------------------------
// Store state & actions
// ---------------------------------------------------------------------------

interface AppState {
  mode: AppMode;
  adminView: AdminView;
  /** The standard currently active in the assistant or browse views. */
  activeStandardId: string | null;
  /** The taxonomy node currently selected in the sidebar or assistant. */
  activeNode: ActiveNode | null;

  setMode: (mode: AppMode) => void;
  setAdminView: (view: AdminView) => void;
  setActiveStandard: (standardId: string | null) => void;
  setActiveNode: (node: ActiveNode | null) => void;
  /** Clears the active node without clearing the active standard. */
  clearActiveNode: () => void;
}

// ---------------------------------------------------------------------------
// Store instance
// ---------------------------------------------------------------------------

/**
 * Global navigation store.
 * Import and use `useAppStore` in React components.
 * Use `appStore.getState()` in non-React code.
 */
export const useAppStore = create<AppState>((set) => ({
  mode: "assistant",
  adminView: "browse",
  activeStandardId: null,
  activeNode: null,

  setMode: (mode) => set({ mode }),
  setAdminView: (adminView) => set({ adminView }),
  setActiveStandard: (activeStandardId) =>
    set({ activeStandardId, activeNode: null }),
  setActiveNode: (activeNode) => set({ activeNode }),
  clearActiveNode: () => set({ activeNode: null }),
}));
