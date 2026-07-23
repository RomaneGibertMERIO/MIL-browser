import { contextBridge, ipcRenderer } from "electron";

/**
 * Pont Electron exposé au renderer.
 *
 * ⚠️ Ce fichier doit rester synchronisé avec l'interface `ElectronBridge`
 * (src/shared/electronBridge.ts) et avec les `ipcMain.handle(...)` de
 * electron/main.ts. Le test tests/electronBridge.contract.test.ts vérifie
 * automatiquement que les trois restent alignés.
 */
const bridge = {
  getSystemUsername: () => ipcRenderer.invoke("get-system-username"),

  gitSetRepoPath: (path: string) => ipcRenderer.invoke("git:set-path", path),
  gitSync: (username: string) => ipcRenderer.invoke("git:sync", username),

  gitSubmitProfile: (payload: { username: string; profile: unknown }) =>
    ipcRenderer.invoke("git:submit-profile", payload),

  gitApproveProfile: (profileId: string) =>
    ipcRenderer.invoke("git:approve-profile", profileId),

  gitRejectProfile: (payload: { profileId: string; reason: string }) =>
    ipcRenderer.invoke("git:reject-profile", payload),

  gitDeleteProfile: (profileId: string) =>
    ipcRenderer.invoke("git:delete-profile", profileId),

  gitDeleteStandard: (payload: { repoPath: string; standardId: string }) =>
    ipcRenderer.invoke("git:delete-standard", payload),

  gitGetAdmins: (repoPath?: string) => ipcRenderer.invoke("git:get-admins", repoPath),

  gitListSessions: (repoPath?: string) => ipcRenderer.invoke("git:list-sessions", repoPath),

  gitSetRole: (payload: { repoPath?: string; username: string; role: string }) =>
    ipcRenderer.invoke("git:set-role", payload),

  gitSubmitStandard: (payload: { repoPath: string; username: string; standard: unknown }) =>
    ipcRenderer.invoke("git:submit-standard", payload),

  gitApproveStandard: (payload: { repoPath: string; standardId: string }) =>
    ipcRenderer.invoke("git:approve-standard", payload),

  gitRejectStandard: (payload: { repoPath: string; standardId: string; reason: string }) =>
    ipcRenderer.invoke("git:reject-standard", payload),
};

// Exposé sous les deux noms : "electron" est le nom courant, "electronAPI"
// reste disponible en repli pour du code renderer plus ancien.
contextBridge.exposeInMainWorld("electron", bridge);
contextBridge.exposeInMainWorld("electronAPI", bridge);
