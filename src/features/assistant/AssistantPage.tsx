/**
 * Standards Browser — navigation Miller Columns (façon Finder).
 *
 * LECTURE SEULE. Aucun contrôle d'édition ici ; l'édition se fait dans l'espace
 * de gestion (sidebar → Library / Standards).
 *
 * Disposition
 * ───────────
 *   ┌─ Miller (colonnes, défile horizontalement) ─┬─sep─┬─ Détail + épingles ─┐
 *   │ [Normes][nœuds]…[profils]                    │     │ [sélection][pin][pin]│
 *   └──────────────────────────────────────────────┴─────┴──────────────────────┘
 *
 * - La 1re colonne du Miller EST le sélecteur de norme (plus de champ en haut).
 * - Sélectionner un nœud révèle la colonne suivante (ses enfants) puis, en bout
 *   de chaîne, la colonne des profils.
 * - Le panneau de détail montre le nœud sélectionné, ou la carte du profil.
 * - Un profil peut être ÉPINGLÉ : il s'ouvre en colonne supplémentaire à droite
 *   pour comparer plusieurs profils côte à côte (y compris de normes
 *   différentes). Chaque épingle est refermable.
 * - Un séparateur déplaçable redimensionne le Miller et le panneau ; aucun des
 *   deux ne peut disparaître (largeurs minimales garanties).
 */

import React, { useState, useMemo, useRef, useEffect } from "react";
import type { Profile } from "../../core/domain/profile";
import type { StandardPlugin } from "../../core/domain/standard";
import type { TaxonomyNodeItem } from "../../core/domain/tree";
import { buildTree, getProfilesForNode } from "../../core/engine/treeBuilder";
import { useStandards } from "../../shared/hooks/useStandards";
import { useProfilesByStandard } from "../../shared/hooks/useProfiles";
import { useAppStore } from "../../store/appStore";
import { saveActiveStandard } from "../../core/db/repositories/settings.repo";
import { LoadingSpinner } from "../../shared/components/ui/LoadingSpinner";
import { EmptyWorkspaceNotice } from "../../shared/components/ui/EmptyWorkspaceNotice";
import { Badge } from "../../shared/components/ui/Badge";
import { profileStatusLabel } from "../../shared/profileStatus";
import { ProfileDetail } from "../profile/ProfileDetail";
import { getEffectiveSchema } from "../../core/engine/profileEngine";

// ---------------------------------------------------------------------------
// Constantes de mise en page
// ---------------------------------------------------------------------------

const MIN_MILLER = 320;   // largeur mini de la zone Miller
const MIN_DETAIL = 340;   // largeur mini de la zone de détail
const PINNED_WIDTH = 360; // largeur d'un panneau de profil épinglé

// ---------------------------------------------------------------------------
// Helpers taxonomie
// ---------------------------------------------------------------------------

function findNode(nodes: TaxonomyNodeItem[], id: string): TaxonomyNodeItem | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found !== null) return found;
  }
  return null;
}

function buildColumns(tree: TaxonomyNodeItem[], selectedPath: string[]): TaxonomyNodeItem[][] {
  const columns: TaxonomyNodeItem[][] = [tree];
  let currentLevel = tree;
  for (const nodeId of selectedPath) {
    const node = currentLevel.find(n => n.id === nodeId);
    if (node == null) break;
    if (node.children.length > 0) columns.push(node.children);
    currentLevel = node.children;
  }
  return columns;
}

function columnHeading(nodes: TaxonomyNodeItem[]): string {
  if (nodes.length === 0) return "Items";
  const labels: Record<string, string> = {
    method: "Methods", procedure: "Procedures", category: "Categories",
    zone: "Zones", condition: "Conditions", section: "Sections", custom: "Items",
  };
  return labels[nodes[0].type] ?? "Items";
}

// ---------------------------------------------------------------------------
// AssistantPage
// ---------------------------------------------------------------------------

export function AssistantPage() {
  const standards    = useStandards();
  const activeStdId  = useAppStore(s => s.activeStandardId);
  const setActiveStd = useAppStore(s => s.setActiveStandard);
  const setMode      = useAppStore(s => s.setMode);

  const [selectedPath, setSelectedPath]       = useState<string[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [pinned, setPinned]                   = useState<Profile[]>([]);
  const [colWidths, setColWidths]             = useState<Record<number, number>>({});
  const [detailWidth, setDetailWidth]         = useState(460);

  const standard = useMemo(
    () => standards?.find(s => s.manifest.id === activeStdId) ?? null,
    [standards, activeStdId],
  );
  const allProfiles = useProfilesByStandard(activeStdId ?? "");

  const tree = useMemo(
    () => (standard != null ? buildTree(standard.nodes, allProfiles ?? []) : []),
    [standard, allProfiles],
  );
  const columns = useMemo(() => buildColumns(tree, selectedPath), [tree, selectedPath]);

  const selectedNode = useMemo((): TaxonomyNodeItem | null => {
    if (selectedPath.length === 0) return null;
    return findNode(tree, selectedPath[selectedPath.length - 1]!);
  }, [tree, selectedPath]);

  const nodeProfiles = useMemo((): Profile[] => {
    if (selectedNode == null || allProfiles == null) return [];
    return getProfilesForNode(selectedNode, allProfiles);
  }, [selectedNode, allProfiles]);

  const selectedProfile = useMemo(
    () => nodeProfiles.find(p => p.id === selectedProfileId) ?? null,
    [nodeProfiles, selectedProfileId],
  );

  // Résout le schéma d'un profil depuis SA norme (pas forcément l'active) :
  // indispensable pour comparer des profils épinglés de normes différentes.
  const schemaForProfile = useMemo(() => {
    const byId = new Map<string, StandardPlugin>((standards ?? []).map(s => [s.manifest.id, s]));
    return (profile: Profile) => {
      const std = byId.get(profile.standardId);
      return std ? getEffectiveSchema(std, profile.nodeId) : null;
    };
  }, [standards]);

  const columnsRef = useRef<HTMLDivElement>(null);
  const resizeAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => resizeAbortRef.current?.abort(), []);

  // Défile jusqu'à la dernière colonne quand la profondeur augmente.
  useEffect(() => {
    if (columnsRef.current) columnsRef.current.scrollLeft = columnsRef.current.scrollWidth;
  }, [columns.length]);

  // Changement de norme : on repart de zéro dans la navigation (mais on garde
  // les épingles, qui peuvent venir d'autres normes pour la comparaison).
  useEffect(() => {
    setSelectedPath([]);
    setSelectedProfileId(null);
    setColWidths({});
  }, [activeStdId]);

  function getColWidth(idx: number, def = 216): number {
    return colWidths[idx] ?? def;
  }

  // Un `mouseup` hors fenêtre ne se déclenche jamais : on ferme le geste via un
  // AbortController (mouseup, mouseleave, bouton relâché). Voir LibraryPage.
  function beginGesture(onMove: (ev: MouseEvent) => void): void {
    resizeAbortRef.current?.abort();
    const controller = new AbortController();
    resizeAbortRef.current = controller;
    const { signal } = controller;
    document.addEventListener("mousemove", (ev) => {
      if (ev.buttons === 0) { controller.abort(); return; }
      onMove(ev);
    }, { signal });
    document.addEventListener("mouseup", () => controller.abort(), { signal });
    document.addEventListener("mouseleave", () => controller.abort(), { signal });
  }

  function startColResize(e: React.MouseEvent, colIdx: number) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = getColWidth(colIdx);
    beginGesture((ev) => {
      setColWidths(prev => ({ ...prev, [colIdx]: Math.max(140, startW + ev.clientX - startX) }));
    });
  }

  function startSeparatorResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = detailWidth;
    beginGesture((ev) => {
      const maxDetail = Math.max(MIN_DETAIL, window.innerWidth - MIN_MILLER);
      const next = startW - (ev.clientX - startX); // le détail est à droite
      setDetailWidth(Math.min(maxDetail, Math.max(MIN_DETAIL, next)));
    });
  }

  function selectStandard(id: string) {
    setActiveStd(id);
    void saveActiveStandard(id);
  }

  function selectNode(colIdx: number, nodeId: string) {
    setSelectedPath(prev => [...prev.slice(0, colIdx), nodeId]);
    setSelectedProfileId(null);
  }

  function togglePin(profile: Profile) {
    setPinned(prev =>
      prev.some(p => p.id === profile.id)
        ? prev.filter(p => p.id !== profile.id)
        : [...prev, profile],
    );
  }
  const isPinned = (id: string) => pinned.some(p => p.id === id);

  if (standards === undefined) return <LoadingSpinner />;
  if (standards.length === 0) return <EmptyWorkspaceNotice />;

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* ── Header (léger : plus de sélecteur de norme, il est dans le Miller) ── */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3">
        <span className="text-xs font-bold text-gray-600 tracking-widest uppercase">MIL Browser</span>
        <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded font-semibold uppercase tracking-wide">
          Read-Only
        </span>
        {selectedNode != null && (
          <div className="flex flex-wrap items-center gap-1 text-xs text-gray-400 min-w-0 overflow-hidden">
            {selectedNode.path.map((label, i) => (
              <span key={i} className="flex items-center gap-1 whitespace-nowrap">
                {i > 0 && <span className="text-gray-300">›</span>}
                <span className={i === selectedNode.path.length - 1 ? "font-medium text-gray-600" : ""}>{label}</span>
              </span>
            ))}
          </div>
        )}
        <button
          onClick={() => setMode("admin")}
          className="ml-auto flex-shrink-0 text-xs font-medium text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
        >
          Manage ⚙
        </button>
      </header>

      {/* ── Corps ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* MILLER (flex, défile horizontalement) */}
        <div className="flex-1 min-w-0 overflow-hidden" style={{ minWidth: MIN_MILLER }}>
          <div ref={columnsRef} className="flex h-full overflow-x-auto overflow-y-hidden">
            {/* Colonne 0 : les normes */}
            <StandardsColumn
              standards={standards}
              activeId={activeStdId}
              onSelect={selectStandard}
              width={getColWidth(-1, 240)}
              onResizeStart={e => startColResize(e, -1)}
            />

            {standard != null && columns.map((colNodes, colIdx) => (
              <BrowserColumn
                key={colIdx}
                heading={columnHeading(colNodes)}
                nodes={colNodes}
                selectedNodeId={selectedPath[colIdx] ?? null}
                onSelect={nodeId => selectNode(colIdx, nodeId)}
                width={getColWidth(colIdx)}
                onResizeStart={e => startColResize(e, colIdx)}
              />
            ))}

            {standard != null && selectedNode != null && (
              <ProfilesColumn
                profiles={nodeProfiles}
                selectedProfileId={selectedProfileId}
                onSelectProfile={p => setSelectedProfileId(p.id)}
                onTogglePin={togglePin}
                isPinned={isPinned}
                width={getColWidth(100, 300)}
                onResizeStart={e => startColResize(e, 100)}
              />
            )}

            {standard == null && (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-400 px-8 text-center">
                Sélectionnez une norme dans la première colonne pour commencer.
              </div>
            )}
            <div className="flex-shrink-0 w-4" />
          </div>
        </div>

        {/* SÉPARATEUR — toujours accessible */}
        <div
          onMouseDown={startSeparatorResize}
          title="Redimensionner"
          className="flex-shrink-0 w-1.5 cursor-col-resize bg-gray-200 hover:bg-blue-400 transition-colors"
        />

        {/* ZONE DE DÉTAIL + ÉPINGLES */}
        <div className="flex-shrink-0 flex bg-white overflow-x-auto" style={{ width: detailWidth }}>
          <div className="flex-1 min-w-0 border-l border-gray-100" style={{ minWidth: MIN_DETAIL - 1 }}>
            <DetailPanel
              node={selectedNode}
              profile={selectedProfile}
              schema={selectedProfile ? schemaForProfile(selectedProfile) : null}
              pinned={selectedProfile ? isPinned(selectedProfile.id) : false}
              onTogglePin={togglePin}
              onClearProfile={() => setSelectedProfileId(null)}
            />
          </div>

          {pinned.map(p => (
            <PinnedPanel
              key={p.id}
              profile={p}
              schema={schemaForProfile(p)}
              standardLabel={standards.find(s => s.manifest.id === p.standardId)?.manifest.label ?? p.standardId}
              onUnpin={() => togglePin(p)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StandardsColumn — 1re colonne du Miller
// ---------------------------------------------------------------------------

function StandardsColumn({ standards, activeId, onSelect, width, onResizeStart }: {
  standards: StandardPlugin[];
  activeId: string | null;
  onSelect: (id: string) => void;
  width: number;
  onResizeStart: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="flex-shrink-0 flex flex-col border-r border-gray-200 bg-gray-50/60 relative" style={{ width }}>
      <div className="flex-shrink-0 px-3 py-2 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Standards</p>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {standards.map(s => {
          const selected = s.manifest.id === activeId;
          return (
            <button
              key={s.manifest.id}
              onClick={() => onSelect(s.manifest.id)}
              title={s.manifest.label}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                selected ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-white"
              }`}
            >
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium leading-snug truncate">{s.manifest.label}</span>
                <span className={`block text-xs ${selected ? "text-blue-200" : "text-gray-400"}`}>{s.manifest.organization}</span>
              </span>
              <svg className={`flex-shrink-0 w-3 h-3 ${selected ? "text-blue-200" : "text-gray-300"}`} viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
              </svg>
            </button>
          );
        })}
      </div>
      <div onMouseDown={onResizeStart} className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400 z-10" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// BrowserColumn — une colonne de nœuds
// ---------------------------------------------------------------------------

function BrowserColumn({ heading, nodes, selectedNodeId, onSelect, width, onResizeStart }: {
  heading: string;
  nodes: TaxonomyNodeItem[];
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
  width: number;
  onResizeStart: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="flex-shrink-0 flex flex-col border-r border-gray-200 bg-white relative" style={{ width }}>
      <div className="flex-shrink-0 px-3 py-2 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{heading}</p>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {nodes.length === 0 ? (
          <p className="text-xs text-gray-400 text-center px-3 py-6">No items</p>
        ) : (
          nodes.map(node => {
            const selected = node.id === selectedNodeId;
            return (
              <button
                key={node.id}
                onClick={() => onSelect(node.id)}
                title={node.label}
                className={`w-full text-left px-3 py-2 flex items-start gap-2 transition-colors ${
                  selected ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${
                  node.hasProfiles ? (selected ? "bg-blue-200" : "bg-blue-400") : "bg-transparent"
                }`} />
                <span className="flex-1 min-w-0">
                  <span className={`block text-xs font-mono leading-tight ${selected ? "text-blue-200" : "text-gray-400"}`}>{node.code}</span>
                  <span className="block text-sm leading-snug">{node.label}</span>
                </span>
                {node.children.length > 0 && (
                  <svg className={`flex-shrink-0 w-3 h-3 mt-1 ${selected ? "text-blue-200" : "text-gray-300"}`} viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
                  </svg>
                )}
              </button>
            );
          })
        )}
      </div>
      <div onMouseDown={onResizeStart} className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400 z-10" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProfilesColumn — colonne des profils du nœud, avec bouton d'épinglage
// ---------------------------------------------------------------------------

function ProfilesColumn({ profiles, selectedProfileId, onSelectProfile, onTogglePin, isPinned, width, onResizeStart }: {
  profiles: Profile[];
  selectedProfileId: string | null;
  onSelectProfile: (p: Profile) => void;
  onTogglePin: (p: Profile) => void;
  isPinned: (id: string) => boolean;
  width: number;
  onResizeStart: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="flex-shrink-0 flex flex-col border-r border-gray-200 bg-white relative" style={{ width }}>
      <div className="flex-shrink-0 px-3 py-2 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {profiles.length === 0 ? "Profiles" : `Profiles (${profiles.length})`}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {profiles.length === 0 ? (
          <p className="text-xs text-gray-400 text-center px-3 py-6 italic">No profiles on this node.</p>
        ) : (
          profiles.map(profile => {
            const selected = profile.id === selectedProfileId;
            const pinned = isPinned(profile.id);
            const s = profileStatusLabel(profile.status);
            return (
              <div
                key={profile.id}
                className={`px-3 py-2.5 border-b border-gray-50 group ${selected ? "bg-blue-50" : "hover:bg-blue-50/60"}`}
              >
                <div className="flex items-start gap-2">
                  <button onClick={() => onSelectProfile(profile)} className="flex-1 min-w-0 text-left">
                    <p className={`text-sm font-medium ${selected ? "text-blue-700" : "text-gray-900 group-hover:text-blue-700"}`}>{profile.name}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge variant={s.variant}>{s.label}</Badge>
                      <span className="text-xs text-gray-400">{profile.dataset.length} pts</span>
                    </div>
                  </button>
                  <button
                    onClick={() => onTogglePin(profile)}
                    title={pinned ? "Retirer de la comparaison" : "Épingler pour comparer"}
                    className={`flex-shrink-0 text-sm leading-none px-1.5 py-1 rounded transition-colors ${
                      pinned ? "text-blue-600 bg-blue-100" : "text-gray-300 hover:text-blue-600 hover:bg-blue-50"
                    }`}
                  >
                    📌
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div onMouseDown={onResizeStart} className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400 z-10" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// DetailPanel — nœud OU profil sélectionné
// ---------------------------------------------------------------------------

function DetailPanel({ node, profile, schema, pinned, onTogglePin, onClearProfile }: {
  node: TaxonomyNodeItem | null;
  profile: Profile | null;
  schema: React.ComponentProps<typeof ProfileDetail>["schema"] | null;
  pinned: boolean;
  onTogglePin: (p: Profile) => void;
  onClearProfile: () => void;
}) {
  if (profile !== null && schema !== null) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="px-5 pt-4 flex justify-end">
          <button
            onClick={() => onTogglePin(profile)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
              pinned
                ? "text-blue-700 bg-blue-50 border-blue-200"
                : "text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            📌 {pinned ? "Épinglé — comparer" : "Épingler pour comparer"}
          </button>
        </div>
        <div className="px-6 pb-6">
          <ProfileDetail profile={profile} schema={schema} onBack={onClearProfile} backLabel="Retour aux profils" />
        </div>
      </div>
    );
  }

  if (node === null) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-gray-400 text-center px-8 leading-relaxed">
          Sélectionnez un nœud pour voir son image d'aide à la décision et ses détails,
          ou un profil pour afficher sa carte.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto flex flex-col min-h-0">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="text-xs font-mono text-gray-400">{node.code}</span>
          <Badge variant="gray">{node.type}</Badge>
        </div>
        <h2 className="text-base font-semibold text-gray-900 leading-snug">{node.label}</h2>
      </div>

      {node.imageData !== undefined && (
        <div className="p-5 flex items-center justify-center bg-gray-50">
          <img src={node.imageData} alt={node.label} className="max-w-full max-h-[50vh] object-contain rounded-lg shadow-sm bg-white" />
        </div>
      )}

      {node.description !== undefined && (
        <div className="px-5 py-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Description</p>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{node.description}</p>
        </div>
      )}

      {node.imageData === undefined && node.description === undefined && (
        <div className="px-5 py-8 text-sm text-gray-400">
          Aucune image ni description attachée à ce nœud.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PinnedPanel — carte d'un profil épinglé (comparaison)
// ---------------------------------------------------------------------------

function PinnedPanel({ profile, schema, standardLabel, onUnpin }: {
  profile: Profile;
  schema: React.ComponentProps<typeof ProfileDetail>["schema"] | null;
  standardLabel: string;
  onUnpin: () => void;
}) {
  return (
    <div className="flex-shrink-0 border-l-2 border-blue-200 bg-white overflow-y-auto" style={{ width: PINNED_WIDTH }}>
      <div className="sticky top-0 z-10 px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider">Comparaison · {standardLabel}</p>
          <p className="text-sm font-bold text-gray-900 truncate">{profile.name}</p>
        </div>
        <button
          onClick={onUnpin}
          title="Retirer de la comparaison"
          className="flex-shrink-0 text-gray-400 hover:text-red-600 font-bold text-sm leading-none px-1"
        >
          ✕
        </button>
      </div>
      <div className="px-5 py-4">
        {schema !== null ? (
          <ProfileDetail profile={profile} schema={schema} />
        ) : (
          <p className="text-xs text-gray-400 italic">Schéma introuvable pour ce profil (sa norme n'est pas chargée).</p>
        )}
      </div>
    </div>
  );
}
