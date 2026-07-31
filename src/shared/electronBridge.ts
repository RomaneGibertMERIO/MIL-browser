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

export type UserRole = "admin" | "testing" | "readonly";

export interface SessionInfo {
  username: string;
  firstSeen: string;
  lastSeen: string;
  role: UserRole;
}

export interface GitSyncResult extends IpcResult {
  pulledProfiles?: unknown[];
  pulledStandards?: unknown[];
  rejections?: RejectionMarker[];
  deletions?: DeletionMarker[];
  admins?: string[];
  currentUser?: string;
  role?: UserRole;
  isAdmin?: boolean;
}

export interface SessionsResult extends IpcResult {
  sessions?: SessionInfo[];
  currentUser?: string;
}

/**
 * Une entrée du journal d'audit CENTRAL partagé (lecture seule) : qui a soumis /
 * validé / refusé / supprimé quoi, et quand. Commune à tous les postes.
 */
export interface HistoryEvent {
  id: string;
  action: "submit" | "approve" | "reject" | "delete";
  entity: "profile" | "standard";
  name: string;
  by: string;
  at: string; // ISO-8601
  reason?: string;
}

export interface GitHistoryResult extends IpcResult {
  entries?: HistoryEvent[];
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

  /**
   * Multi-fenêtre (spec §11) : ouvre une seconde fenêtre Browser autonome,
   * optionnellement pré-sélectionnée sur une norme. Additif et sans effet sur
   * le dépôt central.
   */
  openBrowserWindow: (payload?: { standardId?: string }) => Promise<IpcResult>;

  gitSetRepoPath: (path: string) => Promise<IpcResult>;
  gitSync: (username: string) => Promise<GitSyncResult>;
  gitHistory: (limit?: number) => Promise<GitHistoryResult>;
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
  /** Refuse une demande de suppression : restaure l'objet officiel (approved). */
  gitRejectDeletion: (payload: {
    repoPath: string;
    entity: "profile" | "standard";
    id: string;
    reason: string;
  }) => Promise<IpcResult>;

  gitListSessions: (repoPath?: string) => Promise<SessionsResult>;
  gitSetRole: (payload: { repoPath?: string; username: string; role: UserRole }) => Promise<IpcResult>;

  /**
   * S'abonne au menu natif « Help → User Guide » (electron/main.ts). Le callback
   * est appelé quand l'utilisateur ouvre le manuel depuis la barre de menus.
   * Renvoie une fonction de désabonnement. Contrairement aux autres méthodes,
   * elle n'invoque aucun canal IPC (elle ÉCOUTE via ipcRenderer.on) : le renderer
   * réagit en ouvrant l'overlay du manuel.
   */
  onOpenUserGuide: (callback: () => void) => () => void;
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
