import * as fs from "fs";
import * as path from "path";
import * as git from "isomorphic-git";
import { app } from "electron";

/**
 * ⚠️ RÈGLE ABSOLUE DE CE MODULE : aucune E/S synchrone.
 *
 * Ce service lit et écrit sur un PARTAGE RÉSEAU. Un `readFileSync` ou un
 * `copyFileSync` sur un lecteur lent ou momentanément injoignable bloque la
 * boucle d'événements du processus principal — et un processus principal
 * bloqué ne traite plus les messages de la fenêtre : l'application entière
 * devient insensible au clavier ET à la souris, jusqu'à expiration du délai
 * SMB (souvent 30 à 60 secondes). C'était la cause des "zones de saisie
 * figées" : le symptôme survivait à un rechargement du renderer, précisément
 * parce qu'il ne venait pas du renderer.
 *
 * Toute E/S passe donc par `fsp` (fs.promises). N'introduisez jamais de
 * variante `...Sync` ici.
 */
const fsp = fs.promises;

// 🛡️ Déclarées en variables globales pour être partagées, mais évaluées au bon moment
let WORKSPACE_DIR: string;
let PROFILES_DIR: string;
let STANDARDS_DIR: string;

/** Existence d'un chemin, sans jamais bloquer la boucle d'événements. */
async function exists(target: string): Promise<boolean> {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

/** Liste les fichiers .json d'un dossier ; tableau vide s'il est illisible. */
async function listJson(dir: string): Promise<string[]> {
  try {
    return (await fsp.readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
}

async function ensureDirectories(baseDir?: string): Promise<void> {
  // Initialisation sécurisée uniquement lors du premier appel de fonction
  if (!WORKSPACE_DIR) {
    WORKSPACE_DIR = path.join(app.getPath("userData"), "git-workspace");
    PROFILES_DIR = path.join(WORKSPACE_DIR, "profiles");
    STANDARDS_DIR = path.join(WORKSPACE_DIR, "standards");
  }

  const targetBase = baseDir || WORKSPACE_DIR;

  await fsp.mkdir(targetBase, { recursive: true });
  await fsp.mkdir(path.join(targetBase, "profiles"), { recursive: true });
  await fsp.mkdir(path.join(targetBase, "standards"), { recursive: true });
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

/**
 * Marqueurs de suppression.
 *
 * Supprimer le fichier du dépôt central ne suffit pas à propager une
 * suppression : les autres postes conservent l'enregistrement dans leur base
 * locale, et rien ne leur signale sa disparition. Le marqueur porte cette
 * information, exactement comme pour les refus.
 */
const DELETIONS_SUBDIR = "deletions";

export interface RejectionMarker {
  entity: "profile" | "standard";
  id: string;
  rejectedBy: string;
  rejectedAt: string;
  reason: string;
}

export interface DeletionMarker {
  entity: "profile" | "standard";
  id: string;
  deletedBy: string;
  deletedAt: string;
}

export async function readAdmins(remoteInput: string): Promise<string[]> {
  try {
    const file = path.join(getFsPath(remoteInput), ADMINS_FILE);
    const parsed = JSON.parse(await fsp.readFile(file, "utf8"));
    const list = Array.isArray(parsed) ? parsed : parsed?.admins;
    if (!Array.isArray(list)) return [];
    return list.filter((entry: unknown): entry is string => typeof entry === "string");
  } catch {
    // Fichier absent, illisible ou partage injoignable : accès ouvert par défaut.
    return [];
  }
}

/** Comparaison insensible à la casse : les noms de session Windows varient. */
export async function isAdminUser(remoteInput: string, username: string): Promise<boolean> {
  return (await readRole(remoteInput, username)) === "admin";
}

// ===========================================================================
// Rôles & sessions
// ===========================================================================

export type UserRole = "admin" | "testing" | "readonly";

export interface SessionInfo {
  username: string;
  firstSeen: string;
  lastSeen: string;
  role: UserRole;
}

/** Fichier de rôles à la racine du dépôt : { "roles": { "rgibert": "admin" } }. */
const ACCESS_FILE = "access.json";
/** Un fichier par poste : sessions/<user>.json. */
const SESSIONS_SUBDIR = "sessions";

const norm = (u: string): string => u.trim().toLowerCase();
const safeName = (u: string): string => norm(u).replace(/[^a-z0-9._-]/g, "_") || "unknown";

/**
 * Charge la table des rôles depuis le dépôt central.
 *
 * - Si access.json existe, il fait foi.
 * - Sinon on migre depuis l'ancien admins.json (ses membres deviennent admin).
 * - Si aucun des deux n'existe (dépôt neuf), `source` vaut "none" : l'accès est
 *   alors ouvert à tous pour éviter tout verrouillage, jusqu'à ce qu'un admin
 *   assigne le premier rôle.
 */
async function loadRoles(
  remoteInput: string,
): Promise<{ roles: Record<string, UserRole>; source: "access" | "admins" | "none" }> {
  const base = getFsPath(remoteInput);

  try {
    const parsed = JSON.parse(await fsp.readFile(path.join(base, ACCESS_FILE), "utf8"));
    const raw = parsed?.roles ?? {};
    const roles: Record<string, UserRole> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v === "admin" || v === "testing" || v === "readonly") roles[norm(k)] = v;
    }
    return { roles, source: "access" };
  } catch {
    // access.json absent : on tente la migration depuis admins.json.
  }

  const admins = await readAdmins(remoteInput);
  if (admins.length > 0) {
    const roles: Record<string, UserRole> = {};
    for (const a of admins) roles[norm(a)] = "admin";
    return { roles, source: "admins" };
  }

  return { roles: {}, source: "none" };
}

/**
 * Rôle effectif d'un utilisateur.
 * Dépôt sans contrôle d'accès => admin (comportement ouvert historique).
 * Sinon, non listé => readonly (le plus restrictif).
 */
export async function readRole(remoteInput: string, username: string): Promise<UserRole> {
  const { roles, source } = await loadRoles(remoteInput);
  if (source === "none") return "admin";
  return roles[norm(username)] ?? "readonly";
}

/** Enregistre le passage d'un poste (connexion ou pull) dans le dépôt central. */
export async function recordSession(remoteInput: string, username: string): Promise<void> {
  try {
    const centralPath = getFsPath(remoteInput);
    // Ne JAMAIS recréer le dépôt central : s'il n'existe pas (supprimé /
    // injoignable), on n'écrit rien. Sinon enregistrer une session suffisait à
    // fabriquer un faux dépôt, cassant la « source de vérité » partagée.
    if (!(await exists(centralPath))) return;
    const dir = path.join(centralPath, SESSIONS_SUBDIR);
    await fsp.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${safeName(username)}.json`);

    let firstSeen = new Date().toISOString();
    try {
      const prev = JSON.parse(await fsp.readFile(file, "utf8"));
      if (typeof prev?.firstSeen === "string") firstSeen = prev.firstSeen;
    } catch {
      // Première visite de ce poste.
    }

    await fsp.writeFile(
      file,
      JSON.stringify({ username, firstSeen, lastSeen: new Date().toISOString() }, null, 2),
      "utf8",
    );
  } catch (err) {
    // Le suivi de session ne doit jamais faire échouer une synchronisation.
    console.warn("recordSession impossible :", err);
  }
}

/** Liste toutes les sessions connues, chacune annotée de son rôle courant. */
export async function readSessions(remoteInput: string): Promise<SessionInfo[]> {
  const dir = path.join(getFsPath(remoteInput), SESSIONS_SUBDIR);
  const { roles, source } = await loadRoles(remoteInput);
  const files = await listJson(dir);

  const sessions = await Promise.all(
    files.map(async (f) => {
      try {
        const s = JSON.parse(await fsp.readFile(path.join(dir, f), "utf8"));
        const role: UserRole = source === "none" ? "admin" : roles[norm(s.username)] ?? "readonly";
        return { username: s.username, firstSeen: s.firstSeen, lastSeen: s.lastSeen, role } as SessionInfo;
      } catch {
        return null;
      }
    }),
  );

  return sessions.filter((s): s is SessionInfo => s !== null).sort((a, b) => a.username.localeCompare(b.username));
}

/**
 * Assigne un rôle à un utilisateur (réservé aux admins — vérifié côté main).
 * Écrit access.json en migrant au passage les admins hérités d'admins.json,
 * pour ne perdre personne lors du premier changement de rôle.
 */
export async function setUserRole(
  remoteInput: string,
  targetUser: string,
  role: UserRole,
): Promise<{ success: boolean; error?: string }> {
  try {
    const base = getFsPath(remoteInput);
    const { roles } = await loadRoles(remoteInput);
    roles[norm(targetUser)] = role;
    await fsp.writeFile(path.join(base, ACCESS_FILE), JSON.stringify({ roles }, null, 2), "utf8");
    return { success: true };
  } catch (error: any) {
    console.error("setUserRole impossible :", error);
    return { success: false, error: error.message };
  }
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
/**
 * Sérialise et déduplique les synchronisations.
 *
 * `submitCommit` pousse N entités, et chaque envoi relançait une copie
 * intégrale du dépôt : sur un partage réseau, N synchronisations complètes en
 * rafale. On réutilise donc la synchronisation en cours, et on n'en relance pas
 * une si la précédente date de moins de 3 secondes.
 */
let syncInFlight: Promise<void> | null = null;
let lastSyncAt = 0;
const SYNC_TTL_MS = 3000;

export function initOrCloneRepository(remoteInput: string): Promise<void> {
  if (!remoteInput || remoteInput.trim() === "") {
    return Promise.reject(new Error("No central network repository path is configured."));
  }

  if (syncInFlight) return syncInFlight;
  if (Date.now() - lastSyncAt < SYNC_TTL_MS) {
    // Même dans la fenêtre de cache, on RE-VÉRIFIE que le dépôt central existe
    // toujours. Sinon une écriture (submit/approve…) survenant juste après une
    // synchro réussie sauterait doSync et recréerait un dépôt fantôme au lieu de
    // refuser l'accès. Le dépôt central doit TOUJOURS préexister.
    return exists(getFsPath(remoteInput)).then((ok) => {
      if (!ok) {
        throw new Error(`Central repository not found or unreachable: ${getFsPath(remoteInput)}`);
      }
    });
  }

  syncInFlight = doSync(remoteInput).finally(() => {
    syncInFlight = null;
    lastSyncAt = Date.now();
  });

  return syncInFlight;
}

/** Force une synchronisation, en ignorant le cache court ci-dessus. */
export function forceSync(remoteInput: string): Promise<void> {
  lastSyncAt = 0;
  return initOrCloneRepository(remoteInput);
}

async function doSync(remoteInput: string): Promise<void> {
  await ensureDirectories();

  const centralPath = getFsPath(remoteInput);
  // On EXIGE que le dépôt central existe déjà — on ne le crée JAMAIS à la volée.
  // Un chemin absent = dépôt injoignable ou mal saisi : on lève, l'appelant
  // bascule alors en Offline et refuse les écritures, au lieu de « réussir » en
  // fabriquant un dossier fantôme et de laisser pousser dans le vide (bug 14.8).
  if (!(await exists(centralPath))) {
    throw new Error(`Central repository not found or unreachable: ${centralPath}`);
  }
  await ensureDirectories(centralPath);

  // Initialisation du Git local s'il n'existe pas pour garder l'arborescence propre
  if (!(await exists(path.join(WORKSPACE_DIR, ".git")))) {
    await git.init({ fs, dir: WORKSPACE_DIR });
  }

  // PULL SIMULÉ : Copie les fichiers du dépôt central vers le local s'ils sont plus récents
  for (const sub of ["standards", "profiles"]) {
    const centralSub = path.join(centralPath, sub);
    const localSub = path.join(WORKSPACE_DIR, sub);

    if (!(await exists(centralSub))) continue;

    const files = await listJson(centralSub);

    await Promise.all(
      files.map(async (file) => {
        const src = path.join(centralSub, file);
        const dest = path.join(localSub, file);

        try {
          const [srcStat, destStat] = await Promise.all([
            fsp.stat(src),
            fsp.stat(dest).catch(() => null),
          ]);
          if (destStat && srcStat.mtimeMs <= destStat.mtimeMs) return;
          await fsp.copyFile(src, dest);
        } catch (err) {
          console.warn(`Copie impossible pour ${file} :`, err);
        }
      }),
    );

    // PURGE : le workspace local doit refléter EXACTEMENT le dépôt central
    // (pullRepository lit le workspace, pas le central). On retire les fichiers
    // locaux absents du central — Y COMPRIS quand le central est VIDE (dossier
    // existant mais sans fichier). Sans ça, brancher un dépôt neuf/vide laissait
    // un ancien workspace « polluer » l'état : le dépôt n'était jamais détecté
    // comme vide (aucune bannière de publication du socle) et d'anciennes normes
    // ressuscitaient. L'injoignabilité, elle, est déjà écartée en amont : doSync
    // lève si le chemin central n'existe pas (on ne purge donc jamais sur un
    // partage momentanément inaccessible).
    const centralNames = new Set(files);
    for (const localFile of await listJson(localSub)) {
      if (!centralNames.has(localFile)) {
        await fsp.unlink(path.join(localSub, localFile)).catch(() => undefined);
        console.log(`Workspace purge : ${localFile} absent du depot central.`);
      }
    }
  }
}

/** Lit tous les marqueurs JSON d'un sous-dossier du dépôt central. */
async function readMarkers<T>(remoteInput: string, subDir: string): Promise<T[]> {
  const dir = path.join(getFsPath(remoteInput), subDir);
  const files = await listJson(dir);

  const parsed = await Promise.all(
    files.map(async (file) => {
      try {
        return JSON.parse(await fsp.readFile(path.join(dir, file), "utf8")) as T;
      } catch (err) {
        console.warn(`Marqueur illisible ignore : ${subDir}/${file}`, err);
        return null;
      }
    }),
  );

  // Boucle explicite plutôt qu'un `filter` avec prédicat de type : sur un
  // générique non contraint, Promise.all produit `(Awaited<T> | null)[]`, et
  // TypeScript ne sait pas réduire `Awaited<T>` à `T`. Un prédicat `m is T`
  // est alors rejeté (« A type predicate's type must be assignable to its
  // parameter's type »).
  const markers: T[] = [];
  for (const entry of parsed) {
    if (entry !== null) markers.push(entry as T);
  }
  return markers;
}

/** Lit les marqueurs de refus déposés par l'administrateur. */
export function readRejections(remoteInput: string): Promise<RejectionMarker[]> {
  return readMarkers<RejectionMarker>(remoteInput, REJECTIONS_SUBDIR);
}

/**
 * Dépose un marqueur de refus et retire la proposition du dépôt central.
 *
 * Le marqueur est nécessaire parce que la simple suppression du fichier ne
 * transporte aucune information : l'auteur ne saurait jamais que sa proposition
 * a été refusée, ni pourquoi.
 */
async function writeRejectionMarker(centralPath: string, marker: RejectionMarker): Promise<void> {
  const dir = path.join(centralPath, REJECTIONS_SUBDIR);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(
    path.join(dir, `${marker.entity}-${marker.id}.json`),
    JSON.stringify(marker, null, 2),
    "utf8",
  );
}

export async function pullRepository(remoteInput: string): Promise<{
  standards: any[];
  profiles: any[];
  rejections: RejectionMarker[];
  deletions: DeletionMarker[];
  admins: string[];
}> {
  await ensureDirectories(); // 🛡️ Sécurise l'accès aux variables globales de chemin
  await forceSync(remoteInput);

  // Le workspace est local (userData) : lecture rapide, mais on reste en async
  // par cohérence et pour ne jamais bloquer sur un disque lent.
  async function readAll(dir: string): Promise<any[]> {
    const files = await listJson(dir);
    const parsed = await Promise.all(
      files.map(async (file) => {
        try {
          return JSON.parse(await fsp.readFile(path.join(dir, file), "utf8"));
        } catch (err) {
          console.warn(`Enregistrement illisible ignore : ${file}`, err);
          return null;
        }
      }),
    );
    return parsed.filter((entry) => entry !== null);
  }

  const [standards, profiles, rejections, deletions, admins] = await Promise.all([
    readAll(STANDARDS_DIR),
    readAll(PROFILES_DIR),
    readRejections(remoteInput),
    readDeletions(remoteInput),
    readAdmins(remoteInput),
  ]);

  return { standards, profiles, rejections, deletions, admins };
}

/**
 * Retire le marqueur de refus d'une entité.
 *
 * Appelé à chaque nouvelle soumission : sans cela, un profil corrigé et
 * resoumis serait de nouveau marqué comme refusé à la synchronisation
 * suivante, puisque le marqueur serait toujours présent.
 */
async function clearMarker(
  centralPath: string,
  subDir: string,
  entity: "profile" | "standard",
  id: string,
): Promise<void> {
  const file = path.join(centralPath, subDir, `${entity}-${id}.json`);
  await fsp.unlink(file).catch(() => undefined);
}

/**
 * Efface les marqueurs de refus ET de suppression d'une entité.
 *
 * Appelé lors d'une (re)publication : republier annule aussi bien un refus
 * antérieur qu'une suppression antérieure, sinon les autres postes
 * re-supprimeraient l'entité aussitôt reçue.
 *
 * À ne PAS utiliser depuis la suppression elle-même, qui vient justement
 * d'écrire son marqueur.
 */
async function clearRejectionMarker(
  centralPath: string,
  entity: "profile" | "standard",
  id: string,
): Promise<void> {
  await clearMarker(centralPath, REJECTIONS_SUBDIR, entity, id);
  await clearMarker(centralPath, DELETIONS_SUBDIR, entity, id);
}

/** Lit les marqueurs de suppression déposés par les autres postes. */
export function readDeletions(remoteInput: string): Promise<DeletionMarker[]> {
  return readMarkers<DeletionMarker>(remoteInput, DELETIONS_SUBDIR);
}

/**
 * Supprime une entité du dépôt central et signale la suppression aux autres
 * postes via un marqueur.
 *
 * Le marqueur est écrit AVANT la suppression : si l'écriture échoue, le fichier
 * reste en place plutôt que de disparaître sans que personne n'en soit informé.
 */
async function deleteEntityFromGit(
  remoteInput: string,
  username: string,
  entity: "profile" | "standard",
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureDirectories();
    await initOrCloneRepository(remoteInput);
    const centralPath = getFsPath(remoteInput);

    const subDir = entity === "profile" ? "profiles" : "standards";
    const fileName = `${entity}-${id}.json`;

    const markerDir = path.join(centralPath, DELETIONS_SUBDIR);
    await fsp.mkdir(markerDir, { recursive: true });
    await fsp.writeFile(
      path.join(markerDir, fileName),
      JSON.stringify(
        { entity, id, deletedBy: username, deletedAt: new Date().toISOString() },
        null,
        2,
      ),
      "utf8",
    );

    const centralFile = path.join(centralPath, subDir, fileName);
    const localFile = path.join(WORKSPACE_DIR, subDir, fileName);

    let deletedName = id;
    try {
      const raw = JSON.parse(await fsp.readFile(centralFile, "utf8"));
      deletedName = raw.name ?? raw.manifest?.label ?? id;
    } catch { /* fichier déjà absent : on garde l'id */ }

    await fsp.unlink(centralFile).catch(() => undefined);
    await fsp.unlink(localFile).catch(() => undefined);

    // Une entité supprimée n'a plus de refus en attente. On ne touche PAS au
    // marqueur de suppression écrit juste au-dessus.
    await clearMarker(centralPath, REJECTIONS_SUBDIR, entity, id);

    await appendHistoryEvent(centralPath, {
      id, action: "delete", entity,
      name: deletedName, by: username, at: new Date().toISOString(),
    });

    return { success: true };
  } catch (error: any) {
    console.error(`Erreur deleteEntityFromGit (${entity} ${id}) :`, error);
    return { success: false, error: error.message };
  }
}

export function deleteProfileFromGit(remoteInput: string, username: string, profileId: string) {
  return deleteEntityFromGit(remoteInput, username, "profile", profileId);
}

export function deleteStandardFromGit(remoteInput: string, username: string, standardId: string) {
  return deleteEntityFromGit(remoteInput, username, "standard", standardId);
}

// ── Journal d'audit CENTRAL (partagé) ──────────────────────────────────────
// Le dépôt central est un partage de fichiers, pas un vrai git : pour tracer
// « qui a fait quoi » de façon COMMUNE (visible par tous les admins), on tient
// un journal append-only dans `<central>/history/` — un fichier JSON par
// événement, donc aucun conflit d'écriture même à plusieurs postes. L'onglet
// History lit ce journal (et non plus le git local, propre à une machine).
const HISTORY_SUBDIR = "history";

export interface HistoryEvent {
  id: string;
  action: "submit" | "approve" | "reject" | "delete";
  entity: "profile" | "standard";
  name: string;
  by: string;
  at: string; // ISO-8601
  reason?: string;
}

/** Ajoute un événement au journal central. N'échoue JAMAIS l'action métier. */
async function appendHistoryEvent(centralPath: string, event: HistoryEvent): Promise<void> {
  try {
    const dir = path.join(centralPath, HISTORY_SUBDIR);
    await fsp.mkdir(dir, { recursive: true });
    const fname = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    await fsp.writeFile(path.join(dir, fname), JSON.stringify(event, null, 2), "utf8");
  } catch (err) {
    console.warn("Journal d'historique central : écriture impossible :", err);
  }
}

/** Lit tout le journal central, du plus récent au plus ancien. */
export async function readCentralHistory(remoteInput: string, limit = 500): Promise<HistoryEvent[]> {
  const dir = path.join(getFsPath(remoteInput), HISTORY_SUBDIR);
  const files = await listJson(dir);
  const parsed = await Promise.all(
    files.map(async (f) => {
      try {
        return JSON.parse(await fsp.readFile(path.join(dir, f), "utf8")) as HistoryEvent;
      } catch {
        return null;
      }
    }),
  );
  const events: HistoryEvent[] = [];
  for (const e of parsed) if (e !== null) events.push(e);
  events.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  return events.slice(0, limit);
}

/**
 * Pousse le fichier vers le dépôt central commun (Simule le Push réseau)
 */
export async function submitProfileToGit(remoteInput: string, username: string, profile: any): Promise<void> {
  await ensureDirectories();
  await initOrCloneRepository(remoteInput);
  const centralPath = getFsPath(remoteInput);

  const profileToSave = {
    ...profile,
    status: "pending",
    // Un profil poussé au dépôt central est une contribution partagée, plus un
    // built-in local : sans ça, un profil built-in publié gardait source
    // "builtin" et restait étiqueté « Built-in » au lieu de « Official » une
    // fois validé (cohérent avec submitStandardToGit).
    source: "user",
    author: username,
    updatedAt: new Date().toISOString()
  };

  const fileName = `profile-${profile.id}.json`;
  
  // 1. Écriture locale (Workspace)
  const localPath = path.join(PROFILES_DIR, fileName);
  await fsp.writeFile(localPath, JSON.stringify(profileToSave, null, 2), "utf8");

  // Versionning local pour suivi historique
  try {
    const relativePath = path.join("profiles", fileName).replace(/\\/g, "/");
    await git.add({ fs, dir: WORKSPACE_DIR, filepath: relativePath });
    await git.commit({
      fs,
      dir: WORKSPACE_DIR,
      message: `Proposal: profile "${profile.name}"`,
      author: { name: username, email: `${username.toLowerCase().replace(/\s+/g, "")}@milbrowser.local` }
    });
  } catch (e) {
    console.warn("Git commit local ignoré (aucun changement réel)", e);
  }

  // 2. PUSH SIMULÉ : Copie directe et sécurisée du JSON vers le dépôt central partagé
  const centralProfilesDir = path.join(centralPath, "profiles");
  await fsp.mkdir(centralProfilesDir, { recursive: true });

  const centralDestPath = path.join(centralProfilesDir, fileName);
  await fsp.writeFile(centralDestPath, JSON.stringify(profileToSave, null, 2), "utf8");

  // Resoumission : le refus précédent ne s'applique plus.
  await clearRejectionMarker(centralPath, "profile", profile.id);

  await appendHistoryEvent(centralPath, {
    id: profile.id, action: "submit", entity: "profile",
    name: profile.name ?? profile.id, by: username, at: new Date().toISOString(),
  });

  console.log(`Fichier synchronisé avec succès vers le dépôt central : ${centralDestPath}`);
}

export async function approveProfileInGit(remoteInput: string, adminUsername: string, profileId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureDirectories();
    await initOrCloneRepository(remoteInput);
    const centralPath = getFsPath(remoteInput);

    const fileName = `profile-${profileId}.json`;
    const localPath = path.join(PROFILES_DIR, fileName);

    if (!(await exists(localPath))) {
      throw new Error(`Could not find the local proposal for id: ${profileId}`);
    }

    const profile = JSON.parse(await fsp.readFile(localPath, "utf8"));
    profile.status = "approved";
    profile.updatedAt = new Date().toISOString();

    // 1. Sauvegarde locale
    await fsp.writeFile(localPath, JSON.stringify(profile, null, 2), "utf8");
    
    try {
      const relativePath = path.join("profiles", fileName).replace(/\\/g, "/");
      await git.add({ fs, dir: WORKSPACE_DIR, filepath: relativePath });
      await git.commit({
        fs,
        dir: WORKSPACE_DIR,
        message: `Approval: profile "${profile.name}"`,
        author: { name: adminUsername, email: `${adminUsername.toLowerCase().replace(/\s+/g, "")}@milbrowser.local` }
      });
    } catch (e) {}

    // 2. Envoi vers le dépôt central
    const centralDestPath = path.join(centralPath, "profiles", fileName);
    await fsp.mkdir(path.dirname(centralDestPath), { recursive: true });
    await fsp.writeFile(centralDestPath, JSON.stringify(profile, null, 2), "utf8");

    await appendHistoryEvent(centralPath, {
      id: profileId, action: "approve", entity: "profile",
      name: profile.name ?? profileId, by: adminUsername, at: new Date().toISOString(),
    });

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
    await ensureDirectories();
    await initOrCloneRepository(remoteInput);
    const centralPath = getFsPath(remoteInput);

    const fileName = `profile-${profileId}.json`;
    const localPath = path.join(PROFILES_DIR, fileName);
    const centralPathFile = path.join(centralPath, "profiles", fileName);

    // 1. Marqueur de refus AVANT suppression : si l'écriture échoue, la
    //    proposition reste en place plutôt que de disparaître sans trace.
    await writeRejectionMarker(centralPath, {
      entity: "profile",
      id: profileId,
      rejectedBy: adminUsername,
      rejectedAt: new Date().toISOString(),
      reason,
    });

    // Nom lisible pour le journal, lu AVANT de supprimer le fichier.
    let rejectedName = profileId;
    try {
      rejectedName = (JSON.parse(await fsp.readFile(centralPathFile, "utf8")).name) ?? profileId;
    } catch { /* fichier déjà absent : on garde l'id */ }

    // 2. Retire la proposition du dépôt central et du workspace local
    await fsp.unlink(centralPathFile).catch(() => undefined);
    await fsp.unlink(localPath).catch(() => undefined);

    await appendHistoryEvent(centralPath, {
      id: profileId, action: "reject", entity: "profile",
      name: rejectedName, by: adminUsername, at: new Date().toISOString(), reason,
    });

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
    await ensureDirectories();
    await initOrCloneRepository(remoteInput);
    const centralPath = getFsPath(remoteInput);

    const fileName = `standard-${standardId}.json`;
    const localPath = path.join(STANDARDS_DIR, fileName);

    if (!(await exists(localPath))) {
      throw new Error(`Could not find the local standard for id: ${standardId}`);
    }

    const standard = JSON.parse(await fsp.readFile(localPath, "utf8"));
    standard.status = "approved";
    standard.updatedAt = new Date().toISOString();

    // 1. Sauvegarde locale
    await fsp.writeFile(localPath, JSON.stringify(standard, null, 2), "utf8");
    
    try {
      const relativePath = path.join("standards", fileName).replace(/\\/g, "/");
      await git.add({ fs, dir: WORKSPACE_DIR, filepath: relativePath });
      await git.commit({
        fs,
        dir: WORKSPACE_DIR,
        message: `Approval: standard "${standard.manifest.label}"`,
        author: { name: adminUsername, email: `${adminUsername.toLowerCase().replace(/\s+/g, "")}@milbrowser.local` }
      });
    } catch (e) {}

    // 2. Envoi vers le dépôt central
    const centralDestPath = path.join(centralPath, "standards", fileName);
    await fsp.mkdir(path.dirname(centralDestPath), { recursive: true });
    await fsp.writeFile(centralDestPath, JSON.stringify(standard, null, 2), "utf8");

    await appendHistoryEvent(centralPath, {
      id: standardId, action: "approve", entity: "standard",
      name: standard.manifest?.label ?? standardId, by: adminUsername, at: new Date().toISOString(),
    });

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
  // Dernière barrière avant l'écriture disque : un manifest.id absent
  // produisait "standard-undefined.json", fichier corrompu qui bloquait la
  // synchronisation de tous les postes. On refuse plutôt que d'écrire.
  if (!standard?.manifest?.id || typeof standard.manifest.id !== "string") {
    throw new Error("Invalid standard: missing manifest.id, push refused.");
  }

  await ensureDirectories();
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
  await fsp.writeFile(localPath, JSON.stringify(standardToSave, null, 2), "utf8");

  // Versionning local
  try {
    const relativePath = path.join("standards", fileName).replace(/\\/g, "/");
    await git.add({ fs, dir: WORKSPACE_DIR, filepath: relativePath });
    await git.commit({
      fs,
      dir: WORKSPACE_DIR,
      message: `Proposal: standard "${standard.manifest.label}"`,
      author: { name: username, email: `${username.toLowerCase().replace(/\s+/g, "")}@milbrowser.local` }
    });
  } catch (e) {
    console.warn("Git commit local ignoré pour le standard", e);
  }

  // 2. PUSH SIMULÉ : Copie vers le dépôt central partagé
  const centralStdsDir = path.join(centralPath, "standards");
  await fsp.mkdir(centralStdsDir, { recursive: true });

  const centralDestPath = path.join(centralStdsDir, fileName);
  await fsp.writeFile(centralDestPath, JSON.stringify(standardToSave, null, 2), "utf8");

  await clearRejectionMarker(centralPath, "standard", standard.manifest.id);

  await appendHistoryEvent(centralPath, {
    id: standard.manifest.id, action: "submit", entity: "standard",
    name: standard.manifest.label ?? standard.manifest.id, by: username, at: new Date().toISOString(),
  });

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
    await ensureDirectories();
    await initOrCloneRepository(remoteInput);
    const centralPath = getFsPath(remoteInput);

    const fileName = `standard-${standardId}.json`;
    const localPath = path.join(STANDARDS_DIR, fileName);
    const centralPathFile = path.join(centralPath, "standards", fileName);

    await writeRejectionMarker(centralPath, {
      entity: "standard",
      id: standardId,
      rejectedBy: adminUsername,
      rejectedAt: new Date().toISOString(),
      reason,
    });

    let rejectedName = standardId;
    try {
      rejectedName = (JSON.parse(await fsp.readFile(centralPathFile, "utf8")).manifest?.label) ?? standardId;
    } catch { /* fichier déjà absent : on garde l'id */ }

    await fsp.unlink(centralPathFile).catch(() => undefined);
    await fsp.unlink(localPath).catch(() => undefined);

    await appendHistoryEvent(centralPath, {
      id: standardId, action: "reject", entity: "standard",
      name: rejectedName, by: adminUsername, at: new Date().toISOString(), reason,
    });

    return { success: true };
  } catch (error: any) {
    console.error("Erreur rejectStandardInGit:", error);
    return { success: false, error: error.message };
  }
}

// L'historique n'est plus lu depuis le git local (propre à une machine) mais
// depuis le journal d'audit CENTRAL partagé — voir readCentralHistory ci-dessus.
