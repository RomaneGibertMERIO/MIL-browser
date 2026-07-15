import * as fs from "fs";
import * as path from "path";
import * as git from "isomorphic-git";
import http from "isomorphic-git/http/node"; // <-- Import du client HTTP requis
import { app } from "electron";

// Le workspace local dans AppData de l'utilisateur
const WORKSPACE_DIR = path.join(app.getPath("userData"), "git-workspace");
const PROFILES_DIR = path.join(WORKSPACE_DIR, "profiles");
const STANDARDS_DIR = path.join(WORKSPACE_DIR, "standards");

/**
 * Assure la présence des dossiers physiques requis
 */
function ensureDirectories() {
  if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });
  if (!fs.existsSync(STANDARDS_DIR)) fs.mkdirSync(STANDARDS_DIR, { recursive: true });
}

/**
 * Initialise le dépôt local ou le clone depuis le réseau s'il n'existe pas
 */
export async function initOrCloneRepository(remotePath: string): Promise<void> {
  ensureDirectories();
  
  if (!remotePath || remotePath.trim() === "") {
    throw new Error("Aucun chemin de dépôt central réseau n'est configuré.");
  }

  const isGitRepo = fs.existsSync(path.join(WORKSPACE_DIR, ".git"));

  if (!isGitRepo) {
    // Si le dossier réseau n'existe pas encore physiquement
    if (!fs.existsSync(remotePath)) {
      throw new Error(`Le chemin réseau spécifié est introuvable ou inaccessible : ${remotePath}`);
    }

    console.log(`Clonage du dépôt distant depuis : ${remotePath} vers ${WORKSPACE_DIR}`);
    await git.clone({
      fs,
      http, // <-- Injecté ici
      dir: WORKSPACE_DIR,
      url: remotePath,
      singleBranch: true,
      ref: "main",
      depth: 1
    });
  } else {
    // Si déjà cloné, on s'assure que l'URL remote correspond bien (en cas de changement dans les settings)
    const remotes = await git.listRemotes({ fs, dir: WORKSPACE_DIR });
    const origin = remotes.find(r => r.remote === "origin");
    if (origin && origin.url !== remotePath) {
      console.log(`Changement du remote détecté. Ancienne URL : ${origin.url} -> Nouvelle : ${remotePath}`);
      await git.addRemote({ fs, dir: WORKSPACE_DIR, remote: "origin", url: remotePath, force: true });
    }
  }
}

/**
 * Récupère les dernières mises à jour du serveur de fichier (Pull)
 * et renvoie la liste complète des profils et standards approuvés
 */
export async function pullRepository(remotePath: string): Promise<{ standards: any[]; profiles: any[] }> {
  await initOrCloneRepository(remotePath);

  console.log("Exécution de git pull...");
  try {
    await git.pull({
      fs,
      http, // <-- Injecté ici
      dir: WORKSPACE_DIR,
      ref: "main",
      singleBranch: true,
      author: { name: "System", email: "system@milbrowser.local" }
    });
  } catch (error) {
    console.warn("Échec du pull réseau (travail hors-ligne ?) :", error);
  }

  // Lecture de tous les fichiers JSON approuvés récupérés du dépôt
  const standards: any[] = [];
  const profiles: any[] = [];

  if (fs.existsSync(STANDARDS_DIR)) {
    const files = fs.readdirSync(STANDARDS_DIR).filter(f => f.endsWith(".json"));
    for (const file of files) {
      const data = fs.readFileSync(path.join(STANDARDS_DIR, file), "utf8");
      standards.push(JSON.parse(data));
    }
  }

  if (fs.existsSync(PROFILES_DIR)) {
    const files = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith(".json"));
    for (const file of files) {
      const data = fs.readFileSync(path.join(PROFILES_DIR, file), "utf8");
      profiles.push(JSON.parse(data));
    }
  }

  return { standards, profiles };
}

/**
 * Écrit un profil individuel dans le workspace et le pousse vers le dépôt central
 */
export async function submitProfileToGit(remotePath: string, username: string, profile: any): Promise<void> {
  await initOrCloneRepository(remotePath);
  ensureDirectories();

  // On force le statut à "pending" pour validation par l'admin
  const profileToSave = {
    ...profile,
    status: "pending",
    author: username,
    updatedAt: new Date().toISOString()
  };

  const fileName = `profile-${profile.id}.json`;
  const filePath = path.join(PROFILES_DIR, fileName);

  fs.writeFileSync(filePath, JSON.stringify(profileToSave, null, 2), "utf8");

  // Git Add
  const relativePath = path.join("profiles", fileName).replace(/\\/g, "/");
  await git.add({ fs, dir: WORKSPACE_DIR, filepath: relativePath });

  // Git Commit
  await git.commit({
    fs,
    dir: WORKSPACE_DIR,
    message: `Proposal: Profil "${profile.name}" soumis par ${username}`,
    author: {
      name: username,
      email: `${username.toLowerCase().replace(/\s+/g, "")}@milbrowser.local`
    }
  });

  // Git Push
  console.log("Envoi de la proposition sur le dépôt réseau...");
  await git.push({
    fs,
    http, // <-- Injecté ici
    dir: WORKSPACE_DIR,
    ref: "main",
    remote: "origin"
  });
}

/**
 * Approuve un profil proposé (Action Admin) : change son statut à "approved" et push
 */
export async function approveProfileInGit(remotePath: string, adminUsername: string, profileId: string): Promise<void> {
  await initOrCloneRepository(remotePath);
  ensureDirectories();

  const fileName = `profile-${profileId}.json`;
  const filePath = path.join(PROFILES_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Impossible de trouver le fichier de proposition pour l'ID : ${profileId}`);
  }

  const profile = JSON.parse(fs.readFileSync(filePath, "utf8"));
  
  // Passage du profil en approuvé
  profile.status = "approved";
  profile.updatedAt = new Date().toISOString();

  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2), "utf8");

  const relativePath = path.join("profiles", fileName).replace(/\\/g, "/");
  await git.add({ fs, dir: WORKSPACE_DIR, filepath: relativePath });

  await git.commit({
    fs,
    dir: WORKSPACE_DIR,
    message: `Approval: Profil "${profile.name}" approuvé par l'administrateur ${adminUsername}`,
    author: {
      name: adminUsername,
      email: `${adminUsername.toLowerCase().replace(/\s+/g, "")}@milbrowser.local`
    }
  });

  await git.push({
    fs,
    http, // <-- Injecté ici
    dir: WORKSPACE_DIR,
    ref: "main",
    remote: "origin"
  });
}
