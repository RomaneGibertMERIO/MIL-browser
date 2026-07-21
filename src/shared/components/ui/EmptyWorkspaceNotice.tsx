/**
 * Message affiché quand l'espace de travail actif ne contient aucune norme.
 *
 * Sans lui, trois situations très différentes produisent le même écran vide,
 * impossible à diagnostiquer pour l'utilisateur :
 *
 *  1. Dépôt central configuré mais jamais synchronisé (lecteur réseau absent,
 *     VPN coupé, chemin erroné) — l'espace partagé est vide parce que rien n'a
 *     encore été reçu, pas parce que le dépôt est vide.
 *  2. Dépôt central joignable mais ne contenant aucune norme.
 *  3. Mode autonome dont le socle d'usine n'a pas pu être chargé.
 *
 * Chaque cas appelle une action différente : on les distingue explicitement.
 */

import { useAppStore } from "../../../store/appStore";

interface EmptyWorkspaceNoticeProps {
  /** "page" occupe tout l'espace disponible ; "banner" s'intercale dans une vue. */
  variant?: "page" | "banner";
}

export function EmptyWorkspaceNotice({ variant = "page" }: EmptyWorkspaceNoticeProps) {
  const repoMode = useAppStore((s) => s.repoMode);
  const isOffline = useAppStore((s) => s.isOffline);
  const gitRepoPath = useAppStore((s) => s.gitRepoPath);
  const setMode = useAppStore((s) => s.setMode);
  const setAdminView = useAppStore((s) => s.setAdminView);
  const triggerGitSync = useAppStore((s) => s.triggerGitSync);

  function openSettings() {
    setMode("admin");
    setAdminView("settings");
  }

  const content = (() => {
    if (repoMode === "local") {
      return {
        tone: "slate" as const,
        title: "No standards are loaded",
        body: (
          <>
            The application is running in <strong>standalone mode</strong>, and the built-in
            standards could not be loaded. This usually means the local database is in an
            inconsistent state.
          </>
        ),
        hint: "Restarting the application reloads the built-in standards from the installed files.",
        actions: (
          <button type="button" onClick={openSettings} className={buttonCls}>
            Open Settings
          </button>
        ),
      };
    }

    if (isOffline) {
      return {
        tone: "amber" as const,
        title: "Central repository unreachable — nothing synchronised yet",
        body: (
          <>
            This workstation points at a shared repository, but has <strong>never completed a
            synchronisation</strong>. The shared workspace is therefore empty: no standard has been
            received yet. Nothing has been lost.
          </>
        ),
        hint: `Configured path: ${gitRepoPath || "(none)"}`,
        actions: (
          <>
            <button type="button" onClick={() => { void triggerGitSync(); }} className={buttonCls}>
              Retry synchronisation
            </button>
            <button type="button" onClick={openSettings} className={secondaryCls}>
              Check the path
            </button>
          </>
        ),
      };
    }

    return {
      tone: "slate" as const,
      title: "The shared repository contains no standards",
      body: (
        <>
          Synchronisation succeeded, but the central repository holds no standard yet. While a
          repository is configured, it is the <strong>single source of truth</strong> — built-in
          standards are intentionally hidden.
        </>
      ),
      hint: "An administrator can import a standard, or you can clear the repository path in Settings to work in standalone mode.",
      actions: (
        <button type="button" onClick={openSettings} className={buttonCls}>
          Open Settings
        </button>
      ),
    };
  })();

  const toneCls =
    content.tone === "amber"
      ? "bg-amber-50 border-amber-200"
      : "bg-slate-50 border-slate-200";

  const inner = (
    <div className={`rounded-xl border p-5 ${toneCls}`}>
      <p className="text-sm font-bold text-gray-900">{content.title}</p>
      <p className="mt-2 text-sm text-gray-600 leading-relaxed">{content.body}</p>
      <p className="mt-2 text-xs text-gray-400 font-mono break-all">{content.hint}</p>
      <div className="mt-4 flex flex-wrap gap-2">{content.actions}</div>
    </div>
  );

  if (variant === "banner") return inner;

  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="max-w-lg w-full">{inner}</div>
    </div>
  );
}

const buttonCls =
  "px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors";

const secondaryCls =
  "px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors";
