import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getSystemUsername: () => ipcRenderer.invoke("get-system-username"),
  
  // Pipeline Git locale
  gitSetRepoPath: (path: string) => ipcRenderer.invoke("git:set-path", path),
  gitSync: (username: string) => ipcRenderer.invoke("git:sync", username),
  
  // CORRECTION : Accepte l'objet complet { username, profile } pour correspondre à l'appel de ton store
  gitSubmitProfile: (payload: { username: string; profile: any }) => 
    ipcRenderer.invoke("git:submit-profile", payload),
    
  gitApproveProfile: (profileId: string) => ipcRenderer.invoke("git:approve-profile", profileId),
});
