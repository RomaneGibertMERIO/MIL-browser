"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs")); // <-- AJOUT DE FS

function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            preload: path_1.default.join(__dirname, "preloads.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    if (!electron_1.app.isPackaged) {
        win.loadURL("http://localhost:5173");
    }
    else {
        // CORRECTION ICI : En prod, l'application doit viser les ressources du package, pas le dossier de travail courant
        win.loadFile(path_1.default.join(electron_1.app.getAppPath(), "dist/index.html"));
    }

    win.webContents.setWindowOpenHandler(({ url }) => {
        electron_1.shell.openExternal(url);
        return { action: "deny" };
    });
}

// IPC HANDLER : Écoute la demande de React pour lui fournir le gros JSON
electron_1.ipcMain.handle('get-builtin-database', async () => {
    try {
        const isDev = !electron_1.app.isPackaged;
        
        // Si dev : on cherche dans les sources. Si prod : on cherche dans les extraResources
        const jsonPath = isDev
            ? path_1.default.join(electron_1.app.getAppPath(), "src/core/engine/database.json")
            : path_1.default.join(process.resourcesPath, "database.json");

        if (fs_1.default.existsSync(jsonPath)) {
            const rawData = fs_1.default.readFileSync(jsonPath, "utf-8");
            return JSON.parse(rawData);
        }
        return null;
    } catch (error) {
        console.error("Erreur lors de la lecture du JSON builtin:", error);
        return null;
    }
});

electron_1.app.whenReady().then(createWindow);

electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
