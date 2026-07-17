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

ipcMain.handle("git:approve-profile", async (_event, profileId: string) => {
  try {
    if (!activeRemotePath) {
      return { success: false, error: "Le chemin du dépôt central n'est pas défini." };
    }
    // Avec la fonction gitService mise à jour, on récupère le résultat { success: true }
    return await approveProfileInGit(activeRemotePath, "Administrator", profileId);
  } catch (error: any) {
    console.error("Erreur git:approve-profile:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("git:submit-standard", async (_event, payload) => {
  try {
    const { repoPath, username, standard } = payload;
    // On utilise le chemin passé en paramètre, ou le chemin actif par défaut
    const targetPath = repoPath || activeRemotePath;
    
    if (!targetPath) {
      return { success: false, error: "Aucun dépôt Git configuré." };
    }

    await submitStandardToGit(targetPath, username, standard);
    return { success: true };
  } catch (error: any) {
    console.error("Erreur git:submit-standard:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("git:approve-standard", async (_event, payload) => {
  try {
    const { repoPath, standardId } = payload;
    const targetPath = repoPath || activeRemotePath;

    if (!targetPath) {
      return { success: false, error: "Aucun dépôt Git configuré." };
    }

    const adminUsername = "Admin"; 
    // Appelle la fonction de gitService mise à jour qui renvoie { success: true }
    return await approveStandardInGit(targetPath, adminUsername, standardId);
  } catch (error: any) {
    console.error("Erreur git:approve-standard:", error);
    return { success: false, error: error.message };
  }
});
