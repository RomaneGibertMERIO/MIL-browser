import { app, BrowserWindow, shell, ipcMain } from "electron";
import path from "path";
import os from "os";
import fs from "fs";
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
  isAdminUser,
  deleteProfileFromGit,
  deleteStandardFromGit,
  readRole,
  recordSession,
  readSessions,
  setUserRole,
  type UserRole
} from "./gitService";

/**
 * Identité de l'utilisateur, résolue par le processus principal.
 *
 * Volontairement NON fournie par le renderer : c'est elle qui sert à la fois
 * de signature des validations et de clé du contrôle d'accès administrateur.
 * La faire transiter depuis l'interface la rendrait falsifiable.
 */
function currentUser(): string {
  // Aide au TEST des rôles : si MIL_BROWSER_USER est défini, on l'utilise comme
  // identité à la place du compte Windows. Cela permet, sur un seul poste, de
  // lancer l'app sous différentes identités (donc différents rôles) sans créer
  // de comptes Windows. Exemple (PowerShell) :
  //   $env:MIL_BROWSER_USER="alice"; & ".\MIL-Browser-Portable-0.2.0.exe"
  // Le contrôle d'accès reste de toute façon un modèle de confiance interne :
  // cette surcharge ne l'affaiblit pas (quiconque règle une variable
  // d'environnement contrôle déjà la session).
  const override = process.env.MIL_BROWSER_USER;
  if (override && override.trim() !== "") {
    console.log(`[main] Identité simulée via MIL_BROWSER_USER = "${override.trim()}"`);
    return override.trim();
  }
  return os.userInfo().username || "Unknown-User";
}

/** Refuse l'opération si l'utilisateur courant n'est pas administrateur. */
async function assertAdmin(repoPath: string): Promise<{ success: false; error: string } | null> {
  if (await isAdminUser(repoPath, currentUser())) return null;
  return {
    success: false,
    error:
      `Compte "${currentUser()}" non autorise : action reservee aux administrateurs.`,
  };
}

/** Refuse l'opération si l'utilisateur courant est en lecture seule. */
async function assertCanContribute(repoPath: string): Promise<{ success: false; error: string } | null> {
  const role = await readRole(repoPath, currentUser());
  if (role !== "readonly") return null;
  return {
    success: false,
    error:
      `Compte "${currentUser()}" en lecture seule : la soumission de modifications ` +
      `requiert un role "testing" ou "admin", attribue par un administrateur.`,
  };
}

/**
 * Journalise la console du renderer dans un fichier.
 *
 * Sur un poste de laboratoire, ouvrir les DevTools n'est pas toujours possible
 * ni pratique. Ce journal donne une trace exploitable après coup : sans lui,
 * un `console.error` survenu en production est définitivement perdu.
 *
 * Fichier : %APPDATA%/mil-browser/logs/renderer.log (tronqué à 2 Mo).
 */
function attachRendererLog(win: BrowserWindow): void {
  const logDir = path.join(app.getPath("userData"), "logs");
  const logFile = path.join(logDir, "renderer.log");

  try {
    fs.mkdirSync(logDir, { recursive: true });
    // Rotation naïve : au-delà de 2 Mo on repart de zéro, pour ne jamais
    // saturer le disque d'un poste laissé allumé des semaines.
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 2 * 1024 * 1024) {
      fs.writeFileSync(logFile, "", "utf8");
    }
    fs.appendFileSync(logFile, `\n===== Session ${new Date().toISOString()} =====\n`, "utf8");
  } catch (err) {
    console.error("Journal du renderer indisponible :", err);
    return;
  }

  const LEVELS = ["VERBOSE", "INFO", "WARN", "ERROR"];

  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const label = LEVELS[level] ?? String(level);
    const source = sourceId ? `${sourceId}:${line}` : "";
    // Écriture asynchrone : un message volumineux ne doit pas bloquer la boucle
    // d'événements du processus principal. On tronque aussi par sécurité.
    const safeMessage = typeof message === "string" && message.length > 4000
      ? `${message.slice(0, 4000)}… [${message.length} caractères]`
      : message;
    fs.promises
      .appendFile(logFile, `[${new Date().toISOString()}] ${label} ${safeMessage}${source ? `  (${source})` : ""}\n`, "utf8")
      .catch(() => {
        // Un échec d'écriture du journal ne doit jamais perturber l'application.
      });
  });
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

  attachRendererLog(win);

  // Ouverture de la console avec F12 ou Ctrl+Shift+I.
  //
  // `before-input-event` se déclenche pour CHAQUE événement clavier, donc deux
  // fois par appui (keyDown puis keyUp). Sans le filtre ci-dessous, la console
  // s'ouvrait puis se refermait immédiatement : le raccourci semblait mort.
  // En développement le bug passait inaperçu, la console étant ouverte
  // automatiquement plus bas.
  win.webContents.on("before-input-event", (event: any, input: any) => {
    if (input.type !== "keyDown") return;

    const key = typeof input.key === "string" ? input.key.toLowerCase() : "";
    const isDevToolsShortcut = key === "f12" || (input.control && input.shift && key === "i");

    if (isDevToolsShortcut) {
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
  const admins = await readAdmins(targetPath);
  return {
    success: true,
    admins,
    currentUser: currentUser(),
    isAdmin: admins.length === 0 || admins.some(
      (a) => a.trim().toLowerCase() === currentUser().trim().toLowerCase(),
    ),
    // Vrai quand admins.json est absent/vide : l'accès est alors ouvert à tous.
    unrestricted: admins.length === 0,
  };
});

ipcMain.handle("git:list-sessions", async (_event, repoPath?: string) => {
  const targetPath = repoPath || activeRemotePath;
  if (!targetPath) {
    return { success: false, error: "Aucun dépôt Git configuré." };
  }
  const denied = await assertAdmin(targetPath);
  if (denied) return denied;
  return { success: true, sessions: await readSessions(targetPath), currentUser: currentUser() };
});

ipcMain.handle("git:set-role", async (_event, payload) => {
  try {
    const { repoPath, username, role } = payload as { repoPath?: string; username: string; role: UserRole };
    const targetPath = repoPath || activeRemotePath;
    if (!targetPath) {
      return { success: false, error: "Aucun dépôt Git configuré." };
    }
    if (role !== "admin" && role !== "testing" && role !== "readonly") {
      return { success: false, error: `Rôle invalide : ${role}` };
    }
    const denied = await assertAdmin(targetPath);
    if (denied) return denied;

    // Garde-fou : un admin ne peut pas se retirer à lui-même le dernier rôle
    // admin (risque de verrouillage total du dépôt).
    if (role !== "admin" && username.trim().toLowerCase() === currentUser().trim().toLowerCase()) {
      const sessions = await readSessions(targetPath);
      const otherAdmins = sessions.filter(
        (s) => s.role === "admin" && s.username.trim().toLowerCase() !== currentUser().trim().toLowerCase(),
      );
      if (otherAdmins.length === 0) {
        return {
          success: false,
          error: "Impossible : vous êtes le dernier administrateur. Promouvez d'abord un autre compte.",
        };
      }
    }

    return await setUserRole(targetPath, username, role);
  } catch (error: any) {
    console.error("Erreur git:set-role:", error);
    return { success: false, error: error.message };
  }
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
    const me = currentUser();
    // Enregistre le passage de ce poste (même un simple pull) pour alimenter la
    // liste des sessions que l'admin consulte. Ne bloque jamais la synchro.
    await recordSession(activeRemotePath, me);

    const { standards, profiles, rejections, deletions, admins } = await pullRepository(activeRemotePath);
    const role = await readRole(activeRemotePath, me);
    return {
      success: true,
      pulledProfiles: profiles,
      pulledStandards: standards,
      rejections,
      deletions,
      admins,
      currentUser: me,
      role,
      isAdmin: role === "admin",
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
    const denied = await assertCanContribute(activeRemotePath);
    if (denied) return denied;
    await submitProfileToGit(activeRemotePath, username, profile);
    return { success: true };
  } catch (error: any) {
    console.error("Erreur git:submit-profile:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("git:delete-profile", async (_event, profileId: string) => {
  try {
    if (!activeRemotePath) {
      return { success: false, error: "Le chemin du dépôt central n'est pas défini." };
    }
    return await deleteProfileFromGit(activeRemotePath, currentUser(), profileId);
  } catch (error: any) {
    console.error("Erreur git:delete-profile:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("git:delete-standard", async (_event, payload) => {
  try {
    const { repoPath, standardId } = payload;
    const targetPath = repoPath || activeRemotePath;
    if (!targetPath) {
      return { success: false, error: "Aucun dépôt Git configuré." };
    }
    return await deleteStandardFromGit(targetPath, currentUser(), standardId);
  } catch (error: any) {
    console.error("Erreur git:delete-standard:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("git:approve-profile", async (_event, profileId: string) => {
  try {
    if (!activeRemotePath) {
      return { success: false, error: "Le chemin du dépôt central n'est pas défini." };
    }
    const denied = await assertAdmin(activeRemotePath);
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

    const denied = await assertCanContribute(targetPath);
    if (denied) return denied;
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

    const denied = await assertAdmin(targetPath);
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
    const denied = await assertAdmin(activeRemotePath);
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

    const denied = await assertAdmin(targetPath);
    if (denied) return denied;
    return await rejectStandardInGit(targetPath, currentUser(), standardId, reason ?? "");
  } catch (error: any) {
    console.error("Erreur git:reject-standard:", error);
    return { success: false, error: error.message };
  }
});
