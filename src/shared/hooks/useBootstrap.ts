import { useEffect, useRef } from "react";
import { getSettings } from "../../core/db/repositories/settings.repo";
import { useBootstrapStore } from "../../store/bootstrapStore";
import { useAppStore } from "../../store/appStore";
import { canAccess } from "../roles";
import { loadBuiltinStandards } from "../../core/engine/standardLoader";
import { db } from "../../core/db/schema";
import { standardWorkspace } from "../../core/domain/standard";
import { compactStandardSyncEvents } from "../../core/db/repositories/syncEvents.repo";
import { extractStandardImages } from "../../core/db/repositories/nodeImages.repo";
import { getElectronBridge } from "../electronBridge";

/**
 * Runs the bootstrap sequence on mount, injecting Git database synchronization.
 */
export function useBootstrap(): void {
  // Sélecteurs ciblés : sans eux, ce hook (appelé depuis App) réabonne toute la
  // racine à l'intégralité des deux stores, et le moindre `set` re-rend l'arbre.
  const setReady = useBootstrapStore((s) => s.setReady);
  const setError = useBootstrapStore((s) => s.setError);

  const setActiveStandard = useAppStore((s) => s.setActiveStandard);
  const setAdminView = useAppStore((s) => s.setAdminView);
  const triggerGitSync = useAppStore((s) => s.triggerGitSync);
  const setSystemUsername = useAppStore((s) => s.setSystemUsername);
  const setGitRepoPath = useAppStore((s) => s.setGitRepoPath);

  // Garde de ré-entrance. `ready` ne passait à true qu'À LA FIN de run() : sous
  // <StrictMode>, le double montage relançait donc run() une seconde fois en
  // parallèle (double seed, double pull Git, écritures Dexie concurrentes).
  // Un ref survit au démontage/remontage de StrictMode, contrairement à l'état.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function run(): Promise<void> {
      // 1. Initialisation du nom d'utilisateur système via Electron
      const bridge = getElectronBridge();
      if (bridge !== null) {
        try {
          setSystemUsername(await bridge.getSystemUsername());
        } catch (err) {
          console.warn("[bootstrap] Nom d'utilisateur OS indisponible :", err);
          setSystemUsername("Unknown-User");
        }
      } else {
        setSystemUsername("Browser-Session");
      }

      // 1bis. Compaction unique des événements de synchro trop lourds
      //       (anciens standards illustrés stockés en entier). Évite le gel de
      //       refreshLocalChanges hérité des versions précédentes.
      try {
        const compacted = await compactStandardSyncEvents();
        if (compacted > 0) console.log(`[bootstrap] ${compacted} événement(s) de synchro compacté(s).`);
      } catch (err) {
        console.warn("[bootstrap] Compaction des événements de synchro impossible :", err);
      }

      // 1ter. Migration unique (phase 8) : draine les images de nœuds base64 des
      //       lignes db.standards vers db.nodeImages, AVANT toute live-query /
      //       seed / synchro, pour éliminer le gel de la liste des normes.
      try {
        await extractStandardImages();
      } catch (err) {
        console.warn("[bootstrap] Extraction des images de nœuds impossible :", err);
      }

      // 2. Récupération des paramètres locaux d'abord
      const settings = await getSettings();
      
      if (settings.gitRepoPath) {
        setGitRepoPath(settings.gitRepoPath);
      }

      // 3. Charger le socle builtin s'il est absent de l'espace autonome.
      //
      // On compte les normes de l'espace "local", et non la table entière :
      // sinon, un poste branché sur un dépôt central (donc avec des normes
      // "shared" en base) ne réinstallerait jamais le socle, et se retrouverait
      // sans rien à afficher le jour où le dépôt est retiré des réglages.
      const allStandards = await db.standards.toArray();
      const localCount = allStandards.filter((s) => standardWorkspace(s) === "local").length;
      if (localCount === 0) {
        console.log("[bootstrap] Empty DB. Loading fallback builtin standards...");
        const seedResults = await loadBuiltinStandards();
        const seedErrors = seedResults
          .filter((r) => r.status === "error")
          .map((r) => r.message ?? r.id);

        if (seedErrors.length > 0) {
          console.warn("[bootstrap] Standard seed warnings:", seedErrors);
        }
        if (seedResults.length === 0 || seedResults.every((result) => result.status === "error")) {
          throw new Error(
            `Built-in standards could not be loaded: ${seedErrors.join("; ") || "no bundled standards found"}`,
          );
        }
      }

      // 4. Lancement de la synchronisation Git (PULL) pour fusionner avec les données réseau
      if (settings.gitRepoPath) {
        try {
          console.log("[bootstrap] Init central GIT sync...");
          await triggerGitSync();
        } catch (gitErr) {
          console.warn("[bootstrap] Failed to connect to Central GIT on starting up (Offline mode ON) :", gitErr);
        }
      }

      // 5. Restauration de l'état de navigation
      if (settings.activeStandardId !== null) {
        setActiveStandard(settings.activeStandardId);
      }

      // `settings.lastView` conserve d'anciennes valeurs (schéma Zod inchangé) ;
      // on les projette sur les nouvelles destinations du rail. Les valeurs non
      // mappées (browse/assistant) laissent l'application sur son accueil.
      const adminViewMap: Record<string, Parameters<typeof setAdminView>[0]> = {
        library:   "edit",
        standards: "edit",
        settings:  "settings",
      };
      // On ne restaure une vue que si le rôle synchronisé y donne accès : sinon
      // un readonly dont l'ancien lastView pointait vers 'edit' atterrirait sur
      // l'écran « rôle insuffisant » sans onglet actif dans le rail. Le défaut
      // accessible ('home') est conservé dans le cas contraire.
      const lastAdminView = adminViewMap[settings.lastView];
      if (lastAdminView !== undefined && canAccess(lastAdminView, useAppStore.getState().role)) {
        setAdminView(lastAdminView);
      }
      // 5bis. Multi-fenêtre (spec §11) : une fenêtre secondaire est ouverte avec
      //       `?standard=<id>`. On force alors le Browser et on pré-sélectionne
      //       la norme demandée, en écrasant l'état de navigation restauré :
      //       cette fenêtre doit atterrir là où l'utilisateur l'a demandée, quel
      //       que soit le dernier écran mémorisé. Sans paramètre (fenêtre
      //       principale), rien ne change.
      const requestedStandard = new URLSearchParams(window.location.search).get("standard");
      if (requestedStandard) {
        useAppStore.getState().setMode("assistant");
        setActiveStandard(requestedStandard);
      }

      await useAppStore.getState().refreshLocalChanges();

      // 6. C'est prêt !
      setReady();
    }

    run().catch((err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Unknown startup error.";
      // En cas d'échec, on relâche la garde pour qu'un remontage puisse retenter.
      startedRef.current = false;
      setError(message);
    });
    // Volontairement vide : la séquence de démarrage ne doit tourner qu'une fois
    // par session, et la garde ci-dessus protège du double montage StrictMode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
