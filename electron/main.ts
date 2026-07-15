import { app, BrowserWindow, shell, ipcMain } from "electron";
import path from "path";
import os from "os"; // <-- Added for retrieving the real OS username

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

// <-- Added IPC handler to expose system username securely to React
ipcMain.handle("get-system-username", () => {
  return os.userInfo().username || "Unknown-User";
});

// ── NEW: Git Sync Handlers (Provisoires pour valider l'Étape 1) ──────────
ipcMain.handle("git:set-path", async (_event, path: string) => {
  console.log("Setting remote Git repository path to:", path);
  return { success: true };
});

ipcMain.handle("git:sync", async (_event, username: string) => {
  console.log("Starting Git sync for user:", username);
  // Retourne une liste vide de profils récupérés pour l'instant
  return { success: true, pulledProfiles: [] };
});

ipcMain.handle("git:submit-profile", async (_event, profile: any) => {
  console.log("Submitting profile to workspace:", profile.name);
  return { success: true };
});

ipcMain.handle("git:approve-profile", async (_event, profileId: string) => {
  console.log("Admin approving profile ID:", profileId);
  return { success: true };
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
