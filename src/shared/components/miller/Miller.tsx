/**
 * Miller — primitives de navigation en colonnes (Finder) réutilisables.
 *
 * Extraites (dupliquées volontairement) des primitives privées du Browser
 * (features/assistant/AssistantPage.tsx) pour être partagées par les écrans
 * d'édition (phase 4a : profils ; phase 4b : taxonomie) SANS toucher au Browser
 * déjà validé. Purement présentationnel + helpers de dérivation purs : aucun
 * couplage au store, à Dexie ou aux moteurs. La convergence du Browser vers ce
 * module se fera progressivement.
 *
 * Voir docs/UI-UX-SPEC.md §6/§12 (tons gris de structure, colonnes à largeur
 * égale, ligne « + » en bas de colonne en mode édition).
 */
import type { ReactNode } from "react";
import type { StandardPlugin } from "../../../core/domain/standard";
import type { TaxonomyNodeItem } from "../../../core/domain/tree";
import type { Profile } from "../../../core/domain/profile";
import { statusStyle } from "../../profileStatus";
import { Badge } from "../ui/Badge";
import { Icon } from "../ui/Icon";

export const COL_MIN = 130; // largeur mini d'une colonne du Miller

// ---------------------------------------------------------------------------
// Helpers de dérivation (purs)
// ---------------------------------------------------------------------------

export function findNode(nodes: TaxonomyNodeItem[], id: string): TaxonomyNodeItem | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found !== null) return found;
  }
  return null;
}

/** Colonnes du Miller à partir de l'arbre et du chemin sélectionné. */
export function buildColumns(tree: TaxonomyNodeItem[], selectedPath: string[]): TaxonomyNodeItem[][] {
  const columns: TaxonomyNodeItem[][] = [tree];
  let currentLevel = tree;
  for (const nodeId of selectedPath) {
    const node = currentLevel.find((n) => n.id === nodeId);
    if (node == null) break;
    if (node.children.length > 0) columns.push(node.children);
    currentLevel = node.children;
  }
  return columns;
}

/** Intitulé d'une colonne de nœuds, déduit du type du premier nœud. */
export function columnHeading(nodes: TaxonomyNodeItem[]): string {
  if (nodes.length === 0) return "Items";
  const labels: Record<string, string> = {
    method: "Methods", procedure: "Procedures", category: "Categories",
    zone: "Zones", condition: "Conditions", section: "Sections", custom: "Items",
  };
  return labels[nodes[0].type] ?? "Items";
}

// ---------------------------------------------------------------------------
// Primitives présentationnelles
// ---------------------------------------------------------------------------

export function MillerColumn({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="flex-1 flex flex-col border-r border-gray-200 bg-gray-50/50" style={{ minWidth: COL_MIN }}>
      <PanelHeader>{heading}</PanelHeader>
      <div className="flex-1 overflow-y-auto py-1">{children}</div>
    </div>
  );
}

export function PanelHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex-shrink-0 px-3 py-2 border-b border-gray-100">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{children}</p>
    </div>
  );
}

export function Chevron({ selected }: { selected: boolean }) {
  return (
    <svg className={`flex-shrink-0 w-3 h-3 mt-1 ${selected ? "text-blue-200" : "text-gray-300"}`} viewBox="0 0 16 16" fill="currentColor">
      <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z" />
    </svg>
  );
}

export function StandardRow({ standard, selected, onSelect, statusDot }: {
  standard: StandardPlugin; selected: boolean; onSelect: () => void; statusDot?: ReactNode;
}) {
  return (
    <button onClick={onSelect} title={standard.manifest.label}
      className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${selected ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-white"}`}>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          {statusDot}
          <span className="block text-sm font-medium leading-snug truncate">{standard.manifest.label}</span>
        </span>
        <span className={`block text-xs truncate ${selected ? "text-blue-200" : "text-gray-400"}`}>{standard.manifest.organization}</span>
      </span>
      <Chevron selected={selected} />
    </button>
  );
}

export function NodeRow({ node, selected, onSelect, statusDot }: {
  node: TaxonomyNodeItem; selected: boolean; onSelect: () => void; statusDot?: ReactNode;
}) {
  return (
    <button onClick={onSelect} title={node.label}
      className={`w-full text-left px-3 py-2 flex items-start gap-2 transition-colors ${selected ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50"}`}>
      <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${node.hasProfiles ? (selected ? "bg-blue-200" : "bg-blue-400") : "bg-transparent"}`} />
      <span className="flex-1 min-w-0">
        <span className={`block text-xs font-mono leading-tight ${selected ? "text-blue-200" : "text-gray-400"}`}>{node.code}</span>
        <span className="block text-sm leading-snug">{node.label}</span>
      </span>
      {statusDot && <span className="flex-shrink-0 mt-1.5">{statusDot}</span>}
      {node.children.length > 0 && <Chevron selected={selected} />}
    </button>
  );
}

/** Ligne « + … » en bas d'une colonne (mode édition). */
export function AddRow({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="w-full text-left px-3 py-2 flex items-center gap-2 text-sm font-medium text-blue-600 border-t border-gray-100 hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
      <Icon name="add" size={14} />
      <span className="truncate">{label}</span>
    </button>
  );
}

/** Ligne de profil en mode édition : clic = ouvrir dans l'éditeur (pas d'épingle). */
export function EditProfileRow({ profile, selected, onSelect }: {
  profile: Profile; selected: boolean; onSelect: () => void;
}) {
  const s = statusStyle(profile.status);
  return (
    <button onClick={onSelect} title={profile.name}
      className={`w-full text-left px-3 py-2.5 border-b border-gray-50 transition-colors ${selected ? "bg-blue-50 border-l-2 border-l-blue-500 pl-2.5" : "hover:bg-blue-50/60"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-sm font-medium truncate ${selected ? "text-blue-700" : "text-gray-900"}`}>{profile.name}</p>
        <span className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
          <Badge variant={s.variant}>{s.label}</Badge>
        </span>
      </div>
      <p className="text-[11px] text-gray-400 mt-0.5">{profile.dataset.length} data points</p>
    </button>
  );
}
