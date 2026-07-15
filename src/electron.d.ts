export interface CustomElectronAPI {
  getSystemUsername: () => Promise<string>;
  gitSetRepoPath: (path: string) => Promise<{ success: boolean; error?: string }>;
  gitSync: (username: string) => Promise<{ success: boolean; error?: string; pulledProfiles?: any[] }>;
  gitSubmitProfile: (profile: any) => Promise<{ success: boolean; error?: string }>;
  gitApproveProfile: (profileId: string) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    // Rend l'API accessible sans aucun conflit
    electronAPI: CustomElectronAPI;
  }
}

interface ElectronAPI {
  gitSetRepoPath: (path: string) => Promise<{ success: boolean; error?: string }>;
  gitSync: (username: string) => Promise<{ 
    success: boolean; 
    pulledProfiles?: any[]; 
    pulledStandards?: any[]; 
    error?: string 
  }>;
  gitSubmitProfile: (args: { username: string; profile: any }) => Promise<{ success: boolean; error?: string }>;
  gitApproveProfile: (args: { adminUsername: string; profileId: string }) => Promise<{ success: boolean; error?: string }>;
}

interface Window {
  electronAPI?: ElectronAPI;
}

export {};
