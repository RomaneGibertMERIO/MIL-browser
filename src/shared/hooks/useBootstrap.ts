/**
 * Application bootstrap hook.
 *
 * Orchestrates the startup sequence that must complete before any feature
 * view is rendered:
 * 1. Open the IndexedDB database (implicit when Dexie is first accessed).
 * 2. Seed / update builtin standard plugins from public/standards/.
 * 3. Restore navigation state from AppSettings.
 *
 * This hook should be called exactly once, at the root of the application.
 * It writes its result into the bootstrapStore so child components can
 * react to readiness without receiving props.
 *
 * Failure handling: any fatal error during bootstrap is caught and written
 * to bootstrapStore.error. The error screen is shown instead of the app.
 */

import { useEffect } from "react";
import { loadBuiltinStandards } from "../../core/engine/standardLoader";
import { getSettings } from "../../core/db/repositories/settings.repo";
import { useBootstrapStore } from "../../store/bootstrapStore";
import { useAppStore } from "../../store/appStore";

/**
 * Runs the bootstrap sequence on mount.
 * Safe to call multiple times — subsequent calls are no-ops because
 * bootstrapStore.ready is already true.
 */
export function useBootstrap(): void {
  const { ready, setReady, setError } = useBootstrapStore();
  const { setActiveStandard, setAdminView } = useAppStore();

  useEffect(() => {
    if (ready) return;

    async function run(): Promise<void> {
      // Seed builtin standards. Errors are non-fatal (individual results
      // carry status "error") — the app can still run with partial data.
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

      // Restore navigation state from settings.
      const settings = await getSettings();
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

      setReady();
    }

    run().catch((err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Unknown startup error.";
      setError(message);
    });
  }, [ready, setReady, setError, setActiveStandard, setAdminView]);
}
