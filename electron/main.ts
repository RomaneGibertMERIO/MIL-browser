import { app, BrowserWindow, shell, ipcMain } from "electron";
import path from "path";
import os from "os"; 
import { fileURLToPath } from "url"; // 🛡️ Requis pour reconstruire les chemins proprement
import { 
  initOrCloneRepository, 
  pullRepository, 
  submitProfileToGit, 
  submitStandardToGit,
  approveStandardInGit,
  approveProfileInGit 
} from "./gitService";

// 🛡️ Compatibilité ESM / Production pour les chemins d'accès
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      // 🛡️ Correction du chemin pour qu'il trouve preloads.js (ou preload.js) tant en dev qu'en prod
      preload: path.join(__dirname, "preloads.js"), 
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) win.webContents.openDevTools();

  if (!app.isPackaged) {
    win.loadURL("http://localhost:5173");
  } else {
    // 🛡️ Assure-toi que le chemin relatif vers dist/index.html reste correct une fois packagé
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// App Ready
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ==========================================
// IPC Handlers (Sécurisés)
// ==========================================

ipcMain.handle("get-system-username", () => {
  return os.userInfo().username || "Unknown-User";
});

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
    return await approveProfileInGit(activeRemotePath, "Administrator", profileId);
  } catch (error: any) {
    console.error("Erreur git:approve-profile:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("git:submit-standard", async (_event, payload) => {
  try {
    const { repoPath, username, standard } = payload;
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
    return await approveStandardInGit(targetPath, adminUsername, standardId);
  } catch (error: any) {
    console.error("Erreur git:approve-standard:", error);
    return { success: false, error: error.message };
  }
});
