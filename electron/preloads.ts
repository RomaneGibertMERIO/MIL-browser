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

  openBrowserWindow: (payload?: { standardId?: string }) =>
    ipcRenderer.invoke("window:open-browser", payload),

  gitSetRepoPath: (path: string) => ipcRenderer.invoke("git:set-path", path),
  gitSync: (username: string) => ipcRenderer.invoke("git:sync", username),

  gitHistory: (limit?: number) => ipcRenderer.invoke("git:history", limit),

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

  gitRejectDeletion: (payload: { repoPath: string; entity: "profile" | "standard"; id: string; reason: string }) =>
    ipcRenderer.invoke("git:reject-deletion", payload),

  // Écoute du menu natif « Help → User Guide » (main.ts envoie sur ce canal via
  // webContents.send). Ce n'est PAS un invoke : aucun handler ipcMain associé,
  // le renderer se contente d'ouvrir l'overlay du manuel. Renvoie de quoi se
  // désabonner (utilisé dans un useEffect côté renderer).
  onOpenUserGuide: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("menu:open-user-guide", listener);
    return () => ipcRenderer.removeListener("menu:open-user-guide", listener);
  },
};

// Exposé sous les deux noms : "electron" est le nom courant, "electronAPI"
// reste disponible en repli pour du code renderer plus ancien.
contextBridge.exposeInMainWorld("electron", bridge);
contextBridge.exposeInMainWorld("electronAPI", bridge);
