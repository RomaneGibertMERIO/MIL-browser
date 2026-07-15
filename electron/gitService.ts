import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const WORKSPACE_DIR = path.join(app.getPath("userData"), "git-workspace");
const PROFILES_DIR = path.join(WORKSPACE_DIR, "profiles");
const STANDARDS_DIR = path.join(WORKSPACE_DIR, "standards");

function ensureDirectories() {
  if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });
  if (!fs.existsSync(STANDARDS_DIR)) fs.mkdirSync(STANDARDS_DIR, { recursive: true });
}

/**
 * Initialise ou met à jour le dépôt via le Git natif du système
 */
export async function initOrCloneRepository(remoteInput: string): Promise<void> {
  ensureDirectories();
  
  if (!remoteInput || remoteInput.trim() === "") {
    throw new Error("Aucun chemin de dépôt central réseau n'est configuré.");
  }

  // Nettoyer les reliquats de file:// si l'UI en a envoyé
  const cleanRemotePath = remoteInput.replace(/^file:\/\/\/?/, "").replace(/%20/g, " ");

  if (!fs.existsSync(cleanRemotePath)) {
    throw new Error(`Le chemin spécifié est introuvable ou inaccessible : ${cleanRemotePath}`);
  }

  const isGitRepo = fs.existsSync(path.join(WORKSPACE_DIR, ".git"));

  if (!isGitRepo) {
    console.log(`Clonage natif depuis : ${cleanRemotePath}`);
    // Utilisation du Git système pour cloner proprement un chemin local Windows
    await execAsync(`git clone "${cleanRemotePath}" "${WORKSPACE_DIR}" --depth 1`);
  } else {
    // Vérifier et mettre à jour le remote origin si nécessaire
    try {
      const { stdout } = await execAsync(`git remote get-url origin`, { cwd: WORKSPACE_DIR });
      if (stdout.trim() !== cleanRemotePath) {
        await execAsync(`git remote set-url origin "${cleanRemotePath}"`, { cwd: WORKSPACE_DIR });
      }
    } catch {
      await execAsync(`git remote add origin "${cleanRemotePath}"`, { cwd: WORKSPACE_DIR });
    }
  }
}

export async function pullRepository(remoteInput: string): Promise<{ standards: any[]; profiles: any[] }> {
  await initOrCloneRepository(remoteInput);
  
  try {
    // Git pull natif (gère le protocole fichier sans broncher)
    await execAsync(`git pull origin main`, { cwd: WORKSPACE_DIR });
  } catch (error) {
    console.warn("Échec du pull réseau (travail hors-ligne ?) :", error);
  }

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

export async function submitProfileToGit(remoteInput: string, username: string, profile: any): Promise<void> {
  await initOrCloneRepository(remoteInput);
  ensureDirectories();

  const profileToSave = {
    ...profile,
    status: "pending",
    author: username,
    updatedAt: new Date().toISOString()
  };

  const fileName = `profile-${profile.id}.json`;
  const filePath = path.join(PROFILES_DIR, fileName);

  fs.writeFileSync(filePath, JSON.stringify(profileToSave, null, 2), "utf8");

  const relativePath = path.join("profiles", fileName).replace(/\\/g, "/");
  
  // Suite de commandes Git natives
  await execAsync(`git add "${relativePath}"`, { cwd: WORKSPACE_DIR });
  await execAsync(`git commit -m "Proposal: Profil ${profile.name} par ${username}" --author="${username} <${username}@milbrowser.local>"`, { cwd: WORKSPACE_DIR });
  await execAsync(`git push origin main`, { cwd: WORKSPACE_DIR });
}

export async function approveProfileInGit(remoteInput: string, adminUsername: string, profileId: string): Promise<void> {
  await initOrCloneRepository(remoteInput);
  ensureDirectories();

  const fileName = `profile-${profileId}.json`;
  const filePath = path.join(PROFILES_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Impossible de trouver le fichier de proposition pour l'ID : ${profileId}`);
  }

  const profile = JSON.parse(fs.readFileSync(filePath, "utf8"));
  profile.status = "approved";
  profile.updatedAt = new Date().toISOString();

  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2), "utf8");

  const relativePath = path.join("profiles", fileName).replace(/\\/g, "/");
  
  await execAsync(`git add "${relativePath}"`, { cwd: WORKSPACE_DIR });
  await execAsync(`git commit -m "Approval: Profil ${profile.name} par ${adminUsername}" --author="${adminUsername} <${adminUsername}@milbrowser.local>"`, { cwd: WORKSPACE_DIR });
  await execAsync(`git push origin main`, { cwd: WORKSPACE_DIR });
}
