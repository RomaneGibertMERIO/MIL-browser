export interface CustomElectronAPI {
  getSystemUsername: () => Promise<string>;
  gitSetRepoPath: (path: string) => Promise<{ success: boolean; error?: string }>;
  gitSync: (username: string) => Promise<{ success: boolean; error?: string; pulledProfiles?: any[] }>;
  gitSubmitProfile: (profile: any) => Promise<{ success: boolean; error?: string }>;
  gitApproveProfile: (profileId: string) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    // On surcharge proprement en utilisant un type d'intersection
    electronAPI: CustomElectronAPI;
  }
}
