import { useEffect } from "react";
import { getSettings } from "../../core/db/repositories/settings.repo";
import { useBootstrapStore } from "../../store/bootstrapStore";
import { useAppStore } from "../../store/appStore";
import { loadBuiltinStandards } from "../../core/engine/standardLoader";
import { db } from "../../core/db/schema";

/**
 * Runs the bootstrap sequence on mount, injecting Git database synchronization.
 */
export function useBootstrap(): void {
  const { ready, setReady, setError } = useBootstrapStore();
  const { 
    setActiveStandard, 
    setAdminView, 
    triggerGitSync, 
    setSystemUsername, 
    setGitRepoPath 
  } = useAppStore();

  useEffect(() => {
    if (ready) return;

    async function run(): Promise<void> {
      // 1. Initialisation du nom d'utilisateur système via Electron
      if (window.electronAPI) {
        setSystemUsername("LabUser");
      }

      // 2. Récupération des paramètres locaux d'abord
      const settings = await getSettings();
      
      // Si un chemin réseau est enregistré dans vos settings Dexie, on met à jour le store
      if (settings.gitRepoPath) {
        setGitRepoPath(settings.gitRepoPath);
      }

      // 3. Vérification de l'état de la base
      const standardsCount = await db.standards.count();
      const hasGitConfigured = !!settings.gitRepoPath;

      // 4. Lancement de la synchronisation Git (PULL) si configuré
      let gitSyncSuccess = false;
      if (hasGitConfigured) {
        try {
          console.log("[bootstrap] Init central GIT sync...");
          await triggerGitSync();
          gitSyncSuccess = true;
        } catch (gitErr) {
          console.warn("[bootstrap] Failed to connect to Central GIT on starting up (Offline mode ON) :", gitErr);
        }
      }

      // 5. Seed builtin standards uniquement s'il n'y a pas de Git opérationnel OU si la base est totalement vide
      if (!gitSyncSuccess && standardsCount === 0) {
        console.log("[bootstrap] Empty DB and no Git sync. Loading fallback builtin standards...");
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
      } else {
        console.log("[bootstrap] Skipped builtin seed (using central Git data or existing cache).");
      }

      // 6. Restauration de l'état de navigation
      if (settings.activeStandardId !== null) {
        setActiveStandard(settings.activeStandardId);
      }

      const adminViewMap: Record<string, Parameters<typeof setAdminView>[0]> = {
        browse:    "browse",
        library:   "library",
        standards: "standards",
        settings:  "settings",
      };
      const lastAdminView = adminViewMap[settings.lastView];
      if (lastAdminView !== undefined) {
        setAdminView(lastAdminView);
      }
      await useAppStore.getState().refreshLocalChanges();
      
      // 7. C'est prêt !
      setReady();
    }

    run().catch((err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Unknown startup error.";
      setError(message);
    });
  }, [ready, setReady, setError, setActiveStandard, setAdminView, triggerGitSync, setSystemUsername, setGitRepoPath]);
}
