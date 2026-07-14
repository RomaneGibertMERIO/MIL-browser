import { create } from "zustand";

export type AppMode = "assistant" | "admin";
export type AdminView = 'browse' | 'library' | 'standards' | 'settings' | 'validations';

export interface ActiveNode {
  standardId: string;
  nodeId: string;
}

// ---------------------------------------------------------------------------
// Structuring Mock Changes for the Staging Area
// ---------------------------------------------------------------------------
export interface MockChangeItem {
  id: string;
  type: 'standard' | 'taxonomy' | 'profile';
  action: 'Created' | 'Modified' | 'Deleted';
  name: string;
  location: string; // e.g. "MIL-STD-810H > Method 514.8"
  originalData?: any;
  proposedData?: any;
}

export interface AdminCommitRequest {
  id: string;
  author: string;
  date: string;
  commitMessage: string;
  changes: MockChangeItem[];
}

interface AppState {
  mode: AppMode;
  adminView: AdminView;
  activeStandardId: string | null;
  activeNode: ActiveNode | null;
  gitRepoPath: string;
  systemUsername: string;

  // Staging area for local edits (User side)
  localStagedChanges: MockChangeItem[];
  // Commit queue for validation (Admin side)
  pendingCommits: AdminCommitRequest[];

  setMode: (mode: AppMode) => void;
  setAdminView: (view: AdminView) => void;
  setActiveStandard: (standardId: string | null) => void;
  setActiveNode: (node: ActiveNode | null) => void;
  clearActiveNode: () => void;
  setGitRepoPath: (path: string) => void;
  setSystemUsername: (username: string) => void;

  // Mock actions
  addLocalChange: (change: MockChangeItem) => void;
  clearLocalChanges: () => void;
  submitCommit: (commitMessage: string, selectedIds: string[]) => void;
  resolveCommit: (commitId: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  mode: "assistant",
  adminView: "browse",
  activeStandardId: null,
  activeNode: null,
  gitRepoPath: "Z:/mil-git-db.git",
  systemUsername: "Loading...",

  // Seed default changes so the interface isn't empty on launch
  localStagedChanges: [
    {
      id: "change-1",
      type: "profile",
      action: "Modified",
      name: "MIL-STD-810 Method 514.8 Procedure I - Category 4",
      location: "MIL-STD-810H > Method 514.8",
      originalData: {
        duration: 60,
        rmsVertical: 1.08,
        notes: "Table 514.8C-VII. Category – 4 – Composite wheeled vehicle vibration exposure.",
        dataset: [{ Freq: 5, ASDV: 0.015 }, { Freq: 20, ASDV: 0.020 }]
      },
      proposedData: {
        duration: 45, // Decreased duration
        rmsVertical: 1.25, // Increased intensity
        notes: "Optimized for laboratory shaker limit restrictions (2026 calibration).",
        dataset: [{ Freq: 5, ASDV: 0.018 }, { Freq: 20, ASDV: 0.025 }]
      }
    },
    {
      id: "change-2",
      type: "profile",
      action: "Created",
      name: "Turbine M4 Vibration Profile",
      location: "MIL-STD-810H > Method 514.8",
      proposedData: {
        duration: 30,
        rmsVertical: 0.95,
        notes: "Brand new turbine signature profile."
      }
    },
    {
      id: "change-3",
      type: "taxonomy",
      action: "Created",
      name: "Method 516.7 - Pyroshock",
      location: "MIL-STD-202G > Dynamic Section"
    }
  ],

  // Mock initial admin queue
  pendingCommits: [
    {
      id: "commit-101",
      author: "Martin",
      date: "2026-07-14",
      commitMessage: "Calibrated M4 profile parameters to safely match Shaker B tolerances",
      changes: [
        {
          id: "change-legacy-1",
          type: "profile",
          action: "Modified",
          name: "Upper Bearing Pyroshock",
          location: "MIL-STD-202G > Dynamic",
          originalData: { duration: 10, rmsVertical: 0.45 },
          proposedData: { duration: 12, rmsVertical: 0.55 }
        }
      ]
    }
  ],

  setMode: (mode) => set({ mode }),
  setAdminView: (adminView) => set({ adminView }),
  setActiveStandard: (activeStandardId) => set({ activeStandardId, activeNode: null }),
  setActiveNode: (activeNode) => set({ activeNode }),
  clearActiveNode: () => set({ activeNode: null }),
  setGitRepoPath: (gitRepoPath) => set({ gitRepoPath }),
  setSystemUsername: (systemUsername) => set({ systemUsername }),

  addLocalChange: (change) => set((s) => ({ localStagedChanges: [...s.localStagedChanges, change] })),
  clearLocalChanges: () => set({ localStagedChanges: [] }),

  submitCommit: (commitMessage, selectedIds) => set((s) => {
    const changesToSubmit = s.localStagedChanges.filter((c) => selectedIds.includes(c.id));
    const remainingChanges = s.localStagedChanges.filter((c) => !selectedIds.includes(c.id));

    const newCommit: AdminCommitRequest = {
      id: `commit-${Date.now()}`,
      author: s.systemUsername,
      date: new Date().toISOString().split('T')[0],
      commitMessage,
      changes: changesToSubmit
    };

    return {
      localStagedChanges: remainingChanges,
      pendingCommits: [...s.pendingCommits, newCommit]
    };
  }),

  resolveCommit: (commitId) => set((s) => ({
    pendingCommits: s.pendingCommits.filter((c) => c.id !== commitId)
  }))
}));
