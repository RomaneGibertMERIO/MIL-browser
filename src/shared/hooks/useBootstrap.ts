import { useEffect } from "react";
import { getSettings } from "../../core/db/repositories/settings.repo";
import { useBootstrapStore } from "../../store/bootstrapStore";
import { useAppStore } from "../../store/appStore";
import { loadBuiltinStandards } from "../../core/engine/standardLoader";

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

      // 2. Seed builtin standards (version d'usine)
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

      // 3. Récupération des paramètres locaux
      const settings = await getSettings();
      
      // Si un chemin réseau est enregistré dans vos settings Dexie, on met à jour le store
      if (settings.gitRepoPath) {
        setGitRepoPath(settings.gitRepoPath);
      }
      
      // 4. Lancement de la synchronisation Git (PULL)
      // triggerGitSync gère déjà en interne l'écriture en base IndexedDB
      try {
        console.log("[bootstrap] Init GIT sync...");
        await triggerGitSync();
      } catch (gitErr) {
        console.warn("[bootstrap] Failed to connect to GIT on starting up (Offline mode ON) :", gitErr);
      }

      // 5. Restauration de l'état de navigation
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
      
      // 6. C'est prêt !
      setReady();
    }

    run().catch((err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Unknown startup error.";
      setError(message);
    });
  }, [ready, setReady, setError, setActiveStandard, setAdminView, triggerGitSync, setSystemUsername, setGitRepoPath]);
}
