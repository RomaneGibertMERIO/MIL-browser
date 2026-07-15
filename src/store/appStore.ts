import { create } from "zustand";
import { upsertProfile, getAllProfiles } from "../core/db/repositories/profiles.repo"; 
import { upsertStandard } from "../core/db/repositories/standards.repo";
import { db } from "../core/db/schema";

export type AppMode = "assistant" | "admin";
export type AdminView = 'browse' | 'library' | 'standards' | 'settings' | 'validations';

export interface ActiveNode {
  standardId: string;
  nodeId: string;
}

export interface MockChangeItem {
  id: string; // Correspondra à l'ID de l'événement de synchro Dexie
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
  
  // Actions de synchronisation Git / IndexedDB
  refreshLocalChanges: () => Promise<void>;
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
   * Lit la table `syncEvents` d'IndexedDB pour alimenter dynamiquement la liste de l'UI
   */
  refreshLocalChanges: async () => {
    try {
      const events = await db.syncEvents.toArray();
      const changes: MockChangeItem[] = events.map((event) => {
        const payload = event.payload as any;
        return {
          id: event.id,
          type: event.entity as 'profile' | 'standard',
          action: event.operation === 'upsert' ? 'Created' : 'Deleted',
          name: payload?.name || `ID: ${payload?.id || event.id}`,
          location: payload?.standardId ? `${payload.standardId}` : "Root",
          proposedData: payload
        };
      });

      set({ localStagedChanges: changes });
    } catch (err) {
      console.error("Erreur lors de la récupération des changements locaux (IndexedDB) :", err);
    }
  },

  /**
   * PULL : Synchronisation bidirectionnelle avec le dépôt Git distant
   */
  triggerGitSync: async () => {
    if (!window.electronAPI) return;
    const state = get();
    
    // 1. Configurer le chemin du dépôt côté Electron
    await window.electronAPI.gitSetRepoPath(state.gitRepoPath);
    
    // 2. Lancer la synchronisation
    const result = await window.electronAPI.gitSync(state.systemUsername);
    const gitResult = result as { success: boolean; pulledProfiles?: any[]; pulledStandards?: any[]; error?: string };
    
    if (gitResult.success && gitResult.pulledProfiles && gitResult.pulledStandards) {
      console.log(`Sync Git Réussie. Éléments récupérés : ${gitResult.pulledProfiles.length} profils, ${gitResult.pulledStandards.length} standards.`);
      
      // 3. Écriture dans IndexedDB locale
      for (const std of gitResult.pulledStandards) {
        await upsertStandard(std);
      }
      for (const prof of gitResult.pulledProfiles) {
        await upsertProfile(prof);
      }

      // Reconstruire les propositions d'administration en attente de validation ("pending")
      const dbProfiles = await getAllProfiles();
      const pendingProfiles = dbProfiles.filter((p: any) => p.status === "pending");

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
      console.warn("La synchronisation Git réseau n'a pas pu être établie. Utilisation de la base locale.", gitResult.error);
    }

    // Rafraîchir les changements locaux à pousser
    await get().refreshLocalChanges();
  },

  /**
   * PUSH : Soumet un commit sur le réseau et supprime l'événement local d'IndexedDB
   */
  submitCommit: async (_commitMessage, selectedIds) => {
    const state = get();

    if (window.electronAPI) {
      // Trouver les événements Dexie correspondant aux changements sélectionnés
      const events = await db.syncEvents.where("id").anyOf(selectedIds).toArray();

      for (const event of events) {
        const payload = event.payload as any;
        if (event.entity === "profile" && payload) {
          const profileToSend = {
            ...payload,
            author: state.systemUsername,
            status: "pending" as const
          };
          
          // Sauvegarde locale propre
          await upsertProfile(profileToSend);

          // Envoi au service Git d'Electron
          await window.electronAPI.gitSubmitProfile(profileToSend);
        }
      }

      // Nettoyer les événements transmis avec succès pour éviter de les re-proposer à l'envoi
      await db.syncEvents.where("id").anyOf(selectedIds).delete();
    }

    // Actualisation de l'UI
    await get().refreshLocalChanges();
    await get().triggerGitSync();
  },

  /**
   * Validation d'une soumission par un administrateur
   */
  resolveSingleChange: async (_commitId, changeId, action) => {
    if (window.electronAPI) {
      if (action === "approve") {
        // Approuver le fichier JSON sur le dépôt partagé
        const result = await window.electronAPI.gitApproveProfile(changeId);

        if (result.success) {
          // Mettre à jour l'entité locale en "approved" dans notre base IndexedDB
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
}));
