export interface CustomElectronAPI {
  getSystemUsername: () => Promise<string>;
  gitSetRepoPath: (path: string) => Promise<{ success: boolean; error?: string }>;
  gitSync: (username: string) => Promise<{
    success: boolean;
    pulledProfiles?: any[];
    pulledStandards?: any[];
    error?: string;
  }>;
  gitSubmitProfile: (payload: { username: string; profile: any }) => Promise<{ success: boolean; error?: string }>;
  gitApproveProfile: (profileId: string) => Promise<{ success: boolean; error?: string }>;
  
  gitSubmitStandard: (payload: { repoPath: string; username: string; standard: any }) => Promise<{ success: boolean; error?: string }>;
  gitApproveStandard: (payload: { repoPath: string; standardId: string }) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: CustomElectronAPI;
  }
}

export {};
