import { useEffect } from "react";
import { loadBuiltinStandards } from "../../core/engine/standardLoader";
import { getSettings } from "../../core/db/repositories/settings.repo";
import { useBootstrapStore } from "../../store/bootstrapStore";
import { useAppStore } from "../../store/appStore";

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
        // Optionnel : Vous pouvez exposer une fonction IPC pour récupérer le vrai nom Windows/macOS.
        // En attendant, on l'initialise proprement.
        setSystemUsername("Utilisateur Labo");
      }

      // 2. Seed builtin standards (votre logique d'origine)
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

      // 3. Récupération des paramètres locaux et du chemin réseau Git
      const settings = await getSettings();
      
      // Si un chemin réseau est enregistré dans vos settings Dexie, on met à jour le store
      if (settings.gitRepoPath) {
        setGitRepoPath(settings.gitRepoPath);
      }

      // 4. Lancement de la synchronisation Git (PULL)
      // Nous l'exécutons ici afin que l'interface IndexedDB reçoive les dernières modifications du serveur
      // AVANT que l'écran de chargement ne disparaisse.
      try {
        console.log("[bootstrap] Initialisation de la synchronisation réseau Git...");
        await triggerGitSync();
      } catch (gitErr) {
        // On ne bloque pas le démarrage de l'app si le réseau est inaccessible (mode hors-ligne)
        console.warn("[bootstrap] Échec de la synchronisation Git au démarrage (mode hors-ligne actif) :", gitErr);
      }

      // 5. Restauration de l'état de navigation (votre logique d'origine)
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
