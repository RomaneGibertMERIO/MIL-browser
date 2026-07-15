export interface CustomElectronAPI {
  getSystemUsername: () => Promise<string>;
  gitSetRepoPath: (path: string) => Promise<{ success: boolean; error?: string }>;
  gitSync: (username: string) => Promise<{ success: boolean; error?: string; pulledProfiles?: any[] }>;
  gitSubmitProfile: (profile: any) => Promise<{ success: boolean; error?: string }>;
  gitApproveProfile: (profileId: string) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  // On utilise un type d'intersection direct sur l'objet Window existant
  interface Window {
    electronAPI: CustomElectronAPI;
  }
}

// Cette ligne force TypeScript à traiter ce fichier comme un module
export {};
