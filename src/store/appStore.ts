import { create } from "zustand";
import { upsertProfile, getAllProfiles } from "../../core/db/repositories/profile.repo"; 
import { upsertStandard } from "../../core/db/repositories/standard.repo";

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
  approvedHistory: ApprovedHistoryItem[];

  setMode: (mode: AppMode) => void;
  setAdminView: (view: AdminView) => void;
  setActiveStandard: (standardId: string | null) => void;
  setActiveNode: (node: ActiveNode | null) => void;
  clearActiveNode: () => void;
  setGitRepoPath: (path: string) => void;
  setSystemUsername: (username: string) => void;

  addLocalChange: (change: Omit<MockChangeItem, 'id'>) => void;
  clearLocalChanges: () => void;
  submitCommit: (commitMessage: string, selectedIds: string[]) => Promise<void>;
  
  // Actions réelles de Synchronisation Git / IndexedDB
  triggerGitSync: () => Promise<void>;
  resolveSingleChange: (commitId: string, changeId: string, action: 'approve' | 'reject') => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  mode: "assistant",
  adminView: "browse",
  activeStandardId: null,
  activeNode: null,
  gitRepoPath: "Z:/mil-git-db.git",
  systemUsername: "User",
  approvedHistory: [],
  localStagedChanges: [],
  pendingCommits: [],

  setMode: (mode) => set({ mode }),
  setAdminView: (adminView) => set({ adminView }),
  setActiveStandard: (activeStandardId) => set({ activeStandardId, activeNode: null }),
  setActiveNode: (activeNode) => set({ activeNode }),
  clearActiveNode: () => set({ activeNode: null }),
  
  setGitRepoPath: (gitRepoPath) => {
    set({ gitRepoPath });
    // Notifier le backend Electron du changement de chemin réseau
    if (window.electronAPI) {
      window.electronAPI.gitSetRepoPath(gitRepoPath);
    }
  },
  
  setSystemUsername: (username) => set({ systemUsername: username }),

  addLocalChange: (change) => set((s) => ({
    localStagedChanges: [
      ...s.localStagedChanges,
      { ...change, id: `change-${Date.now()}` }
    ]
  })),
  
  clearLocalChanges: () => set({ localStagedChanges: [] }),

  /**
   * PULL de synchronisation bidirectionnelle
   */
  triggerGitSync: async () => {
    if (!window.electronAPI) return;
    const state = get();
    
    // 1. Définir le chemin actif côté Electron
    await window.electronAPI.gitSetRepoPath(state.gitRepoPath);
    
    // 2. Lancer la synchronisation (Pull)
    const result = await window.electronAPI.gitSync(state.systemUsername);
    
    // On cast le résultat pour éviter les erreurs TS d'absence de propriété
    const gitResult = result as { success: boolean; pulledProfiles?: any[]; pulledStandards?: any[]; error?: string };
    
    if (gitResult.success && gitResult.pulledProfiles && gitResult.pulledStandards) {
      console.log(`Sync Git Réussie. Éléments récupérés : ${gitResult.pulledProfiles.length} profils, ${gitResult.pulledStandards.length} standards.`);
      
      // 3. Injecter les données reçues du Git réseau dans IndexedDB locale
      for (const std of gitResult.pulledStandards) {
        await upsertStandard(std);
      }
      for (const prof of gitResult.pulledProfiles) {
        await upsertProfile(prof);
      }

      // Reconstruire la liste locale des validations en attente à partir de l'état "pending" des profils reçus
      const dbProfiles = await getAllProfiles();
      const pendingProfiles = dbProfiles.filter(p => p.status === "pending");

      const reconstructedCommits: AdminCommitRequest[] = pendingProfiles.map((p: any) => ({
        id: `commit-${p.id}`,
        author: p.author || "Collaborateur",
        date: p.updatedAt ? p.updatedAt.split('T')[0] : new Date().toISOString().split('T')[0],
        commitMessage: `Proposition de profil : ${p.name}`,
        changes: [{
          id: p.id,
          type: "profile",
          action: "Created",
          name: p.name,
          location: `${p.standardId}`,
          proposedData: p
        }]
      }));

      set({ pendingCommits: reconstructedCommits });
    } else {
      console.warn("La synchronisation Git réseau n'a pas pu être établie. Utilisation de la base IndexedDB locale.", gitResult.error);
    }
  },

  /**
   * PUSH : Soumission d'un lot de modifications locales vers le dépôt Git
   */
  submitCommit: async (_commitMessage, selectedIds) => { // Changé commitMessage en _commitMessage pour signaler qu'il est intentionnellement inutilisé
    const state = get();
    const changesToSubmit = state.localStagedChanges.filter((c) => selectedIds.includes(c.id));
    const remainingChanges = state.localStagedChanges.filter((c) => !selectedIds.includes(c.id));

    if (window.electronAPI) {
      for (const change of changesToSubmit) {
        if (change.type === "profile" && change.proposedData) {
          const profileToSend = {
            ...change.proposedData,
            author: state.systemUsername,
            status: "pending"
          };
          
          // Enregistrement dans IndexedDB
          await upsertProfile(profileToSend);

          // Envoi au service Git d'Electron
          await window.electronAPI.gitSubmitProfile({
            username: state.systemUsername,
            profile: profileToSend
          });
        }
      }
    }

    set({ localStagedChanges: remainingChanges });
    await get().triggerGitSync();
  },

  /**
   * Validation d'une soumission (Action de l'Administrateur)
   */
  resolveSingleChange: async (_commitId, changeId, action) => { // Changé commitId en _commitId
    const state = get();
    
    if (window.electronAPI) {
      if (action === "approve") {
        // Correction de l'envoi des paramètres typés
        const result = await window.electronAPI.gitApproveProfile({
          adminUsername: state.systemUsername,
          profileId: changeId
        });

        if (result.success) {
          const updatedProfiles = await getAllProfiles();
          const targetProfile = updatedProfiles.find((p: any) => p.id === changeId);
          if (targetProfile) {
            await upsertProfile({
              ...targetProfile,
              status: "approved"
            });
          }
        }
      } else {
        console.log(`Profil rejeté : ${changeId}`);
      }
    }

    await get().triggerGitSync();
  }
}
