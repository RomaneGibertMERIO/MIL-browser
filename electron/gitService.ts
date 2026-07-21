import * as fs from "fs";
import * as path from "path";
import * as git from "isomorphic-git";
import { app } from "electron";

// 🛡️ Déclarées en variables globales pour être partagées, mais évaluées au bon moment
let WORKSPACE_DIR: string;
let PROFILES_DIR: string;
let STANDARDS_DIR: string;

function ensureDirectories(baseDir?: string) {
  // Initialisation sécurisée uniquement lors du premier appel de fonction
  if (!WORKSPACE_DIR) {
    WORKSPACE_DIR = path.join(app.getPath("userData"), "git-workspace");
    PROFILES_DIR = path.join(WORKSPACE_DIR, "profiles");
    STANDARDS_DIR = path.join(WORKSPACE_DIR, "standards");
  }

  const targetBase = baseDir || WORKSPACE_DIR;
  const profs = path.join(targetBase, "profiles");
  const stds = path.join(targetBase, "standards");
  
  if (!fs.existsSync(targetBase)) fs.mkdirSync(targetBase, { recursive: true });
  if (!fs.existsSync(profs)) fs.mkdirSync(profs, { recursive: true });
  if (!fs.existsSync(stds)) fs.mkdirSync(stds, { recursive: true });
}

/**
 * Fichier de contrôle d'accès, à la racine du dépôt central.
 * Format : { "admins": ["jdupont", "rgibert"] }
 *
 * Absent ou vide => tout le monde est administrateur. C'est délibéré : le
 * comportement reste celui d'avant tant que le fichier n'est pas créé, plutôt
 * que de rendre l'application inutilisable après mise à jour.
 */
const ADMINS_FILE = "admins.json";

/** Marqueurs de refus déposés par l'admin, consommés par les postes clients. */
const REJECTIONS_SUBDIR = "rejections";

export interface RejectionMarker {
  entity: "profile" | "standard";
  id: string;
  rejectedBy: string;
  rejectedAt: string;
  reason: string;
}

export function readAdmins(remoteInput: string): string[] {
  try {
    const file = path.join(getFsPath(remoteInput), ADMINS_FILE);
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const list = Array.isArray(parsed) ? parsed : parsed?.admins;
    if (!Array.isArray(list)) return [];
    return list.filter((entry: unknown): entry is string => typeof entry === "string");
  } catch (err) {
    console.warn("Lecture de admins.json impossible, acces ouvert par defaut :", err);
    return [];
  }
}

/** Comparaison insensible à la casse : les noms de session Windows varient. */
export function isAdminUser(remoteInput: string, username: string): boolean {
  const admins = readAdmins(remoteInput);
  if (admins.length === 0) return true;
  return admins.some((a) => a.trim().toLowerCase() === username.trim().toLowerCase());
}

function getFsPath(remoteInput: string): string {
  if (remoteInput.startsWith("file://")) {
    // Nettoyage manuel du prefixe file:// sans module ESM
    return path.resolve(remoteInput.replace(/^file:\/\/\/?/, ""));
  }
  return path.resolve(remoteInput);
}

/**
 * Synchronise les fichiers du dépôt central vers le workspace local (Simule le Pull)
 */
export async function initOrCloneRepository(remoteInput: string): Promise<void> {
  ensureDirectories();
  
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

    if (!fs.existsSync(centralSub)) continue;

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

    // PURGE : supprime du workspace local ce qui n'existe plus côté central.
    // Sans cela, pullRepository (qui lit le workspace, pas le central) faisait
    // ressusciter indéfiniment les propositions supprimées ou refusées.
    //
    // Garde-fou : on ne purge QUE si le dossier central est lisible et non vide.
    // Un partage réseau momentanément inaccessible, ou un chemin mal saisi,
    // ne doit jamais entraîner l'effacement du travail local.
    if (files.length === 0) continue;

    const centralNames = new Set(files);
    for (const localFile of fs.readdirSync(localSub).filter(f => f.endsWith(".json"))) {
      if (!centralNames.has(localFile)) {
        fs.unlinkSync(path.join(localSub, localFile));
        console.log(`Workspace purge : ${localFile} n'existe plus dans le depot central.`);
      }
    }
  }
}

/** Lit les marqueurs de refus déposés par l'administrateur. */
export function readRejections(remoteInput: string): RejectionMarker[] {
  const dir = path.join(getFsPath(remoteInput), REJECTIONS_SUBDIR);
  if (!fs.existsSync(dir)) return [];

  const markers: RejectionMarker[] = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
    try {
      markers.push(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
    } catch (err) {
      console.warn(`Marqueur de refus illisible ignore : ${file}`, err);
    }
  }
  return markers;
}

/**
 * Dépose un marqueur de refus et retire la proposition du dépôt central.
 *
 * Le marqueur est nécessaire parce que la simple suppression du fichier ne
 * transporte aucune information : l'auteur ne saurait jamais que sa proposition
 * a été refusée, ni pourquoi.
 */
function writeRejectionMarker(centralPath: string, marker: RejectionMarker): void {
  const dir = path.join(centralPath, REJECTIONS_SUBDIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${marker.entity}-${marker.id}.json`),
    JSON.stringify(marker, null, 2),
    "utf8",
  );
}

export async function pullRepository(
  remoteInput: string,
): Promise<{ standards: any[]; profiles: any[]; rejections: RejectionMarker[]; admins: string[] }> {
  ensureDirectories(); // 🛡️ Sécurise l'accès aux variables globales de chemin
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

  return {
    standards,
    profiles,
    rejections: readRejections(remoteInput),
    admins: readAdmins(remoteInput),
  };
}

/**
 * Retire le marqueur de refus d'une entité.
 *
 * Appelé à chaque nouvelle soumission : sans cela, un profil corrigé et
 * resoumis serait de nouveau marqué comme refusé à la synchronisation
 * suivante, puisque le marqueur serait toujours présent.
 */
function clearRejectionMarker(centralPath: string, entity: "profile" | "standard", id: string): void {
  const file = path.join(centralPath, REJECTIONS_SUBDIR, `${entity}-${id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

/**
 * Pousse le fichier vers le dépôt central commun (Simule le Push réseau)
 */
export async function submitProfileToGit(remoteInput: string, username: string, profile: any): Promise<void> {
  ensureDirectories();
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

  // Resoumission : le refus précédent ne s'applique plus.
  clearRejectionMarker(centralPath, "profile", profile.id);

  console.log(`Fichier synchronisé avec succès vers le dépôt central : ${centralDestPath}`);
}

export async function approveProfileInGit(remoteInput: string, adminUsername: string, profileId: string): Promise<{ success: boolean; error?: string }> {
  try {
    ensureDirectories();
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

    return { success: true };
  } catch (error: any) {
    console.error("Erreur approveProfileInGit:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Refuse un profil proposé. Retire la proposition du dépôt central commun.
 */
export async function rejectProfileInGit(
  remoteInput: string,
  adminUsername: string,
  profileId: string,
  reason: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    ensureDirectories();
    await initOrCloneRepository(remoteInput);
    const centralPath = getFsPath(remoteInput);

    const fileName = `profile-${profileId}.json`;
    const localPath = path.join(PROFILES_DIR, fileName);
    const centralPathFile = path.join(centralPath, "profiles", fileName);

    // 1. Marqueur de refus AVANT suppression : si l'écriture échoue, la
    //    proposition reste en place plutôt que de disparaître sans trace.
    writeRejectionMarker(centralPath, {
      entity: "profile",
      id: profileId,
      rejectedBy: adminUsername,
      rejectedAt: new Date().toISOString(),
      reason,
    });

    // 2. Retire la proposition du dépôt central et du workspace local
    if (fs.existsSync(centralPathFile)) fs.unlinkSync(centralPathFile);
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);

    return { success: true };
  } catch (error: any) {
    console.error("Erreur rejectProfileInGit:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Approuve un standard dans le Git
 */
export async function approveStandardInGit(remoteInput: string, adminUsername: string, standardId: string): Promise<{ success: boolean; error?: string }> {
  try {
    ensureDirectories();
    await initOrCloneRepository(remoteInput);
    const centralPath = getFsPath(remoteInput);

    const fileName = `standard-${standardId}.json`;
    const localPath = path.join(STANDARDS_DIR, fileName);

    if (!fs.existsSync(localPath)) {
      throw new Error(`Impossible de trouver le standard local pour l'ID : ${standardId}`);
    }

    const standard = JSON.parse(fs.readFileSync(localPath, "utf8"));
    standard.status = "approved";
    standard.updatedAt = new Date().toISOString();

    // 1. Sauvegarde locale
    fs.writeFileSync(localPath, JSON.stringify(standard, null, 2), "utf8");
    
    try {
      const relativePath = path.join("standards", fileName).replace(/\\/g, "/");
      await git.add({ fs, dir: WORKSPACE_DIR, filepath: relativePath });
      await git.commit({
        fs,
        dir: WORKSPACE_DIR,
        message: `Approval: Standard "${standard.manifest.label}" approuvé par l'admin ${adminUsername}`,
        author: { name: adminUsername, email: `${adminUsername.toLowerCase().replace(/\s+/g, "")}@milbrowser.local` }
      });
    } catch (e) {}

    // 2. Envoi vers le dépôt central
    const centralDestPath = path.join(centralPath, "standards", fileName);
    fs.writeFileSync(centralDestPath, JSON.stringify(standard, null, 2), "utf8");

    return { success: true };
  } catch (error: any) {
    console.error("Erreur approveStandardInGit:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Pousse un standard vers le dépôt central commun (Simule le Push réseau)
 */
export async function submitStandardToGit(remoteInput: string, username: string, standard: any): Promise<void> {
  ensureDirectories();
  await initOrCloneRepository(remoteInput);
  const centralPath = getFsPath(remoteInput);

  const standardToSave = {
    ...standard,
    status: "pending",
    source: "user",
    lastModifiedBy: username,
    updatedAt: new Date().toISOString()
  };

  const fileName = `standard-${standard.manifest.id}.json`;
  
  // 1. Écriture locale (Workspace)
  const localPath = path.join(STANDARDS_DIR, fileName);
  fs.writeFileSync(localPath, JSON.stringify(standardToSave, null, 2), "utf8");

  // Versionning local
  try {
    const relativePath = path.join("standards", fileName).replace(/\\/g, "/");
    await git.add({ fs, dir: WORKSPACE_DIR, filepath: relativePath });
    await git.commit({
      fs,
      dir: WORKSPACE_DIR,
      message: `Proposal: Standard "${standard.manifest.label}" proposé par ${username}`,
      author: { name: username, email: `${username.toLowerCase().replace(/\s+/g, "")}@milbrowser.local` }
    });
  } catch (e) {
    console.warn("Git commit local ignoré pour le standard", e);
  }

  // 2. PUSH SIMULÉ : Copie vers le dépôt central partagé
  const centralStdsDir = path.join(centralPath, "standards");
  if (!fs.existsSync(centralStdsDir)) fs.mkdirSync(centralStdsDir, { recursive: true });
  
  const centralDestPath = path.join(centralStdsDir, fileName);
  fs.writeFileSync(centralDestPath, JSON.stringify(standardToSave, null, 2), "utf8");

  clearRejectionMarker(centralPath, "standard", standard.manifest.id);

  console.log(`Standard synchronisé avec succès vers le dépôt central : ${centralDestPath}`);
}


/**
 * Refuse un standard proposé. Supprime le fichier du dépôt central et réinitialise en local.
 */
export async function rejectStandardInGit(
  remoteInput: string,
  adminUsername: string,
  standardId: string,
  reason: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    ensureDirectories();
    await initOrCloneRepository(remoteInput);
    const centralPath = getFsPath(remoteInput);

    const fileName = `standard-${standardId}.json`;
    const localPath = path.join(STANDARDS_DIR, fileName);
    const centralPathFile = path.join(centralPath, "standards", fileName);

    writeRejectionMarker(centralPath, {
      entity: "standard",
      id: standardId,
      rejectedBy: adminUsername,
      rejectedAt: new Date().toISOString(),
      reason,
    });

    if (fs.existsSync(centralPathFile)) fs.unlinkSync(centralPathFile);
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);

    return { success: true };
  } catch (error: any) {
    console.error("Erreur rejectStandardInGit:", error);
    return { success: false, error: error.message };
  }
}
