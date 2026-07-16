import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getSystemUsername: () => ipcRenderer.invoke("get-system-username"),
  
  // Pipeline Git locale
  gitSetRepoPath: (path: string) => ipcRenderer.invoke("git:set-path", path),
  gitSync: (username: string) => ipcRenderer.invoke("git:sync", username),
  
  // Profils IPC
  gitSubmitProfile: (payload: { username: string; profile: any }) => 
    ipcRenderer.invoke("git:submit-profile", payload),
    
  gitApproveProfile: (profileId: string) => ipcRenderer.invoke("git:approve-profile", profileId),

  // ⚠️ AJOUT : Standards IPC
  gitSubmitStandard: (payload: { username: string; standard: any }) =>
    ipcRenderer.invoke("git:submit-standard", payload),

  gitApproveStandard: (standardId: string) => 
    ipcRenderer.invoke("git:approve-standard", standardId),
});
