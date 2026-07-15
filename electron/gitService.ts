import * as fs from "fs";
import * as path from "path";
import * as git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import { app } from "electron";
import { pathToFileURL, fileURLToPath } from "url"; // <-- Ajout de l'utilitaire d'URL natif de Node.js

const WORKSPACE_DIR = path.join(app.getPath("userData"), "git-workspace");
const PROFILES_DIR = path.join(WORKSPACE_DIR, "profiles");
const STANDARDS_DIR = path.join(WORKSPACE_DIR, "standards");

function ensureDirectories() {
  if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });
  if (!fs.existsSync(STANDARDS_DIR)) fs.mkdirSync(STANDARDS_DIR, { recursive: true });
}

/**
 * Initialise le dépôt local ou le clone depuis le réseau s'il n'existe pas
 */
export async function initOrCloneRepository(remoteInput: string): Promise<void> {
  ensureDirectories();
  
  if (!remoteInput || remoteInput.trim() === "") {
    throw new Error("Aucun chemin de dépôt central réseau n'est configuré.");
  }

  // 1. Normalisation des formats pour Node.js et Isomorphic-Git
  let fsPath = remoteInput;
  let gitUrl = remoteInput;

  if (remoteInput.startsWith("file://")) {
    // Si l'entrée est une URL file://, on extrait le chemin physique pour Node.js
    fsPath = fileURLToPath(remoteInput);
  } else {
    // Si l'entrée est un chemin physique brut (ex: C:\mil-repo), on génère l'URL file:// pour Git
    gitUrl = pathToFileURL(path.resolve(remoteInput)).href;
  }

  const isGitRepo = fs.existsSync(path.join(WORKSPACE_DIR, ".git"));

  if (!isGitRepo) {
    // 2. Node.js vérifie la présence physique via un chemin système natif propre (fsPath)
    if (!fs.existsSync(fsPath)) {
      throw new Error(`Le chemin spécifié est introuvable ou inaccessible sur le disque : ${fsPath}`);
    }

    console.log(`Clonage du dépôt distant depuis : ${gitUrl} vers ${WORKSPACE_DIR}`);
    
    // 3. Isomorphic-Git effectue le clone avec l'URL file:// valide (gitUrl)
    await git.clone({
      fs,
      http,
      dir: WORKSPACE_DIR,
      url: gitUrl,
      singleBranch: true,
      ref: "main",
      depth: 1
    });
  } else {
    // S'assurer que l'URL remote correspond bien si l'utilisateur change la config
    const remotes = await git.listRemotes({ fs, dir: WORKSPACE_DIR });
    const origin = remotes.find(r => r.remote === "origin");
    if (origin && origin.url !== gitUrl) {
      console.log(`Changement du remote détecté. Ancienne URL : ${origin.url} -> Nouvelle : ${gitUrl}`);
      await git.addRemote({ fs, dir: WORKSPACE_DIR, remote: "origin", url: gitUrl, force: true });
    }
  }
}
