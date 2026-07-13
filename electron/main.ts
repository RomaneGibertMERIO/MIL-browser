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

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
