import { app, BrowserWindow, shell } from "electron";
import path from "path";

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

  // DEV vs PROD
  if (!app.isPackaged) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(process.cwd(), "dist/index.html"));
  }

  // liens externes
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
