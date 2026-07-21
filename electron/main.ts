import { app, BrowserWindow, shell, ipcMain } from "electron";
import path from "path";
import os from "os"; 
import {
  initOrCloneRepository,
  pullRepository,
  submitProfileToGit,
  submitStandardToGit,
  approveStandardInGit,
  approveProfileInGit,
  rejectProfileInGit,
  rejectStandardInGit,
  readAdmins,
  isAdminUser
} from "./gitService";

/**
 * Identité de l'utilisateur, résolue par le processus principal.
 *
 * Volontairement NON fournie par le renderer : c'est elle qui sert à la fois
 * de signature des validations et de clé du contrôle d'accès administrateur.
 * La faire transiter depuis l'interface la rendrait falsifiable.
 */
function currentUser(): string {
  return os.userInfo().username || "Unknown-User";
}

/** Refuse l'opération si l'utilisateur courant n'est pas administrateur. */
function assertAdmin(repoPath: string): { success: false; error: string } | null {
  if (isAdminUser(repoPath, currentUser())) return null;
  return {
    success: false,
    error:
      `Compte "${currentUser()}" non autorise a valider. ` +
      `Les administrateurs sont declares dans admins.json, a la racine du depot central.`,
  };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      // __dirname pointe vers le dossier compilé (ex: electron-dist/)
      preload: path.join(__dirname, "preloads.js"), 
      devTools: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Activer le raccourci globalement pour ouvrir la console avec F12 ou Ctrl+Shift+I
  win.webContents.on("before-input-event", (event: any, input: any) => {
    if (input.key === "F12" || (input.control && input.shift && input.key.toLowerCase() === "i")) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  if (!app.isPackaged) {
    win.webContents.openDevTools();
    win.loadURL("http://localhost:5173");
  } else {
    // En prod, le fichier index.html se trouve dans le dossier dist à la racine
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// Initialisation de l'application
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ==========================================
// IPC Handlers
// ==========================================

ipcMain.handle("get-system-username", () => {
  return currentUser();
});

ipcMain.handle("git:get-admins", async (_event, repoPath?: string) => {
  const targetPath = repoPath || activeRemotePath;
  if (!targetPath) {
    return { success: false, error: "Aucun dépôt Git configuré." };
  }
  const admins = readAdmins(targetPath);
  return {
    success: true,
    admins,
    currentUser: currentUser(),
    isAdmin: isAdminUser(targetPath, currentUser()),
    // Vrai quand admins.json est absent/vide : l'accès est alors ouvert à tous.
    unrestricted: admins.length === 0,
  };
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
    const { standards, profiles, rejections, admins } = await pullRepository(activeRemotePath);
    return {
      success: true,
      pulledProfiles: profiles,
      pulledStandards: standards,
      rejections,
      admins,
      currentUser: currentUser(),
      isAdmin: isAdminUser(activeRemotePath, currentUser()),
    };
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
    const denied = assertAdmin(activeRemotePath);
    if (denied) return denied;
    return await approveProfileInGit(activeRemotePath, currentUser(), profileId);
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

    const denied = assertAdmin(targetPath);
    if (denied) return denied;
    return await approveStandardInGit(targetPath, currentUser(), standardId);
  } catch (error: any) {
    console.error("Erreur git:approve-standard:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("git:reject-profile", async (_event, payload) => {
  try {
    const { profileId, reason } = payload;
    if (!activeRemotePath) {
      return { success: false, error: "Le chemin du dépôt central n'est pas défini." };
    }
    const denied = assertAdmin(activeRemotePath);
    if (denied) return denied;
    return await rejectProfileInGit(activeRemotePath, currentUser(), profileId, reason ?? "");
  } catch (error: any) {
    console.error("Erreur git:reject-profile:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("git:reject-standard", async (_event, payload) => {
  try {
    const { repoPath, standardId, reason } = payload;
    const targetPath = repoPath || activeRemotePath;

    if (!targetPath) {
      return { success: false, error: "Aucun dépôt Git configuré." };
    }

    const denied = assertAdmin(targetPath);
    if (denied) return denied;
    return await rejectStandardInGit(targetPath, currentUser(), standardId, reason ?? "");
  } catch (error: any) {
    console.error("Erreur git:reject-standard:", error);
    return { success: false, error: error.message };
  }
});
