"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));

// ---------------------------------------------------------------------------
// 1. ENREGISTRER LE HANDLER DÈS LE DÉPART (Hors de createWindow)
// ---------------------------------------------------------------------------
electron_1.ipcMain.handle('get-builtin-database', async () => {
    try {
        const isDev = !electron_1.app.isPackaged;
        
        const jsonPath = isDev
            ? path_1.default.join(electron_1.app.getAppPath(), "src/core/engine/database.json")
            : path_1.default.join(process.resourcesPath, "database.json");

        if (fs_1.default.existsSync(jsonPath)) {
            const rawData = fs_1.default.readFileSync(jsonPath, "utf-8");
            return JSON.parse(rawData);
        }
        console.warn("Fichier JSON introuvable sur le chemin :", jsonPath);
        return null;
    } catch (error) {
        console.error("Erreur lors de la lecture du JSON builtin:", error);
        return null;
    }
});

// ---------------------------------------------------------------------------
// 2. CRÉATION DE LA FENÊTRE
// ---------------------------------------------------------------------------
function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            preload: path_1.default.join(__dirname, "preload.js"), // Vérifie bien si c'est preload.js ou preloads.js !
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    if (!electron_1.app.isPackaged) {
        win.loadURL("http://localhost:5173");
    }
    else {
        win.loadFile(path_1.default.join(electron_1.app.getAppPath(), "dist/index.html"));
    }

    win.webContents.setWindowOpenHandler(({ url }) => {
        electron_1.shell.openExternal(url);
        return { action: "deny" };
    });
}

electron_1.app.whenReady().then(createWindow);

electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
