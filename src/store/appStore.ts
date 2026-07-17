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
   * Lit la table `syncEvents` d'IndexedDB pour alimenter dynamiquement la liste de l'UI.
   * Regroupe les événements par ID d'entité unique pour éviter les doublons lors des mises à jour successives.
   */
  refreshLocalChanges: async () => {
    try {
      const events = await db.syncEvents.toArray();
      
      // Utilisation d'une Map pour écraser les anciennes modifications par la plus récente d'un même ID
      const aggregatedMap = new Map<string, MockChangeItem>();

      for (const event of events) {
        const payload = event.payload as any;
        const isStandard = event.entity === 'standard';
        
        const name = isStandard 
          ? (payload?.manifest?.name || payload?.manifest?.id || "New Standard")
          : (payload?.name || `Profile ID: ${payload?.id}`);
          
        const location = isStandard
          ? (payload?.manifest?.organization || "Global")
          : (payload?.standardId ? `${payload.standardId}` : "Root");

        // On agrège par l'ID de l'entité elle-même
        aggregatedMap.set(event.id, {
          id: event.id, // Correspond à l'ID de l'événement / entité
          type: event.entity as 'profile' | 'standard',
          action: event.operation === 'upsert' ? 'Modified' : 'Deleted',
          name: name,
          location: location,
          proposedData: payload
        });
      }

      set({ localStagedChanges: Array.from(aggregatedMap.values()) });
    } catch (err) {
      console.error("Erreur refreshLocalChanges :", err);
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
      
      // DESACTIVER LES HOOKS pour éviter la boucle lors de l'écriture du Pull
      db.isSyncingInternal = true;
      try {
        // 3. Écriture dans IndexedDB locale
        for (const std of gitResult.pulledStandards) {
          // IMPORTANT CORRECTION : Un standard tiré du dépôt commun n'est plus un "builtin" d'usine local
          const adjustedStandard = {
            ...std,
            manifest: {
              ...std.manifest,
              isBuiltin: false // 👈 Permet de le considérer comme officiel/customisé et évite l'écrasement au bootstrap
            },
            status: std.status || "approved"
          };
          await upsertStandard(adjustedStandard);
        }
        for (const prof of gitResult.pulledProfiles) {
          await upsertProfile(prof);
        }
      } finally {
        // RÉACTIVER LES HOOKS
        db.isSyncingInternal = false;
      }

      // Reconstruire les propositions d'administration en attente de validation ("pending")
      const dbProfiles = await getAllProfiles();
      const pendingProfiles = dbProfiles.filter((p: any) => p.status === "pending");

      // On reconstruit également les standards en attente de validation ("pending")
      const dbStandards = await db.standards.toArray();
      const pendingStandards = dbStandards.filter((s: any) => s.status === "pending");

      const reconstructedCommits: AdminCommitRequest[] = [
        ...pendingProfiles.map((p: any) => ({
          id: `commit-${p.id}`,
          author: p.author || "Collaborateur",
          date: p.updatedAt ? p.updatedAt.split('T')[0] : new Date().toISOString().split('T')[0],
          commitMessage: `Proposition de profil : ${p.name}`,
          changes: [{
            id: p.id,
            type: "profile" as const,
            action: "Created" as const,
            name: p.name,
            location: `${p.standardId}`,
            proposedData: p
          }]
        })),
        ...pendingStandards.map((s: any) => ({
          id: `commit-${s.manifest.id}`,
          author: s.lastModifiedBy || "Collaborateur",
          date: s.updatedAt ? s.updatedAt.split('T')[0] : new Date().toISOString().split('T')[0],
          commitMessage: `Proposition de taxonomie : ${s.manifest.name || s.manifest.id}`,
          changes: [{
            id: s.manifest.id,
            type: "standard" as const,
            action: "Modified" as const,
            name: s.manifest.name || s.manifest.id,
            location: s.manifest.organization || "Global",
            proposedData: s
          }]
        }))
      ];

      set({ pendingCommits: reconstructedCommits });
    } else {
      console.warn("La synchronisation Git réseau n'a pas pu être établie. Utilisation de la base locale.", gitResult.error);
    }

    // Rafraîchir les changements locaux à pousser
    await get().refreshLocalChanges();
  },

  /**
   * PUSH : Soumet un commit sur le réseau pour les profils ET les standards sélectionnés
   */
  submitCommit: async (_, selectedIds) => {
    const state = get();

    if (window.electronAPI) {
      // Récupère tous les événements cochés par l'utilisateur
      const events = await db.syncEvents.where("id").anyOf(selectedIds).toArray();

      // DÉSACTIVER LES HOOKS pour éviter les boucles infinies de création d'événements de synchro
      (db as any).isSyncingInternal = true;
      try {
        for (const event of events) {
          const payload = event.payload as any;
          if (!payload) continue;

          // CAS 1 : Traitement et push d'un PROFIL
          if (event.entity === "profile") {
            const profileToSend = {
              ...payload,
              author: state.systemUsername,
              status: "pending" as const // Devient en attente de validation par l'admin
            };
            
            // Écriture propre en base locale
            await db.profiles.put(profileToSend);

            // Appel IPC
            await window.electronAPI.gitSubmitProfile({
              username: state.systemUsername,
              profile: profileToSend
            });
          }
          
          // CAS 2 : Traitement et push d'un STANDARD
          // Dans src/store/appStore.ts (dans la méthode submitCommit)
          
          // ...
          else if (event.entity === "standard") {
            const api = window.electronAPI as any;
            
            const standardToSend = {
              ...payload,
              status: "pending" as const,
              lastModifiedBy: state.systemUsername,
              manifest: {
                ...payload.manifest,
                isBuiltin: false
              }
            };
          
            await db.standards.put(standardToSend);
            
            if (api.gitSubmitStandard) {
              // 👈 On envoie le gitRepoPath du store à l'IPC
              await api.gitSubmitStandard({
                repoPath: state.gitRepoPath,
                username: state.systemUsername,
                standard: standardToSend
              });
            } else {
              console.log("Envoi du standard via la passerelle de secours :", payload.manifest?.id);
            }
          }
        }

        // Nettoyage complet des événements transmis avec succès
        await db.syncEvents.where("id").anyOf(selectedIds).delete();
      } catch (err) {
        console.error("Erreur durant la soumission du push:", err);
      } finally {
        // RÉACTIVER LES HOOKS
        (db as any).isSyncingInternal = false;
      }
    }

    // Rafraîchissement complet et immédiat des états de l'UI
    await get().refreshLocalChanges();
    await get().triggerGitSync();
  },

  
  
/**
   * Validation / Rejet d'une soumission par un administrateur (Profil ou Standard)
   */
  resolveSingleChange: async (commitId, changeId, action) => {
    const state = get();
    if (!window.electronAPI) return;

    // Étape 1 : On détermine si l'élément à résoudre est un standard ou un profil
    // On cherche dans les pendingCommits pour trouver le type
    const commit = state.pendingCommits.find(c => c.id === commitId);
    const changeItem = commit?.changes.find(c => c.id === changeId);
    const entityType = changeItem ? changeItem.type : 'profile'; // fallback par défaut

    if (action === "approve") {
      if (entityType === "profile") {
        const result = await window.electronAPI.gitApproveProfile(changeId);
        if (result.success) {
          (db as any).isSyncingInternal = true;
          try {
            const updatedProfiles = await getAllProfiles();
            const targetProfile = updatedProfiles.find((p: any) => p.id === changeId);
            if (targetProfile) {
              await upsertProfile({
                ...targetProfile,
                status: "approved"
              });
            }
          } finally {
            (db as any).isSyncingInternal = false;
          }
        }
      } else if (entityType === "standard") {
        const result = await window.electronAPI.gitApproveStandard({
          repoPath: state.gitRepoPath,
          standardId: changeId
        });
        if (result.success) {
          (db as any).isSyncingInternal = true;
          try {
            const targetStandard = await db.standards.get(changeId);
            if (targetStandard) {
              await upsertStandard({
                ...targetStandard,
                status: "approved",
                manifest: {
                  ...targetStandard.manifest,
                  isBuiltin: false
                }
              });
            }
          } finally {
            (db as any).isSyncingInternal = false;
          }
        }
      }
    } else if (action === "reject") {
      (db as any).isSyncingInternal = true;
      try {
        if (entityType === "profile") {
          const updatedProfiles = await getAllProfiles();
          const targetProfile = updatedProfiles.find((p: any) => p.id === changeId);
          if (targetProfile) {
            const rolledBackProfile = { ...targetProfile, status: "local" as const };
            await upsertProfile(rolledBackProfile);
            
            (db as any).isSyncingInternal = false;
            await db.syncEvents.put({
              id: changeId,
              deviceId: "system",
              timestamp: Date.now(),
              operation: "upsert",
              entity: "profile",
              payload: rolledBackProfile
            });
          }
        } else if (entityType === "standard") {
          const targetStandard = await db.standards.get(changeId);
          if (targetStandard) {
            const rolledBackStandard = { ...targetStandard, status: "local" as const };
            await upsertStandard(rolledBackStandard);

            (db as any).isSyncingInternal = false;
            await db.syncEvents.put({
              id: changeId,
              deviceId: "system",
              timestamp: Date.now(),
              operation: "upsert",
              entity: "standard",
              payload: rolledBackStandard
            });
          }
        }
      } finally {
        (db as any).isSyncingInternal = false;
      }
    }

    // Déclenche la synchronisation Git pour actualiser l'état commun
    await get().triggerGitSync();
  }

}));
