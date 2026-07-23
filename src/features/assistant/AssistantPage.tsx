/**
 * Standards Browser — navigation Miller Columns (façon Finder).
 *
 * LECTURE SEULE. L'édition se fait dans l'espace de gestion (sidebar).
 *
 * Disposition
 * ───────────
 *   ┌─ MILLER (gauche) ───────────────────────┬─slider─┬─ INFOS + ÉPINGLES ─┐
 *   │ [Normes][Méthodes][Zones][Profils]       │        │ [Informations][pin]│
 *   └──────────────────────────────────────────┴────────┴──────────────────────┘
 *
 * Dimensionnement (voulu) :
 * - MILLER (normes + nœuds + PROFILS) : aucune poignée par colonne. Toutes les
 *   colonnes ont la même largeur, pilotée par la largeur globale du Miller.
 * - Un SEUL slider collectif déplace la frontière Miller / zone droite.
 * - ZONE DROITE (informations + épingles) : largeur égale par défaut. On
 *   redistribue la largeur ENTRE panneaux via des séparateurs (le total reste
 *   constant, pas de débordement). Chaque épingle peut aussi être repliée ou
 *   retirée.
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

const MIN_MILLER = 320;
const MIN_RIGHT = 340;
const COL_MIN = 130;      // largeur mini d'une colonne du Miller
const PANEL_MIN = 260;    // largeur mini d'un panneau de la zone droite
const COLLAPSED_W = 40;   // largeur d'une épingle repliée
const SPLITTER_W = 6;     // largeur d'un séparateur interne de la zone droite

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

  const [selectedPath, setSelectedPath]           = useState<string[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [pinned, setPinned]                       = useState<Profile[]>([]);
  const [collapsedPins, setCollapsedPins]         = useState<Set<string>>(new Set());
  const [rightWidth, setRightWidth]               = useState(520);
  // Poids relatifs des panneaux de la zone droite ("info" + id des épingles).
  // Absent = 1 (largeur égale). On redistribue, donc le total reste constant.
  const [weights, setWeights]                     = useState<Record<string, number>>({});

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

  const schemaForProfile = useMemo(() => {
    const byId = new Map<string, StandardPlugin>((standards ?? []).map(s => [s.manifest.id, s]));
    return (profile: Profile) => {
      const std = byId.get(profile.standardId);
      return std ? getEffectiveSchema(std, profile.nodeId) : null;
    };
  }, [standards]);

  const millerRef = useRef<HTMLDivElement>(null);
  const resizeAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => resizeAbortRef.current?.abort(), []);

  useEffect(() => {
    if (millerRef.current) millerRef.current.scrollLeft = millerRef.current.scrollWidth;
  }, [columns.length]);

  useEffect(() => {
    setSelectedPath([]);
    setSelectedProfileId(null);
  }, [activeStdId]);

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

  // Slider collectif : frontière Miller / zone droite.
  function startCollectiveResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = rightWidth;
    beginGesture((ev) => {
      const maxRight = Math.max(MIN_RIGHT, window.innerWidth - MIN_MILLER);
      const next = startW - (ev.clientX - startX);
      setRightWidth(Math.min(maxRight, Math.max(MIN_RIGHT, next)));
    });
  }

  const weightOf = (id: string) => weights[id] ?? 1;

  // Séparateur interne : redistribue la largeur entre deux panneaux adjacents.
  // Le total (rightWidth) ne change pas : on ne fait que déplacer du poids.
  function startPanelResize(e: React.MouseEvent, leftId: string, rightId: string, expandedIds: string[]) {
    e.preventDefault();
    const startX = e.clientX;
    const collapsedCount = pinned.length - (expandedIds.length - 1); // -1 : "info" n'est pas une épingle
    const available = rightWidth - collapsedCount * COLLAPSED_W - (expandedIds.length - 1) * SPLITTER_W;
    const totalWeight = expandedIds.reduce((sum, id) => sum + weightOf(id), 0);
    const pxPerWeight = available > 0 && totalWeight > 0 ? available / totalWeight : 1;
    const minWeight = PANEL_MIN / pxPerWeight;
    const wL0 = weightOf(leftId);
    const wR0 = weightOf(rightId);

    beginGesture((ev) => {
      const dW = (ev.clientX - startX) / pxPerWeight;
      let wL = wL0 + dW;
      wL = Math.max(minWeight, Math.min(wL0 + wR0 - minWeight, wL));
      const wR = wL0 + wR0 - wL;
      setWeights(prev => ({ ...prev, [leftId]: wL, [rightId]: wR }));
    });
  }

  function selectStandard(id: string) { setActiveStd(id); void saveActiveStandard(id); }
  function selectNode(colIdx: number, nodeId: string) {
    setSelectedPath(prev => [...prev.slice(0, colIdx), nodeId]);
    setSelectedProfileId(null);
  }
  function togglePin(profile: Profile) {
    setPinned(prev => prev.some(p => p.id === profile.id)
      ? prev.filter(p => p.id !== profile.id)
      : [...prev, profile]);
  }
  const isPinned = (id: string) => pinned.some(p => p.id === id);
  function toggleCollapse(pinId: string) {
    setCollapsedPins(prev => {
      const next = new Set(prev);
      if (next.has(pinId)) next.delete(pinId); else next.add(pinId);
      return next;
    });
  }

  if (standards === undefined) return <LoadingSpinner />;
  if (standards.length === 0) return <EmptyWorkspaceNotice />;

  // Panneaux étendus de la zone droite, dans l'ordre : Informations puis épingles.
  const expandedPins = pinned.filter(p => !collapsedPins.has(p.id));
  const expandedIds = ["info", ...expandedPins.map(p => p.id)];

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────── */}
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

      {/* ── Corps ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* MILLER — normes + nœuds + PROFILS, colonnes à largeur égale */}
        <div className="flex-1 min-w-0" style={{ minWidth: MIN_MILLER }}>
          <div ref={millerRef} className="flex h-full overflow-x-auto overflow-y-hidden">
            <MillerColumn heading="Standards" tone="std">
              {standards.map(s => (
                <StandardRow key={s.manifest.id} standard={s} selected={s.manifest.id === activeStdId} onSelect={() => selectStandard(s.manifest.id)} />
              ))}
            </MillerColumn>

            {standard != null && columns.map((colNodes, colIdx) => (
              <MillerColumn key={colIdx} heading={columnHeading(colNodes)}>
                {colNodes.length === 0
                  ? <p className="text-xs text-gray-400 text-center px-3 py-6">No items</p>
                  : colNodes.map(node => (
                    <NodeRow key={node.id} node={node} selected={node.id === (selectedPath[colIdx] ?? null)} onSelect={() => selectNode(colIdx, node.id)} />
                  ))}
              </MillerColumn>
            ))}

            {/* Colonne des profils du nœud sélectionné — DANS le Miller */}
            {standard != null && selectedNode != null && (
              <MillerColumn heading={`Profils${nodeProfiles.length ? ` (${nodeProfiles.length})` : ""}`}>
                {nodeProfiles.length === 0
                  ? <p className="text-xs text-gray-400 text-center px-3 py-6 italic">Aucun profil sur ce nœud.</p>
                  : nodeProfiles.map(p => (
                    <ProfileRow
                      key={p.id}
                      profile={p}
                      selected={p.id === selectedProfileId}
                      pinned={isPinned(p.id)}
                      onSelect={() => setSelectedProfileId(p.id)}
                      onTogglePin={() => togglePin(p)}
                    />
                  ))}
              </MillerColumn>
            )}

            {standard == null && (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-400 px-8 text-center">
                Sélectionnez une norme dans la première colonne pour commencer.
              </div>
            )}
          </div>
        </div>

        {/* SLIDER COLLECTIF */}
        <div
          onMouseDown={startCollectiveResize}
          title="Redimensionner Miller / informations"
          className="flex-shrink-0 w-1.5 cursor-col-resize bg-gray-200 hover:bg-blue-400 transition-colors"
        />

        {/* ZONE DROITE — informations + épingles (redistribution par séparateurs) */}
        <div className="flex-shrink-0 flex bg-white overflow-hidden" style={{ width: rightWidth }}>
          {/* Informations */}
          <WeightedPanel weight={weightOf("info")}>
            <PanelHeader>Informations</PanelHeader>
            <div className="flex-1 overflow-y-auto">
              <DetailBody
                node={selectedNode}
                profile={selectedProfile}
                schema={selectedProfile ? schemaForProfile(selectedProfile) : null}
                pinned={selectedProfile ? isPinned(selectedProfile.id) : false}
                onTogglePin={togglePin}
                onClearProfile={() => setSelectedProfileId(null)}
              />
            </div>
          </WeightedPanel>

          {/* Épingles étendues (avec séparateur redistributeur avant chacune) */}
          {expandedPins.map((p, i) => {
            const prevId = expandedIds[i]; // panneau étendu précédent (info ou épingle)
            return (
              <React.Fragment key={p.id}>
                <div
                  onMouseDown={e => startPanelResize(e, prevId!, p.id, expandedIds)}
                  className="flex-shrink-0 cursor-col-resize bg-gray-100 hover:bg-blue-400 transition-colors"
                  style={{ width: SPLITTER_W }}
                />
                <WeightedPanel weight={weightOf(p.id)}>
                  <PinnedPanel
                    profile={p}
                    schema={schemaForProfile(p)}
                    standardLabel={standards.find(s => s.manifest.id === p.standardId)?.manifest.label ?? p.standardId}
                    onCollapse={() => toggleCollapse(p.id)}
                    onUnpin={() => togglePin(p)}
                  />
                </WeightedPanel>
              </React.Fragment>
            );
          })}

          {/* Épingles repliées : fine barre en bout de zone */}
          {pinned.filter(p => collapsedPins.has(p.id)).map(p => (
            <CollapsedPin key={p.id} name={p.name} onExpand={() => toggleCollapse(p.id)} onUnpin={() => togglePin(p)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Colonnes du Miller — flex-1 (largeur égale) + min-width
// ---------------------------------------------------------------------------

function MillerColumn({ heading, tone, children }: { heading: string; tone?: "std"; children: React.ReactNode }) {
  return (
    <div className={`flex-1 flex flex-col border-r border-gray-200 ${tone === "std" ? "bg-gray-50/60" : "bg-white"}`} style={{ minWidth: COL_MIN }}>
      <PanelHeader>{heading}</PanelHeader>
      <div className="flex-1 overflow-y-auto py-1">{children}</div>
    </div>
  );
}

function PanelHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-shrink-0 px-3 py-2 border-b border-gray-100">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{children}</p>
    </div>
  );
}

function StandardRow({ standard, selected, onSelect }: { standard: StandardPlugin; selected: boolean; onSelect: () => void }) {
  return (
    <button onClick={onSelect} title={standard.manifest.label}
      className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${selected ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-white"}`}>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium leading-snug truncate">{standard.manifest.label}</span>
        <span className={`block text-xs truncate ${selected ? "text-blue-200" : "text-gray-400"}`}>{standard.manifest.organization}</span>
      </span>
      <Chevron selected={selected} />
    </button>
  );
}

function NodeRow({ node, selected, onSelect }: { node: TaxonomyNodeItem; selected: boolean; onSelect: () => void }) {
  return (
    <button onClick={onSelect} title={node.label}
      className={`w-full text-left px-3 py-2 flex items-start gap-2 transition-colors ${selected ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50"}`}>
      <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${node.hasProfiles ? (selected ? "bg-blue-200" : "bg-blue-400") : "bg-transparent"}`} />
      <span className="flex-1 min-w-0">
        <span className={`block text-xs font-mono leading-tight ${selected ? "text-blue-200" : "text-gray-400"}`}>{node.code}</span>
        <span className="block text-sm leading-snug">{node.label}</span>
      </span>
      {node.children.length > 0 && <Chevron selected={selected} />}
    </button>
  );
}

function ProfileRow({ profile, selected, pinned, onSelect, onTogglePin }: {
  profile: Profile; selected: boolean; pinned: boolean; onSelect: () => void; onTogglePin: () => void;
}) {
  const s = profileStatusLabel(profile.status);
  return (
    <div className={`px-3 py-2.5 border-b border-gray-50 group ${selected ? "bg-blue-50" : "hover:bg-blue-50/60"}`}>
      <div className="flex items-start gap-2">
        <button onClick={onSelect} className="flex-1 min-w-0 text-left">
          <p className={`text-sm font-medium ${selected ? "text-blue-700" : "text-gray-900 group-hover:text-blue-700"}`}>{profile.name}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <Badge variant={s.variant}>{s.label}</Badge>
            <span className="text-xs text-gray-400">{profile.dataset.length} pts</span>
          </div>
        </button>
        <button onClick={onTogglePin} title={pinned ? "Retirer de la comparaison" : "Épingler pour comparer"}
          className={`flex-shrink-0 text-sm leading-none px-1.5 py-1 rounded transition-colors ${pinned ? "text-blue-600 bg-blue-100" : "text-gray-300 hover:text-blue-600 hover:bg-blue-50"}`}>
          📌
        </button>
      </div>
    </div>
  );
}

function Chevron({ selected }: { selected: boolean }) {
  return (
    <svg className={`flex-shrink-0 w-3 h-3 mt-1 ${selected ? "text-blue-200" : "text-gray-300"}`} viewBox="0 0 16 16" fill="currentColor">
      <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Zone droite
// ---------------------------------------------------------------------------

/** Panneau à poids (flex-grow) : largeur = weight / somme des poids. */
function WeightedPanel({ weight, children }: { weight: number; children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-w-0 overflow-hidden" style={{ flexGrow: weight, flexBasis: 0, minWidth: PANEL_MIN }}>
      {children}
    </div>
  );
}

function DetailBody({ node, profile, schema, pinned, onTogglePin, onClearProfile }: {
  node: TaxonomyNodeItem | null;
  profile: Profile | null;
  schema: React.ComponentProps<typeof ProfileDetail>["schema"] | null;
  pinned: boolean;
  onTogglePin: (p: Profile) => void;
  onClearProfile: () => void;
}) {
  if (profile !== null && schema !== null) {
    return (
      <div>
        <div className="px-5 pt-4 flex justify-end">
          <button onClick={() => onTogglePin(profile)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${pinned ? "text-blue-700 bg-blue-50 border-blue-200" : "text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
            📌 {pinned ? "Épinglé" : "Épingler pour comparer"}
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
          Sélectionnez un nœud pour ses détails, ou un profil pour sa carte.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0">
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
        <div className="px-5 py-8 text-sm text-gray-400">Aucune image ni description attachée à ce nœud.</div>
      )}
    </div>
  );
}

function PinnedPanel({ profile, schema, standardLabel, onCollapse, onUnpin }: {
  profile: Profile;
  schema: React.ComponentProps<typeof ProfileDetail>["schema"] | null;
  standardLabel: string;
  onCollapse: () => void;
  onUnpin: () => void;
}) {
  return (
    <div className="h-full border-l-2 border-blue-200 bg-white overflow-y-auto">
      <div className="sticky top-0 z-10 px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider truncate">Comparaison · {standardLabel}</p>
          <p className="text-sm font-bold text-gray-900 truncate">{profile.name}</p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-1">
          <button onClick={onCollapse} title="Replier" className="text-gray-400 hover:text-gray-700 text-sm px-1">–</button>
          <button onClick={onUnpin} title="Retirer" className="text-gray-400 hover:text-red-600 font-bold text-sm px-1">✕</button>
        </div>
      </div>
      <div className="px-5 py-4">
        {schema !== null
          ? <ProfileDetail profile={profile} schema={schema} />
          : <p className="text-xs text-gray-400 italic">Schéma introuvable (norme non chargée).</p>}
      </div>
    </div>
  );
}

function CollapsedPin({ name, onExpand, onUnpin }: { name: string; onExpand: () => void; onUnpin: () => void }) {
  return (
    <div className="flex-shrink-0 flex flex-col items-center border-l-2 border-blue-200 bg-blue-50/50" style={{ width: COLLAPSED_W }}>
      <button onClick={onExpand} title="Déplier" className="mt-2 text-gray-500 hover:text-blue-600 text-sm">▸</button>
      <button onClick={onExpand} title={name} className="flex-1 text-[11px] font-semibold text-gray-500 hover:text-blue-600 py-2" style={{ writingMode: "vertical-rl" }}>
        {name}
      </button>
      <button onClick={onUnpin} title="Retirer" className="mb-2 text-gray-400 hover:text-red-600 text-xs">✕</button>
    </div>
  );
}
