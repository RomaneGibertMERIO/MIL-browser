/**
 * Rail de navigation du Management (docs/UI-UX-SPEC.md §4/§5).
 *
 * Colonne claire (structure grisée) présentant les cinq destinations —
 * Home / Edit / Sync / Settings / Admin — filtrées par le rôle ET la connexion
 * via `canAccessNow` (Sync et Admin, vues de collaboration, sont masqués en
 * autonome et hors-ligne), un bouton « ← Browser » pour revenir au navigateur,
 * et un rappel du rôle et de l'état du dépôt en bas. Le sélecteur de norme et le
 * bouton de push, jadis ici, vivent désormais dans les sections Edit et Sync.
 */
import { useAppStore, type AdminView } from "../store/appStore";
import { Icon, type IconName } from "../shared/components/ui/Icon";
import { canAccessNow, roleLabel } from "../shared/roles";
import { RepoBadge } from "../shared/components/ui/RepoBadge";

const RAIL_ITEMS: { view: AdminView; label: string; icon: IconName }[] = [
  { view: "home", label: "Home", icon: "home" },
  { view: "edit", label: "Edit database", icon: "edit" },
  { view: "sync", label: "Synchronization", icon: "sync" },
  { view: "settings", label: "Settings", icon: "settings" },
  { view: "admin", label: "Admin", icon: "review" },
];

export function Sidebar() {
  const adminView = useAppStore((s) => s.adminView);
  const setAdminView = useAppStore((s) => s.setAdminView);
  const setMode = useAppStore((s) => s.setMode);
  const role = useAppStore((s) => s.role);
  const repoMode = useAppStore((s) => s.repoMode);
  const isOffline = useAppStore((s) => s.isOffline);
  const pendingCommits = useAppStore((s) => s.pendingCommits);

  // Gating d'affichage uniquement : le refus d'accès réel est appliqué par le
  // processus principal, à partir du compte système (non falsifiable). Sync et
  // Admin ne s'affichent qu'en ligne (dépôt configuré et joignable).
  const online = repoMode === "shared" && !isOffline;
  const items = RAIL_ITEMS.filter((it) => canAccessNow(it.view, role, online));

  return (
    <nav className="flex flex-col h-full w-56 flex-shrink-0 bg-gray-50 border-r border-gray-200">
      {/* Retour au navigateur */}
      <div className="p-3 border-b border-gray-200 flex-shrink-0">
        <button
          onClick={() => setMode("assistant")}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-md transition-colors"
        >
          <Icon name="back" size={16} />
          <span>Browser</span>
        </button>
      </div>

      {/* Destinations */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {items.map(({ view, label, icon }) => {
          const active = adminView === view;
          return (
            <button
              key={view}
              onClick={() => setAdminView(view)}
              aria-current={active ? "page" : undefined}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon name={icon} size={16} />
                <span className="truncate">{label}</span>
              </span>
              {view === "admin" && pendingCommits.length > 0 && (
                <span
                  className={`flex-shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded ${
                    active ? "bg-white/20 text-white" : "bg-orange-100 text-orange-700"
                  }`}
                >
                  {pendingCommits.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Identité : rôle + état du dépôt */}
      <div className="p-3 border-t border-gray-200 flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Role
          </span>
          <span className="text-xs font-semibold text-gray-700">{roleLabel(role)}</span>
        </div>
        <RepoBadge />
      </div>
    </nav>
  );
}
