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
      // 1. Initialisation du nom d'utilisateur système via Electron (Détection sécurisée)
      const electronBridge = (window as any).electron || (window as any).electronAPI;
      if (electronBridge) {
        setSystemUsername("LabUser");
      }

      // 2. Récupération des paramètres locaux d'abord
      const settings = await getSettings();
      
      if (settings.gitRepoPath) {
        setGitRepoPath(settings.gitRepoPath);
      }

      // 3. Charger les standards BUILTIN si la base est vide (Indépendamment de Git !)
      const standardsCount = await db.standards.count();
      if (standardsCount === 0) {
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
  }, [ready]);
}
