import { toast } from "./toastStore";

/**
 * Global safety net against renderer-freezing native dialogs.
 *
 * window.alert(), window.confirm() and window.prompt() are all SYNCHRONOUS and
 * block the entire renderer main thread until dismissed — a cause of the reported
 * multi-second "editor freeze" (a native dialog after push/approve/discard froze
 * every text field at once). All in-app call sites have been migrated to toasts
 * and the async <ConfirmDialog/> modal; these guards make it *impossible* for any
 * remaining, legacy (e.g. the dead LibraryPage) or third-party call to lock the
 * UI again. confirm() is shimmed to a safe "cancel" (return false) — the app
 * never wants a blocking native decision.
 *
 * Installed once, before React renders (main.tsx). See docs/UI-UX-SPEC.md §21.
 */
export function installDialogGuards() {
  window.alert = (message?: unknown) => {
    if (message != null && String(message) !== "") toast.info(String(message));
  };

  // Synchrone et bloquant : on le neutralise. L'app confirme toujours via la
  // modale in-app <ConfirmDialog/> ; tout window.confirm() qui arrive ici est
  // parasite/hérité. Retourner false = « ne pas poursuivre » = choix conservateur
  // et non destructeur (ex. conserver des modifications non sauvegardées).
  window.confirm = (message?: string): boolean => {
    console.warn(
      "[dialogGuards] window.confirm() is disabled (would freeze the renderer); returning false.",
      message ?? "",
    );
    return false;
  };

  window.prompt = (): string | null => {
    console.warn("[dialogGuards] window.prompt() is disabled; use an in-app modal.");
    return null;
  };
}
