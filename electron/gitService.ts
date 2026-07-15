import * as fs from "fs";
import * as path from "path";
import * as git from "isomorphic-git";
import { app } from "electron";
import { fileURLToPath } from "url";

const WORKSPACE_DIR = path.join(app.getPath("userData"), "git-workspace");
const PROFILES_DIR = path.join(WORKSPACE_DIR, "profiles");
const STANDARDS_DIR = path.join(WORKSPACE_DIR, "standards");

function ensureDirectories(baseDir: string = WORKSPACE_DIR) {
  const profs = path.join(baseDir, "profiles");
  const stds = path.join(baseDir, "standards");
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  if (!fs.existsSync(profs)) fs.mkdirSync(profs, { recursive: true });
  if (!fs.existsSync(stds)) fs.mkdirSync(stds, { recursive: true });
}

function getFsPath(remoteInput: string): string {
  if (remoteInput.startsWith("file://")) {
    return fileURLToPath(remoteInput);
  }
  return path.resolve(remoteInput);
}

/**
 * Synchronise les fichiers du dépôt central vers le workspace local (Simule le Pull)
 */
export async function initOrCloneRepository(remoteInput: string): Promise<void> {
  ensureDirectories(WORKSPACE_DIR);
  
  if (!remoteInput || remoteInput.trim() === "") {
    throw new Error("Aucun chemin de dépôt central réseau n'est configuré.");
  }

  const centralPath = getFsPath(remoteInput);
  ensureDirectories(centralPath);

  // Initialisation du Git local s'il n'existe pas pour garder l'arborescence propre
  const isGitRepo = fs.existsSync(path.join(WORKSPACE_DIR, ".git"));
  if (!isGitRepo) {
    await git.init({ fs, dir: WORKSPACE_DIR });
  }

  // PULL SIMULÉ : Copie les fichiers du dépôt central vers le local s'ils sont plus récents
  const subDirs = ["standards", "profiles"];
  for (const sub of subDirs) {
    const centralSub = path.join(centralPath, sub);
    const localSub = path.join(WORKSPACE_DIR, sub);
    
    if (fs.existsSync(centralSub)) {
      const files = fs.readdirSync(centralSub).filter(f => f.endsWith(".json"));
      for (const file of files) {
        const src = path.join(centralSub, file);
        const dest = path.join(localSub, file);
        
        let shouldCopy = true;
        if (fs.existsSync(dest)) {
          const srcStat = fs.statSync(src);
          const destStat = fs.statSync(dest);
          if (srcStat.mtimeMs <= destStat.mtimeMs) shouldCopy = false;
        }
        
        if (shouldCopy) {
          fs.copyFileSync(src, dest);
        }
      }
    }
  }
}

export async function pullRepository(remoteInput: string): Promise<{ standards: any[]; profiles: any[] }> {
  await initOrCloneRepository(remoteInput);

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
 * Pousse le fichier vers le dépôt central commun (Simule le Push réseau)
 */
export async function submitProfileToGit(remoteInput: string, username: string, profile: any): Promise<void> {
  await initOrCloneRepository(remoteInput);
  const centralPath = getFsPath(remoteInput);

  const profileToSave = {
    ...profile,
    status: "pending",
    author: username,
    updatedAt: new Date().toISOString()
  };

  const fileName = `profile-${profile.id}.json`;
  
  // 1. Écriture locale (Workspace)
  const localPath = path.join(PROFILES_DIR, fileName);
  fs.writeFileSync(localPath, JSON.stringify(profileToSave, null, 2), "utf8");

  // Versionning local pour suivi historique
  try {
    const relativePath = path.join("profiles", fileName).replace(/\\/g, "/");
    await git.add({ fs, dir: WORKSPACE_DIR, filepath: relativePath });
    await git.commit({
      fs,
      dir: WORKSPACE_DIR,
      message: `Proposal: Profil "${profile.name}" soumis par ${username}`,
      author: { name: username, email: `${username.toLowerCase().replace(/\s+/g, "")}@milbrowser.local` }
    });
  } catch (e) {
    console.warn("Git commit local ignoré (aucun changement réel)", e);
  }

  // 2. PUSH SIMULÉ : Copie directe et sécurisée du JSON vers le dépôt central partagé
  const centralProfilesDir = path.join(centralPath, "profiles");
  if (!fs.existsSync(centralProfilesDir)) fs.mkdirSync(centralProfilesDir, { recursive: true });
  
  const centralDestPath = path.join(centralProfilesDir, fileName);
  fs.writeFileSync(centralDestPath, JSON.stringify(profileToSave, null, 2), "utf8");
  console.log(`Fichier synchronisé avec succès vers le dépôt central : ${centralDestPath}`);
}

export async function approveProfileInGit(remoteInput: string, adminUsername: string, profileId: string): Promise<void> {
  await initOrCloneRepository(remoteInput);
  const centralPath = getFsPath(remoteInput);

  const fileName = `profile-${profileId}.json`;
  const localPath = path.join(PROFILES_DIR, fileName);

  if (!fs.existsSync(localPath)) {
    throw new Error(`Impossible de trouver la proposition locale pour l'ID : ${profileId}`);
  }

  const profile = JSON.parse(fs.readFileSync(localPath, "utf8"));
  profile.status = "approved";
  profile.updatedAt = new Date().toISOString();

  // 1. Sauvegarde locale
  fs.writeFileSync(localPath, JSON.stringify(profile, null, 2), "utf8");
  
  try {
    const relativePath = path.join("profiles", fileName).replace(/\\/g, "/");
    await git.add({ fs, dir: WORKSPACE_DIR, filepath: relativePath });
    await git.commit({
      fs,
      dir: WORKSPACE_DIR,
      message: `Approval: Profil "${profile.name}" approuvé par l'admin ${adminUsername}`,
      author: { name: adminUsername, email: `${adminUsername.toLowerCase().replace(/\s+/g, "")}@milbrowser.local` }
    });
  } catch (e) {}

  // 2. Envoi vers le dépôt central
  const centralDestPath = path.join(centralPath, "profiles", fileName);
  fs.writeFileSync(centralDestPath, JSON.stringify(profile, null, 2), "utf8");
}
