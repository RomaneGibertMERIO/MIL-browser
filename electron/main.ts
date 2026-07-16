import { app, BrowserWindow, shell, ipcMain } from "electron";
import path from "path";
import os from "os"; // <-- Added for retrieving the real OS username
import { 
  initOrCloneRepository, 
  pullRepository, 
  submitProfileToGit, 
  submitStandardToGit,
  approveStandardInGit,
  approveProfileInGit 
} from "./gitService";

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preloads.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) win.webContents.openDevTools();

  if (!app.isPackaged) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}


// <-- Added IPC handler to expose system username securely to React
ipcMain.handle("get-system-username", () => {
  return os.userInfo().username || "Unknown-User";
});

// Variable globale pour retenir le chemin réseau actif de la session
let activeRemotePath: string = "";

ipcMain.handle("git:set-path", async (_event, repoPath: string) => {
  try {
    activeRemotePath = repoPath;
    await initOrCloneRepository(repoPath);
    return { success: true };
  } catch (error: any) {
    console.error("Erreur git:set-path:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("git:sync", async (_event, username: string) => {
  try {
    if (!activeRemotePath) {
      return { success: false, error: "Le chemin du dépôt central n'est pas défini." };
    }
    const { standards, profiles } = await pullRepository(activeRemotePath);
    return { success: true, pulledProfiles: profiles, pulledStandards: standards };
  } catch (error: any) {
    console.error("Erreur git:sync:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("git:submit-profile", async (_event, { username, profile }) => {
  try {
    if (!activeRemotePath) {
      return { success: false, error: "Le chemin du dépôt central n'est pas défini." };
    }
    await submitProfileToGit(activeRemotePath, username, profile);
    return { success: true };
  } catch (error: any) {
    console.error("Erreur git:submit-profile:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("git:approve-profile", async (_event, profileId: string) => { // <-- Reçoit la string directement
  try {
    if (!activeRemotePath) {
      return { success: false, error: "Le chemin du dépôt central n'est pas défini." };
    }
    // Utilise le pseudo actif de la session ou un tag Admin par défaut
    await approveProfileInGit(activeRemotePath, "Administrator", profileId);
    return { success: true };
  } catch (error: any) {
    console.error("Erreur git:approve-profile:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("git:submit-standard", async (event, payload) => {
  const settings = await getSettings(); // Récupère le chemin réseau du dépôt configuré
  const repoPath = settings.gitRepoPath;
  if (!repoPath) throw new Error("Aucun dépôt Git configuré.");

  return await submitStandardToGit(repoPath, payload.username, payload.standard);
});

ipcMain.handle("git:approve-standard", async (event, standardId) => {
  const settings = await getSettings();
  const repoPath = settings.gitRepoPath;
  if (!repoPath) throw new Error("Aucun dépôt Git configuré.");

  // Ici, on récupère le nom de l'admin configuré (ou par défaut "Admin")
  const adminUsername = "Admin"; 
  return await approveStandardInGit(repoPath, adminUsername, standardId);
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
