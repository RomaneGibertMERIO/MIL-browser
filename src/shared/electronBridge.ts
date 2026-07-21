/**
 * Pont Electron — source de vérité unique côté renderer.
 *
 * Historique du bug corrigé ici : le preload exposait `window.electron` alors
 * que les types déclaraient `window.electronAPI`. Le typage validait donc des
 * appels qui valaient `undefined` à l'exécution (ex. la récupération du nom
 * d'utilisateur OS, qui n'a jamais fonctionné).
 *
 * Règles :
 * - `ElectronBridge` décrit le contrat, et il est *le seul* endroit à le faire.
 *   `src/electron.d.ts` s'en sert pour augmenter `Window`, et `electron/preloads.ts`
 *   doit exposer exactement ces méthodes.
 * - Toute méthode renvoie un `IpcResult` : les appelants doivent tester
 *   `success` avant de muter l'état. Ne jamais supposer qu'un appel a réussi.
 * - `getElectronBridge()` renvoie `null` hors Electron (mode navigateur), ce qui
 *   force les appelants à traiter explicitement ce cas.
 */

/** Résultat standard de tout appel IPC exposé par le preload. */
export interface IpcResult {
  success: boolean;
  error?: string;
}

/**
 * Marqueur de refus déposé par l'administrateur dans le dépôt central.
 * Permet à l'auteur d'apprendre que sa proposition a été refusée — la simple
 * suppression du fichier ne transportait aucune information.
 */
export interface RejectionMarker {
  entity: "profile" | "standard";
  id: string;
  rejectedBy: string;
  rejectedAt: string;
  reason: string;
}

/**
 * Marqueur de suppression. Supprimer le fichier du dépôt central ne suffit pas :
 * les autres postes gardent l'enregistrement dans leur base locale tant que
 * rien ne leur signale explicitement sa disparition.
 */
export interface DeletionMarker {
  entity: "profile" | "standard";
  id: string;
  deletedBy: string;
  deletedAt: string;
}

export interface GitSyncResult extends IpcResult {
  pulledProfiles?: unknown[];
  pulledStandards?: unknown[];
  rejections?: RejectionMarker[];
  deletions?: DeletionMarker[];
  admins?: string[];
  currentUser?: string;
  isAdmin?: boolean;
}

export interface AdminsResult extends IpcResult {
  admins?: string[];
  currentUser?: string;
  isAdmin?: boolean;
  /** Vrai quand admins.json est absent ou vide : tout le monde est admin. */
  unrestricted?: boolean;
}

export interface ElectronBridge {
  getSystemUsername: () => Promise<string>;

  gitSetRepoPath: (path: string) => Promise<IpcResult>;
  gitSync: (username: string) => Promise<GitSyncResult>;
  gitGetAdmins: (repoPath?: string) => Promise<AdminsResult>;

  gitSubmitProfile: (payload: { username: string; profile: unknown }) => Promise<IpcResult>;
  gitApproveProfile: (profileId: string) => Promise<IpcResult>;
  gitRejectProfile: (payload: { profileId: string; reason: string }) => Promise<IpcResult>;
  gitDeleteProfile: (profileId: string) => Promise<IpcResult>;
  gitDeleteStandard: (payload: { repoPath: string; standardId: string }) => Promise<IpcResult>;

  gitSubmitStandard: (payload: {
    repoPath: string;
    username: string;
    standard: unknown;
  }) => Promise<IpcResult>;
  gitApproveStandard: (payload: { repoPath: string; standardId: string }) => Promise<IpcResult>;
  gitRejectStandard: (payload: {
    repoPath: string;
    standardId: string;
    reason: string;
  }) => Promise<IpcResult>;
}

/**
 * Retourne le pont Electron, ou `null` si l'application tourne dans un
 * navigateur classique (pas de preload).
 *
 * `window.electron` est le nom historiquement exposé par le preload ;
 * `window.electronAPI` est conservé en repli le temps que d'anciennes versions
 * packagées disparaissent.
 */
export function getElectronBridge(): ElectronBridge | null {
  if (typeof window === "undefined") return null;
  return window.electron ?? window.electronAPI ?? null;
}

/**
 * Normalise en `IpcResult` ce que renvoie réellement un appel IPC.
 *
 * Indispensable car une méthode absente du preload produit `undefined` (et non
 * une erreur) : sans cette normalisation, `undefined?.success` est `falsy` et le
 * code appelant enchaîne silencieusement comme si de rien n'était.
 */
export function toIpcResult(raw: unknown, fallbackError: string): IpcResult {
  if (raw === null || raw === undefined) {
    return { success: false, error: fallbackError };
  }
  const result = raw as IpcResult;
  if (typeof result.success !== "boolean") {
    return { success: false, error: fallbackError };
  }
  return result;
}
