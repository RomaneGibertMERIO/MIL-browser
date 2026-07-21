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
  
  refreshLocalChanges: () => Promise<void>;
  triggerGitSync: () => Promise<void>;
  resolveSingleChange: (commitId: string, changeId: string, action: 'approve' | 'reject') => Promise<void>;
}

const getElectronBridge = (): any => (window as any).electron || (window as any).electronAPI;

export const useAppStore = create<AppState>((set, get) => ({
  mode: "assistant",
  adminView: "browse",
  activeStandardId: null,
  activeNode: null,
  gitRepoPath: "Z:/CHANGE_ME",
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
    const api = getElectronBridge();
    if (api?.gitSetRepoPath) {
      api.gitSetRepoPath(gitRepoPath);
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

  refreshLocalChanges: async () => {
    try {
      const events = await db.syncEvents.toArray();
      const aggregatedMap = new Map<string, MockChangeItem>();

      for (const event of events) {
        const payload = event.payload as any;
        const isStandard = event.entity === 'standard';
        
        const name = isStandard 
          ? (payload?.manifest?.name || payload?.manifest?.label || payload?.manifest?.id || "New Standard")
          : (payload?.name || `Profile ID: ${payload?.id}`);
          
        const location = isStandard
          ? (payload?.manifest?.organization || "Global")
          : (payload?.standardId ? `${payload.standardId}` : "Root");

        aggregatedMap.set(event.id, {
          id: event.id,
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

  triggerGitSync: async () => {
    const api = getElectronBridge();
    if (!api) return;
    const state = get();
    
    if (api.gitSetRepoPath) await api.gitSetRepoPath(state.gitRepoPath);
    
    const result = await api.gitSync(state.systemUsername);
    const gitResult = result as { success: boolean; pulledProfiles?: any[]; pulledStandards?: any[]; error?: string };
    
    if (gitResult.success && gitResult.pulledProfiles && gitResult.pulledStandards) {
      (db as any).isSyncingInternal = true;
      try {
        for (const std of gitResult.pulledStandards) {
          const adjustedStandard: any = {
            ...std,
            manifest: {
              ...std.manifest,
              isBuiltin: false
            },
            status: std.status || "approved"
          };
          await upsertStandard(adjustedStandard as any);
        }
        for (const prof of gitResult.pulledProfiles) {
          await upsertProfile(prof);
        }
      } finally {
        (db as any).isSyncingInternal = false;
      }

      const dbProfiles = await getAllProfiles();
      const pendingProfiles = dbProfiles.filter((p: any) => p.status === "pending");

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
    }

    await get().refreshLocalChanges();
  },

  submitCommit: async (_, selectedIds) => {
    const state = get();
    const api = getElectronBridge();

    if (api) {
      const events = await db.syncEvents.where("id").anyOf(selectedIds).toArray();

      (db as any).isSyncingInternal = true;
      try {
        for (const event of events) {
          const payload = event.payload as any;
          if (!payload) continue;

          if (event.entity === "profile") {
            const profileToSend = {
              ...payload,
              author: state.systemUsername,
              status: "pending" as const
            };
            
            await db.profiles.put(profileToSend);

            if (api.gitSubmitProfile) {
              await api.gitSubmitProfile({
                username: state.systemUsername,
                profile: profileToSend
              });
            }
          }
          else if (event.entity === "standard") {
            const standardToSend: any = {
              ...payload,
              status: "pending",
              lastModifiedBy: state.systemUsername,
              manifest: {
                ...payload.manifest,
                isBuiltin: false
              }
            };
          
            await db.standards.put(standardToSend);
            
            if (api.gitSubmitStandard) {
              await api.gitSubmitStandard({
                repoPath: state.gitRepoPath,
                username: state.systemUsername,
                standard: standardToSend
              });
            }
          }
        }

        await db.syncEvents.where("id").anyOf(selectedIds).delete();
      } catch (err) {
        console.error("Erreur durant la soumission du push:", err);
      } finally {
        (db as any).isSyncingInternal = false;
      }
    }

    await get().refreshLocalChanges();
    await get().triggerGitSync();
  },

  resolveSingleChange: async (commitId, changeId, action) => {
    const state = get();
    const api = getElectronBridge();
    if (!api) return;

    const commit = state.pendingCommits.find((c) => c.id === commitId);
    const changeItem = commit?.changes.find((c) => c.id === changeId);
    const entityType = changeItem ? changeItem.type : "profile";

    if (action === "approve") {
      if (entityType === "profile") {
        const result = await api.gitApproveProfile?.(changeId);
        if (result?.success) {
          (db as any).isSyncingInternal = true;
          try {
            const updatedProfiles = await getAllProfiles();
            const targetProfile = updatedProfiles.find((p: any) => p.id === changeId);
            if (targetProfile) {
              await upsertProfile({
                ...targetProfile,
                status: "approved",
              });
            }
          } finally {
            (db as any).isSyncingInternal = false;
          }
        }
      } else if (entityType === "standard") {
        const result = await api.gitApproveStandard?.({
          repoPath: state.gitRepoPath,
          standardId: changeId,
        });

        if (result?.success) {
          (db as any).isSyncingInternal = true;
          try {
            const targetStandard = await db.standards.get(changeId);
            if (targetStandard) {
              const approvedStandard: any = {
                ...targetStandard,
                status: "approved",
                manifest: {
                  ...targetStandard.manifest,
                  isBuiltin: false,
                },
              };
              await upsertStandard(approvedStandard as any);
            }
          } finally {
            (db as any).isSyncingInternal = false;
          }
        }
      }
    } else if (action === "reject") {
      if (entityType === "profile") {
        if (api.gitRejectProfile) {
          await api.gitRejectProfile(changeId);
        }
        (db as any).isSyncingInternal = true;
        try {
          const targetProfile = await db.profiles.get(changeId);
          if (targetProfile) {
            await upsertProfile({ ...targetProfile, status: "local" as const });
          }
        } finally {
          (db as any).isSyncingInternal = false;
        }
      } else if (entityType === "standard") {
        if (api.gitRejectStandard) {
          await api.gitRejectStandard({
            repoPath: state.gitRepoPath,
            standardId: changeId,
          });
        }
        (db as any).isSyncingInternal = true;
        try {
          const targetStandard = await db.standards.get(changeId);
          if (targetStandard) {
            const rolledBackStandard: any = {
              ...targetStandard,
              status: "local"
            };
            await upsertStandard(rolledBackStandard as any);
          }
        } finally {
          (db as any).isSyncingInternal = false;
        }
      }
    }

    set((s) => ({
      pendingCommits: s.pendingCommits.filter((c) => c.id !== commitId),
    }));

    await get().refreshLocalChanges();
  }
}));
