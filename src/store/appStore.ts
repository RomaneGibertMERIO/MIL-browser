import { create } from "zustand";
import { upsertProfile, getAllProfiles } from "../core/db/repositories/profiles.repo";
import { upsertStandard } from "../core/db/repositories/standards.repo";
import {
  attachNodeImages,
  putNodeImagesAndStrip,
  deleteNodeImagesForStandard,
} from "../core/db/repositories/nodeImages.repo";
import { db } from "../core/db/schema";
import {
  getElectronBridge,
  toIpcResult,
  type ElectronBridge,
  type IpcResult,
  type RejectionMarker,
  type DeletionMarker,
} from "../shared/electronBridge";
import { standardWorkspace } from "../core/domain/standard";
import { toast } from "../shared/toast/toastStore";

export type AppMode = "assistant" | "admin";
// Destinations de premier niveau du Management (le rail). Les anciens écrans
// (library/standards/validations/accounts) sont désormais hébergés à
// l'intérieur de ces sections : Edit regroupe profils + taxonomie, Admin
// regroupe la revue + les comptes.
export type AdminView = 'home' | 'edit' | 'sync' | 'settings' | 'admin';

export interface ActiveNode {
  standardId: string;
  nodeId: string;
}

export interface MockChangeItem {
  id: string;
  type: 'standard' | 'taxonomy' | 'profile';
  action: 'Created' | 'Modified' | 'Deleted';
  name: string;
  location: string;
  originalData?: any;
  proposedData?: any;
}

export interface AdminCommitRequest {
  id: string;
  author: string;
  date: string;
  commitMessage: string;
  changes: MockChangeItem[];
}

export interface ApprovedHistoryItem {
  id: string;
  name: string;
  approvedBy: string;
  author: string;
  date: string;
}

interface AppState {
  mode: AppMode;
  adminView: AdminView;
  activeStandardId: string | null;
  activeNode: ActiveNode | null;
  gitRepoPath: string;
  systemUsername: string;

  localStagedChanges: MockChangeItem[];
  pendingCommits: AdminCommitRequest[];
  approvedHistory: ApprovedHistoryItem[];

  /**
   * Dernière erreur de synchronisation/soumission Git, destinée à être affichée
   * à l'utilisateur. `null` quand la dernière opération a réussi.
   */
  syncError: string | null;
  setSyncError: (message: string | null) => void;

  /**
   * Vrai quand l'utilisateur courant peut valider les propositions.
   * Renseigné par la synchronisation depuis admins.json (dépôt central).
   * Défaut `true` : tant qu'aucun admins.json n'existe, l'accès reste ouvert,
   * comme avant. Ce drapeau ne pilote QUE l'affichage — le contrôle réel est
   * appliqué par le processus principal, qui seul connaît l'identité système.
   */
  isAdmin: boolean;

  /**
   * Rôle de l'utilisateur courant dans le dépôt partagé.
   * - "admin"    : gère les comptes, valide/refuse les propositions.
   * - "testing"  : peut créer et pousser des propositions.
   * - "readonly" : accès limité au réglage du chemin du dépôt.
   *
   * En mode autonome (aucun dépôt), l'utilisateur est traité comme "admin" :
   * c'est son application locale, il y a tous les droits. En mode partagé, le
   * rôle vient du processus principal (access.json). Ce champ ne pilote QUE
   * l'affichage ; le contrôle réel est appliqué côté main.
   */
  role: "admin" | "testing" | "readonly";

  /**
   * Espace de travail actif, déduit de gitRepoPath.
   *
   * - "local"  : aucun dépôt central configuré. Le socle builtin est la base de
   *              travail, entièrement hors réseau.
   * - "shared" : un dépôt central est configuré ; c'est LUI qui fait autorité.
   *              L'interface n'affiche alors que les normes venues du dépôt.
   *
   * Le mode ne dépend PAS de la joignabilité du réseau : un dépôt configuré
   * mais injoignable laisse l'application en "shared", sur le dernier état
   * synchronisé, plutôt que de faire disparaître les normes de l'équipe.
   */
  repoMode: "local" | "shared";

  /** Vrai quand le dépôt est configuré mais que la dernière synchro a échoué. */
  isOffline: boolean;

  /** Vrai quand le dépôt central est joignable mais ne contient encore AUCUNE
   *  norme : l'utilisateur peut alors publier explicitement le socle builtin
   *  (Q6, page Sync) au lieu d'un amorçage automatique. */
  centralIsEmpty: boolean;

  setMode: (mode: AppMode) => void;
  setAdminView: (view: AdminView) => void;
  setActiveStandard: (standardId: string | null) => void;
  setActiveNode: (node: ActiveNode | null) => void;
  clearActiveNode: () => void;
  setGitRepoPath: (path: string) => void;
  setSystemUsername: (username: string) => void;

  addLocalChange: (change: Omit<MockChangeItem, 'id'>) => void;
  clearLocalChanges: () => void;
  /** Renvoie le résultat réel du push : l'appelant NE DOIT PAS supposer le succès. */
  submitCommit: (commitMessage: string, selectedIds: string[]) => Promise<IpcResult>;

  refreshLocalChanges: () => Promise<void>;
  triggerGitSync: () => Promise<IpcResult>;
  /** Publie le socle builtin sur un dépôt central vide (action explicite, Q6). */
  publishBaselineToCentral: () => Promise<IpcResult>;
  /** Renvoie le résultat réel de la validation : l'appelant DOIT tester `success`. */
  resolveSingleChange: (
    commitId: string,
    changeId: string,
    action: 'approve' | 'reject',
    reason?: string,
  ) => Promise<IpcResult>;
}

/** Les noms de session Windows varient en casse d'un poste à l'autre. */
function sameUser(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Applique les refus déposés par l'administrateur dans le dépôt central.
 *
 * - Pour l'AUTEUR : la proposition repasse en "local" et conserve le motif du
 *   refus. Son travail n'est jamais perdu, il peut corriger et resoumettre.
 * - Pour LES AUTRES : la proposition d'autrui est retirée de la base locale,
 *   sinon elle resterait affichée en attente de validation à vie.
 *
 * Doit être appelée avec `db.isSyncingInternal === true` : ces écritures sont
 * la conséquence d'une synchronisation, pas une modification de l'utilisateur,
 * et ne doivent donc générer aucun événement à repousser.
 */
async function applyRejections(
  rejections: RejectionMarker[],
  systemUsername: string,
): Promise<Array<{ name: string; reason: string }>> {
  // Refus concernant l'utilisateur courant : remontés pour l'informer (toast).
  const own: Array<{ name: string; reason: string }> = [];
  for (const marker of rejections) {
    try {
      if (marker.entity === "profile") {
        const profile = await db.profiles.get(marker.id);
        if (profile === undefined) continue;

        // Le refus ne s'applique pas à une version PLUS RÉCENTE que lui :
        // sans ce garde-fou, un profil corrigé et resoumis serait remarqué
        // comme refusé à chaque synchronisation suivante.
        if (profile.updatedAt && marker.rejectedAt <= profile.updatedAt) continue;

        if (sameUser(profile.author, systemUsername)) {
          await upsertProfile({
            ...profile,
            status: "local",
            rejectedBy: marker.rejectedBy,
            rejectedAt: marker.rejectedAt,
            rejectionReason: marker.reason,
          });
          own.push({ name: profile.name, reason: marker.reason });
        } else {
          await db.profiles.delete(marker.id);
        }
      } else {
        const standard: any = await db.standards.get(marker.id);
        if (standard === undefined) continue;
        if (standard.updatedAt && marker.rejectedAt <= standard.updatedAt) continue;

        if (sameUser(standard.lastModifiedBy, systemUsername)) {
          await upsertStandard({
            ...standard,
            status: "local",
            rejectedBy: marker.rejectedBy,
            rejectedAt: marker.rejectedAt,
            rejectionReason: marker.reason,
          } as any);
          own.push({ name: standard.manifest?.label ?? standard.manifest?.id ?? marker.id, reason: marker.reason });
        }
        // Un standard refusé chez un tiers n'est PAS supprimé : il peut s'agir
        // d'une taxonomie dont il dépend. Il repasse simplement hors validation
        // au prochain pull, puisque le fichier central a disparu.
      }
    } catch (err) {
      console.error(`Application du refus impossible (${marker.entity} ${marker.id}) :`, err);
    }
  }
  return own;
}

/**
 * Amorce un dépôt central vide avec le socle builtin.
 *
 * Sans cela, brancher l'application sur un partage réseau neuf donnerait une
 * base totalement vide : le mode partagé n'affiche que ce qui vient du dépôt,
 * et le dépôt ne contient encore rien.
 *
 * Ne pousse QUE les normes d'usine (workspace "local"), et jamais les
 * créations d'un utilisateur : amorcer un dépôt d'équipe ne doit pas y publier
 * le travail personnel d'un poste au passage.
 *
 * @returns le nombre de normes poussées.
 */
async function seedCentralRepositoryFromBuiltin(
  api: ElectronBridge,
  repoPath: string,
  username: string,
): Promise<number> {
  // Source of truth for the baseline = the bundled database.json, NEVER the local
  // DB: once published, the local built-in records get flipped to shared/official,
  // so they could no longer be re-published to a fresh repo ("No built-in
  // standards available to publish"). database.json is immutable and always here.
  const { getBuiltinBaseline } = await import("../core/engine/standardLoader");
  const { standards, profiles } = getBuiltinBaseline();
  if (standards.length === 0 && profiles.length === 0) return 0;

  let pushed = 0;

  // Standards: submit THEN approve → published as OFFICIAL (the baseline is the
  // shared reference set, not a "pending" proposal).
  for (const standard of standards) {
    if (!standard?.manifest?.id) continue;
    // Re-attach images so the central file is self-contained across machines.
    const withImages = await attachNodeImages(standard);
    const sub = toIpcResult(
      await api.gitSubmitStandard({ repoPath, username, standard: withImages }),
      "gitSubmitStandard returned no result.",
    );
    if (!sub.success) {
      console.error(`Baseline: standard "${standard.manifest.id}" not published — ${sub.error}`);
      continue;
    }
    const appr = toIpcResult(
      await api.gitApproveStandard({ repoPath, standardId: standard.manifest.id }),
      "gitApproveStandard returned no result.",
    );
    if (appr.success) pushed++;
    else console.error(`Baseline: standard "${standard.manifest.id}" not approved — ${appr.error}`);
  }

  // Built-in profiles: same flow (submit + approve → official).
  for (const profile of profiles) {
    const pid = (profile as any)?.id;
    if (!pid) continue;
    const sub = toIpcResult(
      await api.gitSubmitProfile({ username, profile }),
      "gitSubmitProfile returned no result.",
    );
    if (!sub.success) {
      console.error(`Baseline: profile "${pid}" not published — ${sub.error}`);
      continue;
    }
    const appr = toIpcResult(
      await api.gitApproveProfile(pid),
      "gitApproveProfile returned no result.",
    );
    if (appr.success) pushed++;
    else console.error(`Baseline: profile "${pid}" not approved — ${appr.error}`);
  }

  console.log(`Baseline publish: ${pushed} built-in item(s) published as official.`);
  return pushed;
}

/**
 * Répercute en base locale les suppressions faites depuis un autre poste.
 *
 * Sans cela, supprimer une entité ne la retirait que de la machine qui avait
 * fait la suppression : partout ailleurs elle restait affichée indéfiniment,
 * puisqu'un fichier absent du dépôt ne « dit » rien aux autres postes.
 *
 * Le garde-fou sur `deletedAt` évite d'effacer une version PLUS RÉCENTE que la
 * suppression : si quelqu'un a recréé ou modifié l'entité depuis, on la garde.
 */
async function applyDeletions(deletions: DeletionMarker[]): Promise<void> {
  for (const marker of deletions) {
    try {
      if (marker.entity === "profile") {
        const profile = await db.profiles.get(marker.id);
        if (profile === undefined) continue;
        if (profile.updatedAt && marker.deletedAt <= profile.updatedAt) continue;
        await db.profiles.delete(marker.id);
      } else {
        const standard: any = await db.standards.get(marker.id);
        if (standard === undefined) continue;
        // Une norme d'usine n'est jamais supprimée par un marqueur distant :
        // elle appartient à l'espace autonome, hors du périmètre du dépôt.
        if (standardWorkspace(standard) !== "shared") continue;
        if (standard.updatedAt && marker.deletedAt <= standard.updatedAt) continue;
        await db.standards.delete(marker.id);
        await deleteNodeImagesForStandard(marker.id); // GC des images (phase 8)
      }
    } catch (err) {
      console.error(`Application de la suppression impossible (${marker.entity} ${marker.id}) :`, err);
    }
  }
}

const NO_BRIDGE_ERROR =
  "The desktop bridge is unavailable: the app is running outside its desktop container. " +
  "No operation was performed on the central repository.";

// Coalescence des synchros : un seul pull à la fois pour toute l'app. Plusieurs
// déclencheurs peuvent tirer un triggerGitSync quasi simultanément (bootstrap +
// setGitRepoPath au démarrage, bouton, etc.). Deux pulls concurrents faisaient
// que le finally de l'un remettait db.isSyncingInternal à false pendant que
// l'autre bouclait → upsertProfile/upsertStandard basculaient en branche
// déterministe et staged des événements « Modified » fantômes pour des objets
// intouchés. On réutilise le pull en cours au lieu d'en lancer un second.
let gitSyncInFlight: Promise<IpcResult> | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  mode: "assistant",
  adminView: "home",
  activeStandardId: null,
  activeNode: null,
  gitRepoPath: "",
  systemUsername: "User",
  approvedHistory: [],
  localStagedChanges: [],
  pendingCommits: [],
  syncError: null,
  isAdmin: true,
  role: "admin",
  repoMode: "local",
  isOffline: false,
  centralIsEmpty: false,

  setSyncError: (syncError) => set({ syncError }),

  setMode: (mode) => set({ mode }),
  setAdminView: (adminView) => set({ adminView }),
  setActiveStandard: (activeStandardId) => set({ activeStandardId, activeNode: null }),
  setActiveNode: (activeNode) => set({ activeNode }),
  clearActiveNode: () => set({ activeNode: null }),
  
  setGitRepoPath: (gitRepoPath) => {
    // Le mode découle directement du chemin : renseigné => le dépôt fait foi.
    const repoMode = gitRepoPath.trim() === "" ? "local" : "shared";
    const previousMode = get().repoMode;
    // Mode autonome : tous les droits sur sa propre app. Le rôle réel du mode
    // partagé sera fixé par la prochaine synchro.
    set({
      gitRepoPath,
      repoMode,
      isOffline: false,
      ...(repoMode === "local" ? { role: "admin" as const, isAdmin: true } : {}),
    });

    // Retour au mode autonome : on réinstalle le socle d'usine. Les normes
    // builtin que le dépôt central avait remplacées n'existent plus en base
    // (même clé primaire) ; sans cette réinstallation, l'utilisateur retrouvait
    // une base quasi vide au lieu de son socle.
    if (repoMode === "local" && previousMode === "shared") {
      void import("../core/engine/standardLoader")
        .then(({ loadBuiltinStandards }) => loadBuiltinStandards())
        .then(() => get().refreshLocalChanges())
        .catch((err: unknown) => {
          set({ syncError: `Could not restore the built-in base: ${String(err)}` });
        });
    }

    const api = getElectronBridge();
    if (api === null || repoMode === "local") return;

    void api
      .gitSetRepoPath(gitRepoPath)
      .then((raw) => {
        const result = toIpcResult(raw, "Réponse invalide de gitSetRepoPath.");
        if (!result.success) {
          // Dépôt injoignable/inexistant : on RESTE en "shared" (le chemin est
          // configuré) mais on passe Offline → le rail masque Sync/Admin et les
          // écritures sont refusées, au lieu de laisser croire à une connexion.
          set({ syncError: `Central repository unreachable: ${result.error ?? "unknown error"}`, isOffline: true });
          return;
        }
        // Connexion établie : on synchronise pour récupérer l'état RÉEL du dépôt
        // — rôle (access.json), file de validation, et le drapeau `centralIsEmpty`
        // qui pilote la bannière de publication du socle. Sans cette synchro, on
        // affichait "Shared" mais `centralIsEmpty` restait faux (aucune bannière)
        // et le rôle/pending ne se chargeaient qu'au redémarrage.
        void get().triggerGitSync();
      })
      .catch((err: unknown) => {
        set({ syncError: `Central repository unreachable: ${String(err)}`, isOffline: true });
      });
  },
  
  setSystemUsername: (username) => set({ systemUsername: username }),

  addLocalChange: (change) => set((s) => ({
    localStagedChanges: [
      ...s.localStagedChanges,
      { ...change, id: `change-${Date.now()}` }
    ]
  })),
  
  clearLocalChanges: () => set({ localStagedChanges: [] }),

  refreshLocalChanges: async () => {
    try {
      const events = await db.syncEvents.toArray();
      const aggregatedMap = new Map<string, MockChangeItem>();

      for (const event of events) {
        const payload = event.payload as any;
        const isStandard = event.entity === 'standard';
        
        const name = isStandard 
          ? (payload?.manifest?.name || payload?.manifest?.label || payload?.manifest?.id || "New Standard")
          : (payload?.name || `Profile ID: ${payload?.id}`);
          
        const location = isStandard
          ? (payload?.manifest?.organization || "Global")
          : (payload?.standardId ? `${payload.standardId}` : "Root");

        const previous = (event as any).previous;
        const origin = (event as any).origin as "create" | "update" | undefined;
        // "Created" quand l'objet a été créé localement (marqueur figé à la
        // création). Un objet créé puis édité a un `previous` mais reste Created.
        // Repli sur l'ancienne heuristique (présence de `previous`) pour les
        // événements enregistrés avant l'ajout du marqueur `origin`.
        const isCreated = origin ? origin === "create" : !previous;
        // Demande de suppression d'un objet officiel : passe par le hook "upsert"
        // (marqueur pendingDeletion) mais doit s'afficher comme "Deleted".
        const isPendingDeletion = (payload as any)?.pendingDeletion === true;
        aggregatedMap.set(event.id, {
          id: event.id,
          type: event.entity as 'profile' | 'standard',
          action:
            event.operation === 'delete' || isPendingDeletion
              ? 'Deleted'
              : isCreated ? 'Created' : 'Modified',
          name: name,
          location: location,
          proposedData: payload,
          // État d'avant la 1re modif non synchronisée. On le transmet aussi pour
          // un objet "Created" édité après création, afin d'y montrer les champs
          // changés depuis la création (le reste restant marqué « nouveau »).
          originalData: previous,
        });
      }

      set({ localStagedChanges: Array.from(aggregatedMap.values()) });
    } catch (err) {
      console.error("Erreur refreshLocalChanges :", err);
    }
  },

  triggerGitSync: async () => {
    // Un pull déjà en cours ? On le réutilise (coalescence) au lieu d'en lancer
    // un second en parallèle — voir gitSyncInFlight.
    if (gitSyncInFlight) return gitSyncInFlight;
    gitSyncInFlight = (async (): Promise<IpcResult> => {
    const api = getElectronBridge();
    if (api === null) {
      // Hors Electron : pas d'erreur affichée, c'est un mode dégradé légitime
      // (dev navigateur). On rafraîchit tout de même l'état local.
      await get().refreshLocalChanges();
      return { success: false, error: NO_BRIDGE_ERROR };
    }
    const state = get();

    // Aucun dépôt configuré : mode autonome, le socle builtin fait le travail.
    if (state.gitRepoPath.trim() === "") {
      set({ repoMode: "local", isOffline: false, centralIsEmpty: false });
      await get().refreshLocalChanges();
      return { success: true };
    }

    let gitResult;
    try {
      await api.gitSetRepoPath(state.gitRepoPath);
      gitResult = await api.gitSync(state.systemUsername);
    } catch (err) {
      const message = `Git sync failed: ${err instanceof Error ? err.message : String(err)}`;
      // On RESTE en mode partagé : l'utilisateur continue sur le dernier état
      // synchronisé plutôt que de voir les normes de l'équipe disparaître.
      set({ syncError: message, isOffline: true });
      await get().refreshLocalChanges();
      return { success: false, error: message };
    }

    if (!gitResult?.success) {
      const message = `Git sync refused: ${gitResult?.error ?? "unknown error"}`;
      set({ syncError: message, isOffline: true });
      await get().refreshLocalChanges();
      return { success: false, error: message };
    }

    // Q6 — dépôt central vide : on NE publie PAS le socle automatiquement. On
    // signale l'état ; l'utilisateur publie explicitement depuis la page Sync
    // (publishBaselineToCentral). Le nouveau modèle de visibilité garde le socle
    // builtin visible en local, donc l'application n'est jamais vide.
    set({ centralIsEmpty: (gitResult.pulledStandards?.length ?? 0) === 0 });

    if (gitResult.pulledProfiles && gitResult.pulledStandards) {
      // Save/restore plutôt que reset en dur : combiné à la coalescence
      // (gitSyncInFlight), garantit qu'aucun autre chemin ne se retrouve avec un
      // isSyncingInternal remis à false pendant qu'on boucle — c'était la cause
      // des événements « Modified » fantômes sur des objets pull intouchés.
      const wasSyncing = (db as any).isSyncingInternal;
      (db as any).isSyncingInternal = true;
      const skipped: string[] = [];
      // Version OFFICIELLE locale AVANT que le pull ne l'écrase : sert de
      // référence pour colorer le diff côté Admin (14.3), sans rien transmettre
      // de plus par le protocole — l'admin compare à sa propre copie d'avant.
      const previousById = new Map<string, any>();
      try {
        for (const rawStd of gitResult.pulledStandards) {
          const std = rawStd as any;

          // Un enregistrement corrompu (ex. manifest.id manquant) ne DOIT jamais
          // interrompre la synchronisation : la table est indexée sur
          // manifest.id, donc db.standards.put() lève une exception sur une clé
          // absente, ce qui avortait toute la boucle AVANT la reconstruction de
          // la file de validation — plus aucun pending n'apparaissait, ni les
          // siens ni ceux des autres. On ignore le fichier fautif et on continue.
          if (!std?.manifest?.id || typeof std.manifest.id !== "string") {
            skipped.push("standard without id");
            console.error("[sync] Standard central corrompu ignoré (manifest.id manquant) :", std);
            continue;
          }

          try {
            const localStd: any = await db.standards.get(std.manifest.id);
            // On n'écrase JAMAIS un travail local NON soumis (statut "local" :
            // édition ou demande de suppression en cours). Sans ce garde-fou, un
            // pull (refresh, ou la resynchro de fin de push) remplaçait la version
            // locale par la version centrale et effaçait la modification/marque
            // avant même qu'elle puisse partir en revue. Une fois poussée (statut
            // "pending"), elle n'est plus "local" et se synchronise normalement.
            if (localStd?.status === "local") continue;

            if ((std.status || "approved") === "pending" && localStd) {
              previousById.set(std.manifest.id, localStd);
            }
            await upsertStandard({
              ...std,
              manifest: { ...std.manifest, isBuiltin: false },
              status: std.status || "approved",
              // Vient du dépôt central : c'est la version qui fait autorité.
              workspace: "shared",
            } as any);
            // Réconciliation : quand le central renvoie cet item comme OFFICIEL
            // (approved), toute proposition locale résiduelle le concernant a été
            // acceptée/supersédée. On purge l'événement de synchro fantôme, sinon
            // il « revient » dans la liste au refresh (15.2 / 11.3b).
            if ((std.status || "approved") === "approved") {
              await db.syncEvents.delete(std.manifest.id);
            }
          } catch (err) {
            skipped.push(std.manifest.id);
            console.error(`[sync] Standard "${std.manifest.id}" non importé :`, err);
          }
        }

        for (const rawProf of gitResult.pulledProfiles) {
          const prof = rawProf as any;
          if (!prof?.id || typeof prof.id !== "string") {
            skipped.push("profile without id");
            console.error("[sync] Profil central corrompu ignoré (id manquant) :", prof);
            continue;
          }
          try {
            const localProf = await db.profiles.get(prof.id);
            // On n'écrase JAMAIS un travail local NON soumis (voir le bloc
            // standards) : édition ou demande de suppression en cours.
            if (localProf?.status === "local") continue;

            if (prof.status === "pending" && localProf) {
              previousById.set(prof.id, localProf);
            }
            // Tout profil venant du dépôt central est officiel/partagé, jamais un
            // built-in local : on force source="user" pour qu'il s'affiche selon
            // son statut (Official/Pending) et non « Built-in » — y compris pour
            // les dépôts déjà publiés dont le fichier porte encore source="builtin".
            await upsertProfile({ ...prof, source: "user" });
            // Réconciliation (voir le bloc standards) : un profil officiel
            // renvoyé par le central purge son événement de synchro résiduel.
            if ((prof.status || "approved") === "approved") {
              await db.syncEvents.delete(prof.id);
            }
          } catch (err) {
            skipped.push(prof.id);
            console.error(`[sync] Profil "${prof.id}" non importé :`, err);
          }
        }

        const rejectedOwn = await applyRejections(gitResult.rejections ?? [], state.systemUsername);
        // Notifie l'auteur des refus le concernant (14.5) : le motif était
        // stocké mais jamais montré. Le détail reste lisible sur la carte
        // (bannière "Rejected") ; ici c'est l'alerte immédiate à la synchro.
        for (const r of rejectedOwn) {
          toast.error(`Your proposal "${r.name}" was rejected: ${r.reason || "no reason given"}`);
        }
        await applyDeletions(gitResult.deletions ?? []);
      } finally {
        (db as any).isSyncingInternal = wasSyncing;
      }

      if (skipped.length > 0) {
        set({
          syncError:
            `${skipped.length} central repository record(s) are corrupted and were skipped ` +
            `(${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? "…" : ""}). ` +
            `Synchronization continued normally.`,
        });
      }

      const dbProfiles = await getAllProfiles();
      const pendingProfiles = dbProfiles.filter((p: any) => p.status === "pending");

      const dbStandards = await db.standards.toArray();
      // On exclut aussi tout standard sans manifest.id valide : un tel
      // enregistrement casserait le mapping ci-dessous (clé de commit
      // "commit-undefined", identifiants dupliqués côté React).
      const pendingStandards = dbStandards.filter(
        (s: any) => s.status === "pending" && typeof s?.manifest?.id === "string",
      );

      const reconstructedCommits: AdminCommitRequest[] = [
        ...pendingProfiles.map((p: any) => {
          // Version d'avant-pull capturée plus haut : référence du diff + permet
          // de distinguer Created (aucune version officielle antérieure) de Modified.
          const previous = previousById.get(p.id);
          return {
            id: `commit-${p.id}`,
            author: p.author || "Contributor",
            date: p.updatedAt ? p.updatedAt.split('T')[0] : new Date().toISOString().split('T')[0],
            commitMessage: `Profile proposal: ${p.name}`,
            changes: [{
              id: p.id,
              type: "profile" as const,
              // Created/Modified d'après la nature portée par la proposition
              // (cohérent avec la Sync) ; repli sur previousById pour l'ancien
              // format sans proposalOrigin.
              action: (p.pendingDeletion
                ? "Deleted"
                : p.proposalOrigin === "create"
                  ? "Created"
                  : p.proposalOrigin === "update"
                    ? "Modified"
                    : previous ? "Modified" : "Created") as "Created" | "Modified" | "Deleted",
              name: p.name,
              location: `${p.standardId}`,
              proposedData: p,
              originalData: previous,
            }],
          };
        }),
        ...pendingStandards.map((s: any) => {
          const previous = previousById.get(s.manifest.id);
          return {
            id: `commit-${s.manifest.id}`,
            author: s.lastModifiedBy || "Contributor",
            date: s.updatedAt ? s.updatedAt.split('T')[0] : new Date().toISOString().split('T')[0],
            commitMessage: `Taxonomy proposal: ${s.manifest.name || s.manifest.id}`,
            changes: [{
              id: s.manifest.id,
              type: "standard" as const,
              action: (s.pendingDeletion
                ? "Deleted"
                : s.proposalOrigin === "create"
                  ? "Created"
                  : s.proposalOrigin === "update"
                    ? "Modified"
                    : previous ? "Modified" : "Created") as "Created" | "Modified" | "Deleted",
              name: s.manifest.name || s.manifest.id,
              location: s.manifest.organization || "Global",
              proposedData: s,
              originalData: previous,
            }],
          };
        }),
      ];

      set({ pendingCommits: reconstructedCommits });
    }

    // Rôle et statut admin renseignés par le processus principal (access.json).
    set({
      role: gitResult.role ?? "readonly",
      isAdmin: gitResult.isAdmin ?? (gitResult.role === "admin"),
      repoMode: "shared",
      isOffline: false,
      syncError: null,
    });
    await get().refreshLocalChanges();
    return { success: true };
    })();
    try {
      return await gitSyncInFlight;
    } finally {
      gitSyncInFlight = null;
    }
  },

  publishBaselineToCentral: async () => {
    const state = get();
    const api = getElectronBridge();
    if (api === null) {
      set({ syncError: NO_BRIDGE_ERROR });
      return { success: false, error: NO_BRIDGE_ERROR };
    }
    if (state.repoMode !== "shared") {
      const error = "Connect a central repository before publishing the baseline.";
      set({ syncError: error });
      return { success: false, error };
    }
    try {
      const seeded = await seedCentralRepositoryFromBuiltin(api, state.gitRepoPath, state.systemUsername);
      if (seeded <= 0) {
        return { success: false, error: "No built-in standards available to publish." };
      }
      set({ centralIsEmpty: false, syncError: null });
      await get().triggerGitSync();
      return { success: true };
    } catch (err) {
      const error = `Publishing the baseline failed: ${err instanceof Error ? err.message : String(err)}`;
      set({ syncError: error });
      return { success: false, error };
    }
  },

  submitCommit: async (_, selectedIds) => {
    const state = get();
    const api = getElectronBridge();

    // Pousser = collaboration : impossible sans dépôt central JOIGNABLE. On
    // refuse proprement plutôt que de tenter des envois voués à l'échec. Le menu
    // Sync est d'ailleurs masqué en autonome/hors-ligne — ceci en est la
    // ceinture de sécurité côté action.
    if (state.repoMode !== "shared" || state.isOffline) {
      const error =
        state.repoMode !== "shared"
          ? "Standalone mode: connect a central repository (Settings) before pushing."
          : "Offline: the central repository is unreachable. Reconnect before pushing.";
      set({ syncError: error });
      return { success: false, error };
    }

    if (api === null) {
      set({ syncError: NO_BRIDGE_ERROR });
      await get().refreshLocalChanges();
      return { success: false, error: NO_BRIDGE_ERROR };
    }

    const events = await db.syncEvents.where("id").anyOf(selectedIds).toArray();

    // Événements dont le push a été EXPLICITEMENT accepté par le dépôt central.
    // Seuls ceux-là seront purgés du journal local : purger l'ensemble, comme
    // avant, effaçait la trace de modifications qui n'étaient jamais parties.
    const pushedEventIds: string[] = [];
    const failures: string[] = [];

    (db as any).isSyncingInternal = true;
    try {
      for (const event of events) {
        const payload = event.payload as any;
        if (!payload) continue;

        const label = payload.name ?? payload.manifest?.label ?? event.id;

        try {
          // SUPPRESSION : le payload n'est qu'une pierre tombale ({id, name}),
          // pas une entité complète. La renvoyer via gitSubmit* la republiait
          // dans le dépôt central ET la recréait en base locale — la
          // suppression semblait donc « ne rien faire ».
          if (event.operation === "delete") {
            const result = toIpcResult(
              event.entity === "profile"
                ? await api.gitDeleteProfile(event.id)
                : await api.gitDeleteStandard({ repoPath: state.gitRepoPath, standardId: event.id }),
              "Deletion is not available on this Electron bridge.",
            );

            if (!result.success) {
              failures.push(`${label}: ${result.error ?? "rejected by the central repository"}`);
              continue;
            }

            pushedEventIds.push(event.id);
            continue;
          }

          if (event.entity === "profile") {
            const profileToSend = {
              ...payload,
              author: state.systemUsername,
              status: "pending" as const,
              // Porte la nature de la proposition jusqu'à la revue admin, pour un
              // libellé Created/Modified cohérent avec la Sync même en mono-poste.
              proposalOrigin: ((event as any).origin === "create" ? "create" : "update") as "create" | "update",
            };

            const result = toIpcResult(
              await api.gitSubmitProfile({
                username: state.systemUsername,
                profile: profileToSend
              }),
              "gitSubmitProfile returned no result.",
            );

            if (!result.success) {
              failures.push(`${label}: ${result.error ?? "rejected by the central repository"}`);
              continue;
            }

            // On ne bascule le statut local en "pending" qu'après acceptation.
            await db.profiles.put(profileToSend);
            pushedEventIds.push(event.id);
          }
          else if (event.entity === "standard") {
            // Garde-fou d'intégrité : ne jamais pousser un standard sans
            // manifest.id. C'est ce qui créait "standard-undefined.json" côté
            // dépôt central — un fichier corrompu qui bloquait ensuite la
            // synchronisation de tous les postes.
            if (!payload?.manifest?.id || typeof payload.manifest.id !== "string") {
              failures.push(`${label}: standard without id, push refused`);
              continue;
            }

            // Le payload de l'événement n'est qu'un RÉSUMÉ (sans noeuds ni
            // images, pour ne pas geler refreshLocalChanges). On relit donc la
            // version COMPLÈTE et à jour depuis la base avant de la pousser.
            const fullStandard = await db.standards.get(payload.manifest.id);
            if (fullStandard === undefined) {
              failures.push(`${label}: standard not found in the database, push skipped`);
              continue;
            }

            // Phase 8 : db.standards est allégé (images dans db.nodeImages). On
            // ré-attache les images pour que le JSON poussé sur le partage les
            // porte (gitService reste inchangé).
            const hydrated = await attachNodeImages(fullStandard);
            const standardToSend: any = {
              ...hydrated,
              status: "pending",
              lastModifiedBy: state.systemUsername,
              proposalOrigin: (event as any).origin === "create" ? "create" : "update",
              manifest: {
                ...hydrated.manifest,
                isBuiltin: false
              }
            };

            const result = toIpcResult(
              await api.gitSubmitStandard({
                repoPath: state.gitRepoPath,
                username: state.systemUsername,
                standard: standardToSend
              }),
              "gitSubmitStandard returned no result.",
            );

            if (!result.success) {
              failures.push(`${label}: ${result.error ?? "rejected by the central repository"}`);
              continue;
            }

            // Le put LOCAL reste ALLÉGÉ (les images restent dans db.nodeImages),
            // sinon la ligne se ré-alourdit et le gel réapparaît.
            await db.standards.put(await putNodeImagesAndStrip(standardToSend));
            pushedEventIds.push(event.id);
          }
        } catch (err) {
          failures.push(`${label} : ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (pushedEventIds.length > 0) {
        await db.syncEvents.where("id").anyOf(pushedEventIds).delete();
      }
    } finally {
      (db as any).isSyncingInternal = false;
    }

    await get().refreshLocalChanges();
    // triggerGitSync réinitialise syncError en cas de succès : on positionne
    // donc notre propre message APRÈS, sinon il serait écrasé.
    await get().triggerGitSync();

    if (failures.length > 0) {
      const message =
        `${failures.length} of ${events.length} change(s) could not be pushed — ` +
        failures.join(" | ");
      // Si l'échec vient d'un dépôt injoignable, on bascule Offline : le badge
      // le reflète et les écritures suivantes sont refusées (au lieu de pousser
      // dans le vide en silence).
      const offline = /introuvable|injoignable|unreachable|not found|ENOENT/i.test(failures.join(" "));
      set({ syncError: message, ...(offline ? { isOffline: true } : {}) });
      return { success: false, error: message };
    }

    set({ syncError: null });
    return { success: true };
  },

  resolveSingleChange: async (commitId, changeId, action, reason) => {
    const state = get();
    const api = getElectronBridge();
    if (api === null) {
      set({ syncError: NO_BRIDGE_ERROR });
      return { success: false, error: NO_BRIDGE_ERROR };
    }

    const commit = state.pendingCommits.find((c) => c.id === commitId);
    const changeItem = commit?.changes.find((c) => c.id === changeId);
    const entityType = changeItem ? changeItem.type : "profile";
    // Demande de suppression (spec §17) : approve = suppression réelle, reject =
    // restauration en "approved" (l'objet reste officiel).
    const isDeletion = changeItem?.action === "Deleted";

    const nextStatus = action === "approve" ? "approved" : "local";

    // 1. Appel Git — on ne touche à RIEN tant qu'il n'a pas explicitement réussi.
    let result: IpcResult;
    try {
      if (isDeletion && action === "approve") {
        if (entityType === "profile") {
          result = toIpcResult(
            await api.gitDeleteProfile(changeId),
            `The "approve" operation is not available on this Electron bridge.`,
          );
        } else {
          // Standard : on cascade la suppression des profils enfants AU CENTRAL
          // (sinon leurs fichiers y subsistent et ressuscitent au prochain pull,
          // orphelins sous un standard supprimé). La cascade LOCALE est faite plus bas.
          const children = await db.profiles.where("standardId").equals(changeId).toArray();
          for (const child of children) {
            if ((child as any).status === "pending" || (child as any).status === "approved") {
              await api.gitDeleteProfile(child.id);
            }
          }
          result = toIpcResult(
            await api.gitDeleteStandard({ repoPath: state.gitRepoPath, standardId: changeId }),
            `The "approve" operation is not available on this Electron bridge.`,
          );
        }
      } else if (isDeletion) {
        // Refus d'une demande de suppression → restauration en "approved".
        result = toIpcResult(
          await api.gitRejectDeletion({
            repoPath: state.gitRepoPath,
            entity: entityType === "profile" ? "profile" : "standard",
            id: changeId,
            reason: reason ?? "",
          }),
          `The "reject" operation is not available on this Electron bridge.`,
        );
      } else if (entityType === "profile") {
        result = toIpcResult(
          action === "approve"
            ? await api.gitApproveProfile(changeId)
            : await api.gitRejectProfile({ profileId: changeId, reason: reason ?? "" }),
          `The "${action}" operation is not available on this Electron bridge.`,
        );
      } else {
        result = toIpcResult(
          action === "approve"
            ? await api.gitApproveStandard({ repoPath: state.gitRepoPath, standardId: changeId })
            : await api.gitRejectStandard({
                repoPath: state.gitRepoPath,
                standardId: changeId,
                reason: reason ?? "",
              }),
          `The "${action}" operation is not available on this Electron bridge.`,
        );
      }
    } catch (err) {
      result = { success: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (!result.success) {
      const message =
        `Could not ${action === "approve" ? "approve" : "reject"} "${changeItem?.name ?? changeId}": ` +
        `${result.error ?? "unknown error"}. No change was applied.`;
      // Dépôt injoignable → Offline (masque Admin/Sync, refuse les écritures).
      const offline = /introuvable|injoignable|unreachable|not found|ENOENT/i.test(result.error ?? "");
      set({ syncError: message, ...(offline ? { isOffline: true } : {}) });
      // La proposition RESTE dans la file : elle n'a pas été traitée.
      return { success: false, error: message };
    }

    // 2. Le dépôt a accepté : on répercute en base locale.
    (db as any).isSyncingInternal = true;
    try {
      if (isDeletion && action === "approve") {
        // Suppression validée : on efface réellement en base locale.
        if (entityType === "profile") {
          await db.profiles.delete(changeId);
          await db.syncEvents.delete(changeId);
        } else {
          const profileKeys = await db.profiles.where("standardId").equals(changeId).primaryKeys();
          await Promise.all(profileKeys.map((k) => db.profiles.delete(k)));
          await db.standards.delete(changeId);
          await db.syncEvents.bulkDelete([changeId, ...profileKeys.map((k) => String(k))]);
          await deleteNodeImagesForStandard(changeId);
        }
      } else if (isDeletion && action === "reject") {
        // Suppression refusée : l'objet redevient officiel (approved), flag effacé.
        if (entityType === "profile") {
          const p = await db.profiles.get(changeId);
          if (p) await upsertProfile({ ...p, status: "approved", pendingDeletion: false });
        } else {
          const s: any = await db.standards.get(changeId);
          if (s) await upsertStandard({ ...s, status: "approved", pendingDeletion: false } as any);
        }
        await db.syncEvents.delete(changeId);
      } else if (entityType === "profile") {
        const targetProfile = await db.profiles.get(changeId);
        if (targetProfile) {
          await upsertProfile({ ...targetProfile, status: nextStatus });
        }
      } else {
        const targetStandard = await db.standards.get(changeId);
        if (targetStandard) {
          const updatedStandard: any = {
            ...targetStandard,
            status: nextStatus,
            manifest: {
              ...targetStandard.manifest,
              isBuiltin: false,
            },
          };
          await upsertStandard(updatedStandard as any);
        }
      }
    } finally {
      (db as any).isSyncingInternal = false;
    }

    // 3. Seulement maintenant, on retire la proposition de la file.
    set((s) => ({
      pendingCommits: s.pendingCommits.filter((c) => c.id !== commitId),
      syncError: null,
    }));

    await get().refreshLocalChanges();
    return { success: true };
  }
}));
