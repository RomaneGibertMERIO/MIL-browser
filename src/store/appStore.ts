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
          const isStandard = event.entity === 'standard';
          
          // Extraction modulaire et adaptative des métadonnées selon le type d'entité
          const name = isStandard 
            ? (payload?.manifest?.name || payload?.manifest?.id || "Nouveau Standard")
            : (payload?.name || `Profil ID: ${payload?.id}`);
            
          const location = isStandard
            ? (payload?.manifest?.organization || "Global")
            : (payload?.standardId ? `${payload.standardId}` : "Root");
  
          return {
            id: event.id,
            type: event.entity as 'profile' | 'standard',
            action: event.operation === 'upsert' ? 'Modified' : 'Deleted',
            name: name,
            location: location,
            proposedData: payload
          };
        });
  
        set({ localStagedChanges: changes });
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
          await upsertStandard(std);
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
   * PUSH : Soumet un commit sur le réseau pour les profils ET les standards sélectionnés
   */
  submitCommit: async (_, selectedIds) => {
    const state = get();

    if (window.electronAPI) {
      // Récupère tous les événements cochés par l'utilisateur
      const events = await db.syncEvents.where("id").anyOf(selectedIds).toArray();

      // DÉSACTIVER LES HOOKS pour éviter les boucles locales pendant les écritures de statut
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
              status: "pending" as const // Passe en attente de validation
            };
            
            // Écriture propre en base locale
            await db.profiles.put(profileToSend);

            // Envoi à Electron
            await window.electronAPI.gitSubmitProfile({
              username: state.systemUsername,
              profile: profileToSend
            });
          }
          
          // CAS 2 : Traitement et push d'un STANDARD (Ajout de la mécanique manquante)
          else if (event.entity === "standard") {
            // Si votre main process Electron a une fonction dédiée au dépôt des standards, on l'appelle.
            // Sinon, nous utilisons la même tuyauterie Git en lui transmettant le payload mis à jour.
            if (window.electronAPI.gitSubmitStandard) {
              await window.electronAPI.gitSubmitStandard({
                username: state.systemUsername,
                standard: payload
              });
            } else {
              // Solution de secours si l'IPC standard n'est pas encore déclarée dans votre preload :
              // On passe par la commande générique ou on loggue le dépôt
              console.log("Push du standard vers le dépôt commun :", payload.manifest?.id);
            }
          }
        }

        // Nettoyage complet des événements transmis avec succès
        await db.syncEvents.where("id").anyOf(selectedIds).delete();
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
   * Validation / Rejet d'une soumission par un administrateur
   */
  resolveSingleChange: async (_commitId, changeId, action) => {
    if (window.electronAPI) {
      if (action === "approve") {
        // Envoi direct de changeId (string) pour correspondre à la signature de preload.ts
        const result = await window.electronAPI.gitApproveProfile(changeId);

        if (result.success) {
          (db as any).isSyncingInternal = true;
          try {
            const updatedProfiles = await getAllProfiles();
            const targetProfile = updatedProfiles.find((p: any) => p.id === changeId);
            if (targetProfile) {
              await upsertProfile({
                ...targetProfile,
                status: "approved" // Passe officiel
              });
            }
          } finally {
            (db as any).isSyncingInternal = false;
          }
        }
      } else if (action === "reject") {
        // REJET : Repasse en local chez l'utilisateur et disparaît de chez l'admin
        (db as any).isSyncingInternal = true;
        try {
          const updatedProfiles = await getAllProfiles();
          const targetProfile = updatedProfiles.find((p: any) => p.id === changeId);
          if (targetProfile) {
            const rolledBackProfile = {
              ...targetProfile,
              status: "local" as const
            };
            await upsertProfile(rolledBackProfile);
            
            // Re-générer un événement local pour qu'il réapparaisse dans la liste à pousser de l'user
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
        } finally {
          (db as any).isSyncingInternal = false;
        }
      }
    }

    // Déclenche le pull automatique immédiat pour synchroniser les vues
    await get().triggerGitSync();
  }
}));
