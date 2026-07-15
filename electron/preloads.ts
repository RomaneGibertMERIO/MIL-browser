import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getSystemUsername: () => ipcRenderer.invoke("get-system-username"),
  
  // Pipeline Git locale
  gitSetRepoPath: (path: string) => ipcRenderer.invoke("git:set-path", path),
  gitSync: (username: string) => ipcRenderer.invoke("git:sync", username),
  gitSubmitProfile: (profile: any) => ipcRenderer.invoke("git:submit-profile", profile),
  gitApproveProfile: (profileId: string) => ipcRenderer.invoke("git:approve-profile", profileId),
});
