/**
 * Home — page d'accueil du Management (docs/UI-UX-SPEC.md §15.1).
 *
 * Explique l'application et affiche l'identité de la session (rôle, dépôt,
 * nom de session, chemin du dépôt), puis propose des raccourcis vers les
 * sections accessibles selon le rôle. Aucune logique métier : simple façade
 * de navigation reposant sur l'AppStore et le gate `canAccess`.
 */
import { useAppStore, type AdminView } from "../../store/appStore";
import { canAccessNow, roleLabel } from "../../shared/roles";
import { Icon, type IconName } from "../../shared/components/ui/Icon";
import { RepoBadge } from "../../shared/components/ui/RepoBadge";

type QuickLink = {
  view: AdminView | "browser";
  icon: IconName;
  title: string;
  description: string;
};

const QUICK_LINKS: QuickLink[] = [
  {
    view: "browser",
    icon: "back",
    title: "Standards Browser",
    description: "Browse and compare environmental test profiles.",
  },
  {
    view: "edit",
    icon: "edit",
    title: "Edit database",
    description: "Create and edit profiles, and adjust the taxonomy.",
  },
  {
    view: "sync",
    icon: "sync",
    title: "Synchronization",
    description: "Review your local changes and push them for review.",
  },
  {
    view: "admin",
    icon: "review",
    title: "Admin",
    description: "Approve or reject submissions and manage users.",
  },
  {
    view: "settings",
    icon: "settings",
    title: "Settings",
    description: "Repository path, import / export, and version.",
  },
];

export function HomePage() {
  const role = useAppStore((s) => s.role);
  const repoMode = useAppStore((s) => s.repoMode);
  const isOffline = useAppStore((s) => s.isOffline);
  const systemUsername = useAppStore((s) => s.systemUsername);
  const gitRepoPath = useAppStore((s) => s.gitRepoPath);
  const setAdminView = useAppStore((s) => s.setAdminView);
  const setMode = useAppStore((s) => s.setMode);

  // Même gate que le rail (canAccessNow) : Sync/Admin n'existent qu'EN LIGNE, il
  // ne faut donc pas proposer de raccourci non cliquable en Standalone/Offline.
  const online = repoMode === "shared" && !isOffline;
  const links = QUICK_LINKS.filter(
    (l) => l.view === "browser" || canAccessNow(l.view, role, online),
  );

  function go(view: AdminView | "browser") {
    if (view === "browser") setMode("assistant");
    else setAdminView(view);
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Management</h2>
        <p className="text-sm text-gray-500 mt-1">
          Create, review and synchronize the shared standards database.
        </p>
      </div>

      {/* Identity card */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <Field label="Your role">
            <span className="text-sm font-semibold text-gray-900">{roleLabel(role)}</span>
          </Field>
          <Field label="Repository">
            <RepoBadge />
          </Field>
          <Field label="Session">
            <span className="text-sm font-mono text-gray-900">{systemUsername}</span>
          </Field>
          <Field label="Repository path">
            <span className="text-sm font-mono text-gray-700 break-all">
              {repoMode === "local" || gitRepoPath.trim() === ""
                ? "No central repository configured"
                : gitRepoPath}
            </span>
          </Field>
        </div>
      </div>

      {/* Quick links */}
      <div>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-3">
          What you can do
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {links.map((l) => (
            <button
              key={l.view}
              type="button"
              onClick={() => go(l.view)}
              className="group flex items-start gap-3 text-left rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-400 hover:bg-blue-50/40 transition-colors"
            >
              <span className="flex-shrink-0 mt-0.5 text-gray-400 group-hover:text-blue-600 transition-colors">
                <Icon name={l.icon} size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-900">{l.title}</span>
                <span className="block text-xs text-gray-500 mt-0.5">{l.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
        {label}
      </span>
      {children}
    </div>
  );
}
