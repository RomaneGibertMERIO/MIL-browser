/**
 * Pastilles d'état du dépôt et de rôle, partagées par l'en-tête Management et
 * le rail. Couleurs sémantiques uniquement (docs/UI-UX-SPEC.md §8) :
 * gris = neutre/autonome, vert = synchronisé, orange = hors-ligne. Le rôle
 * n'est pas un statut : il reste monochrome (gris).
 */
import { useAppStore } from "../../../store/appStore";
import { roleLabel } from "../../roles";

export function RepoBadge() {
  const repoMode = useAppStore((s) => s.repoMode);
  const isOffline = useAppStore((s) => s.isOffline);

  const cfg =
    repoMode === "local"
      ? {
          dot: "bg-gray-400",
          cls: "text-gray-600 bg-gray-100 border-gray-200",
          label: "Standalone",
          title: "No central repository — built-in standards only.",
        }
      : isOffline
      ? {
          dot: "bg-orange-500",
          cls: "text-orange-700 bg-orange-50 border-orange-200",
          label: "Offline",
          title: "Central repository unreachable — working from the last synced state.",
        }
      : {
          dot: "bg-green-500",
          cls: "text-green-700 bg-green-50 border-green-200",
          label: "Shared",
          title: "Connected to the central repository.",
        };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold rounded border ${cfg.cls}`}
      title={cfg.title}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export function RoleBadge() {
  const role = useAppStore((s) => s.role);
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide rounded border text-gray-600 bg-gray-100 border-gray-200"
      title="Your role in the shared repository"
    >
      {roleLabel(role)}
    </span>
  );
}
