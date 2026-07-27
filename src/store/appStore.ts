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
): Promise<void> {
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
        }
        // Un standard refusé chez un tiers n'est PAS supprimé : il peut s'agir
        // d'une taxonomie dont il dépend. Il repasse simplement hors validation
        // au prochain pull, puisque le fichier central a disparu.
      }
    } catch (err) {
      console.error(`Application du refus impossible (${marker.entity} ${marker.id}) :`, err);
    }
  }
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
  const candidates = (await db.standards.toArray()).filter(
    (s: any) => standardWorkspace(s) === "local" && s.manifest?.isBuiltin === true,
  );
  if (candidates.length === 0) return 0;

  let pushed = 0;
  for (const standard of candidates) {
    // Ré-attache les images (no-op pour les builtin qui utilisent des chemins).
    const withImages = await attachNodeImages(standard);
    const result = toIpcResult(
      await api.gitSubmitStandard({ repoPath, username, standard: withImages }),
      "gitSubmitStandard n'a renvoyé aucun résultat.",
    );
    if (result.success) pushed++;
    else console.error(`Amorçage : "${standard.manifest.id}" non publié — ${result.error}`);
  }

  console.log(`Amorçage du dépôt central : ${pushed}/${candidates.length} normes publiées.`);
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
  "Le pont Electron est indisponible : l'application tourne hors de son conteneur de bureau. " +
  "Aucune opération sur le dépôt central n'a été effectuée.";

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
          set({ syncError: `Restauration du socle impossible : ${String(err)}` });
        });
    }

    const api = getElectronBridge();
    if (api === null || repoMode === "local") return;

    void api
      .gitSetRepoPath(gitRepoPath)
      .then((raw) => {
        const result = toIpcResult(raw, "Réponse invalide de gitSetRepoPath.");
        if (!result.success) {
          set({ syncError: `Dépôt central inaccessible : ${result.error ?? "erreur inconnue"}` });
        }
      })
      .catch((err: unknown) => {
        set({ syncError: `Dépôt central inaccessible : ${String(err)}` });
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

        aggregatedMap.set(event.id, {
          id: event.id,
          type: event.entity as 'profile' | 'standard',
          action: event.operation === 'upsert' ? 'Modified' : 'Deleted',
          name: name,
          location: location,
          proposedData: payload
        });
      }

      set({ localStagedChanges: Array.from(aggregatedMap.values()) });
    } catch (err) {
      console.error("Erreur refreshLocalChanges :", err);
    }
  },

  triggerGitSync: async () => {
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
      const message = `Synchronisation Git impossible : ${err instanceof Error ? err.message : String(err)}`;
      // On RESTE en mode partagé : l'utilisateur continue sur le dernier état
      // synchronisé plutôt que de voir les normes de l'équipe disparaître.
      set({ syncError: message, isOffline: true });
      await get().refreshLocalChanges();
      return { success: false, error: message };
    }

    if (!gitResult?.success) {
      const message = `Synchronisation Git refusée : ${gitResult?.error ?? "erreur inconnue"}`;
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
      (db as any).isSyncingInternal = true;
      const skipped: string[] = [];
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
            skipped.push("standard sans identifiant");
            console.error("[sync] Standard central corrompu ignoré (manifest.id manquant) :", std);
            continue;
          }

          try {
            await upsertStandard({
              ...std,
              manifest: { ...std.manifest, isBuiltin: false },
              status: std.status || "approved",
              // Vient du dépôt central : c'est la version qui fait autorité.
              workspace: "shared",
            } as any);
          } catch (err) {
            skipped.push(std.manifest.id);
            console.error(`[sync] Standard "${std.manifest.id}" non importé :`, err);
          }
        }

        for (const rawProf of gitResult.pulledProfiles) {
          const prof = rawProf as any;
          if (!prof?.id || typeof prof.id !== "string") {
            skipped.push("profil sans identifiant");
            console.error("[sync] Profil central corrompu ignoré (id manquant) :", prof);
            continue;
          }
          try {
            await upsertProfile(prof);
          } catch (err) {
            skipped.push(prof.id);
            console.error(`[sync] Profil "${prof.id}" non importé :`, err);
          }
        }

        await applyRejections(gitResult.rejections ?? [], state.systemUsername);
        await applyDeletions(gitResult.deletions ?? []);
      } finally {
        (db as any).isSyncingInternal = false;
      }

      if (skipped.length > 0) {
        set({
          syncError:
            `${skipped.length} enregistrement(s) du dépôt central sont corrompus et ont été ignorés ` +
            `(${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? "…" : ""}). ` +
            `La synchronisation s'est poursuivie normalement.`,
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
        ...pendingProfiles.map((p: any) => ({
          id: `commit-${p.id}`,
          author: p.author || "Collaborateur",
          date: p.updatedAt ? p.updatedAt.split('T')[0] : new Date().toISOString().split('T')[0],
          commitMessage: `Proposition de profil : ${p.name}`,
          changes: [{
            id: p.id,
            type: "profile" as const,
            action: "Created" as const,
            name: p.name,
            location: `${p.standardId}`,
            proposedData: p
          }]
        })),
        ...pendingStandards.map((s: any) => ({
          id: `commit-${s.manifest.id}`,
          author: s.lastModifiedBy || "Collaborateur",
          date: s.updatedAt ? s.updatedAt.split('T')[0] : new Date().toISOString().split('T')[0],
          commitMessage: `Proposition de taxonomie : ${s.manifest.name || s.manifest.id}`,
          changes: [{
            id: s.manifest.id,
            type: "standard" as const,
            action: "Modified" as const,
            name: s.manifest.name || s.manifest.id,
            location: s.manifest.organization || "Global",
            proposedData: s
          }]
        }))
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
              "La suppression n'est pas disponible sur ce pont Electron.",
            );

            if (!result.success) {
              failures.push(`${label} : ${result.error ?? "refus du dépôt central"}`);
              continue;
            }

            pushedEventIds.push(event.id);
            continue;
          }

          if (event.entity === "profile") {
            const profileToSend = {
              ...payload,
              author: state.systemUsername,
              status: "pending" as const
            };

            const result = toIpcResult(
              await api.gitSubmitProfile({
                username: state.systemUsername,
                profile: profileToSend
              }),
              "gitSubmitProfile n'a renvoyé aucun résultat.",
            );

            if (!result.success) {
              failures.push(`${label} : ${result.error ?? "refus du dépôt central"}`);
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
              failures.push(`${label} : standard sans identifiant, publication refusée`);
              continue;
            }

            // Le payload de l'événement n'est qu'un RÉSUMÉ (sans noeuds ni
            // images, pour ne pas geler refreshLocalChanges). On relit donc la
            // version COMPLÈTE et à jour depuis la base avant de la pousser.
            const fullStandard = await db.standards.get(payload.manifest.id);
            if (fullStandard === undefined) {
              failures.push(`${label} : standard introuvable en base, publication ignorée`);
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
              "gitSubmitStandard n'a renvoyé aucun résultat.",
            );

            if (!result.success) {
              failures.push(`${label} : ${result.error ?? "refus du dépôt central"}`);
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
        `${failures.length} modification(s) sur ${events.length} n'ont pas pu être poussées — ` +
        failures.join(" | ");
      set({ syncError: message });
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

    const nextStatus = action === "approve" ? "approved" : "local";

    // 1. Appel Git — on ne touche à RIEN tant qu'il n'a pas explicitement réussi.
    let result: IpcResult;
    try {
      if (entityType === "profile") {
        result = toIpcResult(
          action === "approve"
            ? await api.gitApproveProfile(changeId)
            : await api.gitRejectProfile({ profileId: changeId, reason: reason ?? "" }),
          `L'opération "${action}" n'est pas disponible sur ce pont Electron.`,
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
          `L'opération "${action}" n'est pas disponible sur ce pont Electron.`,
        );
      }
    } catch (err) {
      result = { success: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (!result.success) {
      const message =
        `Impossible de ${action === "approve" ? "valider" : "rejeter"} "${changeItem?.name ?? changeId}" : ` +
        `${result.error ?? "erreur inconnue"}. Aucune modification n'a été appliquée.`;
      set({ syncError: message });
      // La proposition RESTE dans la file : elle n'a pas été traitée.
      return { success: false, error: message };
    }

    // 2. Le dépôt a accepté : on répercute en base locale.
    (db as any).isSyncingInternal = true;
    try {
      if (entityType === "profile") {
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
