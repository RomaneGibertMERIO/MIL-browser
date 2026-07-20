import { contextBridge, ipcRenderer } from "electron";

// 🛡️ Exposition sous le nom exact "electron" attendu par tes stores
contextBridge.exposeInMainWorld("electron", {
  getSystemUsername: () => ipcRenderer.invoke("get-system-username"),
  
  gitSetRepoPath: (path: string) => ipcRenderer.invoke("git:set-path", path),
  gitSync: (username: string) => ipcRenderer.invoke("git:sync", username),
  
  gitSubmitProfile: (payload: { username: string; profile: any }) => 
    ipcRenderer.invoke("git:submit-profile", payload),
    
  gitApproveProfile: (profileId: string) => ipcRenderer.invoke("git:approve-profile", profileId),

  gitSubmitStandard: (payload: { repoPath: string; username: string; standard: any }) =>
    ipcRenderer.invoke("git:submit-standard", payload),

  gitApproveStandard: (payload: { repoPath: string; standardId: string }) => 
    ipcRenderer.invoke("git:approve-standard", payload),
});
