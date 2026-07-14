import { create } from "zustand";

export type AppMode = "assistant" | "admin";
export type AdminView = 'browse' | 'library' | 'standards' | 'settings' | 'validations';

export interface ActiveNode {
  standardId: string;
  nodeId: string;
}

export interface MockChangeItem {
  id: string;
  type: 'standard' | 'taxonomy' | 'profile';
  action: 'Created' | 'Modified' | 'Deleted';
  name: string;
  location: string;
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

// Pour suivre l'historique des éléments approuvés et afficher "Official par [Nom]"
export interface ApprovedHistoryItem {
  id: string;
  name: string;
  approvedBy: string;
  author: string;
  date: string;
}

interface AppState {
  mode: AppMode;
  adminView: AdminView;
  activeStandardId: string | null;
  activeNode: ActiveNode | null;
  gitRepoPath: string;
  systemUsername: string;

  localStagedChanges: MockChangeItem[];
  pendingCommits: AdminCommitRequest[];
  approvedHistory: ApprovedHistoryItem[]; // Historique de validation réelle

  setMode: (mode: AppMode) => void;
  setAdminView: (view: AdminView) => void;
  setActiveStandard: (standardId: string | null) => void;
  setActiveNode: (node: ActiveNode | null) => void;
  clearActiveNode: () => void;
  setGitRepoPath: (path: string) => void;
  setSystemUsername: (username: string) => void;

  addLocalChange: (change: Omit<MockChangeItem, 'id'>) => void;
  clearLocalChanges: () => void;
  submitCommit: (commitMessage: string, selectedIds: string[]) => void;
  
  // Validation granulaire (changement par changement)
  resolveSingleChange: (commitId: string, changeId: string, action: 'approve' | 'reject') => void;
}

export const useAppStore = create<AppState>((set) => ({
  mode: "assistant",
  adminView: "browse",
  activeStandardId: null,
  activeNode: null,
  gitRepoPath: "Z:/mil-git-db.git",
  systemUsername: "Loading...",
  approvedHistory: [],

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
        duration: 45,
        rmsVertical: 1.25,
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
    }
  ],

  pendingCommits: [
    {
      id: "commit-101",
      author: "Martin (Lab Tech)",
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
        },
        {
          id: "change-legacy-2",
          type: "profile",
          action: "Created",
          name: "Secondary Exhaust Resonant Freq",
          location: "MIL-STD-202G > Structural",
          proposedData: { duration: 15, rmsVertical: 0.22, notes: "Requested on-site sensor test payload" }
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
  setSystemUsername: (username) => set({ systemUsername: username }),

  // Ajout dynamique d'un changement local qui utilise l'ID généré
  addLocalChange: (change) => set((s) => ({
    localStagedChanges: [
      ...s.localStagedChanges,
      { ...change, id: `change-${Date.now()}` }
    ]
  })),
  
  clearLocalChanges: () => set({ localStagedChanges: [] }),

  submitCommit: (commitMessage, selectedIds) => set((s) => {
    const changesToSubmit = s.localStagedChanges.filter((c) => selectedIds.includes(c.id));
    const remainingChanges = s.localStagedChanges.filter((c) => !selectedIds.includes(c.id));

    const newCommit: AdminCommitRequest = {
      id: `commit-${Date.now()}`,
      author: s.systemUsername, // Prend dynamiquement ton nom de session Electron / Navigateur
      date: new Date().toISOString().split('T')[0],
      commitMessage,
      changes: changesToSubmit
    };

    return {
      localStagedChanges: remainingChanges,
      pendingCommits: [...s.pendingCommits, newCommit]
    };
  }),

  // Méthode granulaire pour valider / rejeter un seul changement à la fois
  resolveSingleChange: (commitId, changeId, action) => set((s) => {
    const commitIndex = s.pendingCommits.findIndex((c) => c.id === commitId);
    if (commitIndex === -1) return {};

    const commit = s.pendingCommits[commitIndex];
    const targetChange = commit.changes.find((ch) => ch.id === changeId);
    
    let updatedHistory = [...s.approvedHistory];

    if (action === 'approve' && targetChange) {
      // Stocke la validation réussie avec l'admin actuel (systemUsername) et l'auteur d'origine
      updatedHistory.push({
        id: targetChange.id,
        name: targetChange.name,
        approvedBy: s.systemUsername,
        author: commit.author,
        date: new Date().toISOString().split('T')[0]
      });
    }

    // Filtre pour enlever l'élément traité de ce commit particulier
    const remainingChanges = commit.changes.filter((ch) => ch.id !== changeId);

    let updatedCommits = [...s.pendingCommits];
    if (remainingChanges.length === 0) {
      // Si plus aucun changement dans le commit, on supprime le commit complet de la file
      updatedCommits = updatedCommits.filter((c) => c.id !== commitId);
    } else {
      // Sinon, on met simplement à jour le commit avec la liste réduite
      updatedCommits[commitIndex] = {
        ...commit,
        changes: remainingChanges
      };
    }

    return {
      pendingCommits: updatedCommits,
      approvedHistory: updatedHistory
    };
  })
}));
