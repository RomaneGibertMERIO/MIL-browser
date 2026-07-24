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
import { getNodeImage } from "../../core/db/repositories/nodeImages.repo";
import { LoadingSpinner } from "../../shared/components/ui/LoadingSpinner";
import { EmptyWorkspaceNotice } from "../../shared/components/ui/EmptyWorkspaceNotice";
import { Badge } from "../../shared/components/ui/Badge";
import { Icon } from "../../shared/components/ui/Icon";
import { StatusDot } from "../../shared/components/ui/StatusBadge";
import { AppFrame, Brand } from "../../shared/components/AppFrame";
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
// Recherche — balaie TOUS les champs (nœuds ET profils)
// ---------------------------------------------------------------------------

function flattenNodes(nodes: TaxonomyNodeItem[]): TaxonomyNodeItem[] {
  const out: TaxonomyNodeItem[] = [];
  const walk = (ns: TaxonomyNodeItem[]) => { for (const n of ns) { out.push(n); walk(n.children); } };
  walk(nodes);
  return out;
}

/** Chemin d'ids de la racine jusqu'au nœud cible (pour naviguer depuis un résultat). */
function buildIdPath(tree: TaxonomyNodeItem[], targetId: string): string[] {
  const search = (ns: TaxonomyNodeItem[], path: string[]): string[] | null => {
    for (const n of ns) {
      const p = [...path, n.id];
      if (n.id === targetId) return p;
      const found = search(n.children, p);
      if (found !== null) return found;
    }
    return null;
  };
  return search(tree, []) ?? [];
}

/** Texte recherchable d'un nœud : label, code, description, tags, type. */
function nodeHaystack(n: TaxonomyNodeItem): string {
  return [n.label, n.code, n.description ?? "", (n.tags ?? []).join(" "), n.type].join(" ").toLowerCase();
}

/** Texte recherchable d'un profil : nom, description, auteur, statut, TOUS les
 *  champs et TOUTES les cellules du dataset (donc commentaires/notes compris). */
function profileHaystack(p: Profile): string {
  const parts: string[] = [p.name, p.description ?? "", p.author ?? "", p.status ?? ""];
  for (const v of Object.values(p.fields ?? {})) parts.push(String(v ?? ""));
  for (const row of p.dataset ?? []) for (const v of Object.values(row ?? {})) parts.push(String(v ?? ""));
  return parts.join(" ").toLowerCase();
}

// ---------------------------------------------------------------------------
// AssistantPage
// ---------------------------------------------------------------------------

export function AssistantPage() {
  const standards    = useStandards();
  const activeStdId  = useAppStore(s => s.activeStandardId);
  const setActiveStd = useAppStore(s => s.setActiveStandard);
  const setMode      = useAppStore(s => s.setMode);
  const repoMode     = useAppStore(s => s.repoMode);

  const [selectedPath, setSelectedPath]           = useState<string[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery]             = useState("");
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

  // Status roll-up per node: the "most local" status found in a node's subtree
  // profiles (local > pending > approved). Purely derived from data already
  // loaded — no engine change. Only shown in shared mode (sync state).
  const rollupByNode = useMemo(() => {
    const RANK: Record<string, number> = { local: 3, pending: 2, approved: 1 };
    const LABEL = ["", "approved", "pending", "local"];
    const profByNode = new Map<string, Profile[]>();
    for (const p of allProfiles ?? []) {
      const arr = profByNode.get(p.nodeId);
      if (arr) arr.push(p); else profByNode.set(p.nodeId, [p]);
    }
    const out = new Map<string, string>();
    const visit = (n: TaxonomyNodeItem): number => {
      let best = 0;
      for (const p of profByNode.get(n.id) ?? []) best = Math.max(best, RANK[p.status ?? "local"] ?? 0);
      for (const c of n.children) best = Math.max(best, visit(c));
      if (best > 0) out.set(n.id, LABEL[best]!);
      return best;
    };
    for (const r of tree) visit(r);
    return out;
  }, [tree, allProfiles]);
  const showStatus = repoMode === "shared";

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

  const searchActive = searchQuery.trim().length >= 2;
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return { nodes: [] as TaxonomyNodeItem[], profiles: [] as Profile[] };
    return {
      nodes: flattenNodes(tree).filter(n => nodeHaystack(n).includes(q)),
      profiles: (allProfiles ?? []).filter(p => profileHaystack(p).includes(q)),
    };
  }, [searchQuery, tree, allProfiles]);

  const millerRef = useRef<HTMLDivElement>(null);
  const resizeAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => resizeAbortRef.current?.abort(), []);

  useEffect(() => {
    if (millerRef.current) millerRef.current.scrollLeft = millerRef.current.scrollWidth;
  }, [columns.length]);

  useEffect(() => {
    setSelectedPath([]);
    setSelectedProfileId(null);
    setSearchQuery("");
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
  // Depuis un résultat de recherche : on navigue jusqu'au nœud (et au profil).
  function goToNode(nodeId: string) {
    setSelectedPath(buildIdPath(tree, nodeId));
    setSelectedProfileId(null);
    setSearchQuery("");
  }
  function goToProfile(p: Profile) {
    setSelectedPath(buildIdPath(tree, p.nodeId));
    setSelectedProfileId(p.id);
    setSearchQuery("");
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
    <AppFrame>
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3">
        <Brand />
        <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded font-semibold uppercase tracking-wide">
          Read-Only
        </span>
        {selectedNode != null && !searchActive && (
          <div className="flex flex-wrap items-center gap-1 text-xs text-gray-400 min-w-0 overflow-hidden">
            {selectedNode.path.map((label, i) => (
              <span key={i} className="flex items-center gap-1 whitespace-nowrap">
                {i > 0 && <span className="text-gray-300">›</span>}
                <span className={i === selectedNode.path.length - 1 ? "font-medium text-gray-600" : ""}>{label}</span>
              </span>
            ))}
          </div>
        )}

        {/* Search — scans every field of the active standard */}
        <div className="relative ml-auto min-w-[180px] max-w-xs flex-shrink-0">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <Icon name="search" size={14} />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search (all fields)…"
            className="w-full pl-8 pr-7 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery.length > 0 && (
            <button onClick={() => setSearchQuery("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
              <Icon name="close" size={14} />
            </button>
          )}
        </div>

        {/* Manage is available to everyone: read-only users still need it to
            reach Settings and set/verify the Git repository path. The internal
            role gate then restricts read-only to the Settings view only. */}
        <button
          onClick={() => setMode("admin")}
          className="flex-shrink-0 flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
        >
          <Icon name="settings" size={14} /> Manage
        </button>
      </header>

      {/* ── Résultats de recherche (remplacent le browser) ─────────────── */}
      {searchActive ? (
        <SearchResultsView
          results={searchResults}
          query={searchQuery.trim()}
          onNode={goToNode}
          onProfile={goToProfile}
          onTogglePin={togglePin}
          isPinned={isPinned}
        />
      ) : (
      /* ── Corps ──────────────────────────────────────────────────────── */
      <div className="flex flex-1 overflow-hidden">

        {/* MILLER — normes + nœuds + PROFILS, colonnes à largeur égale */}
        <div className="flex-1 min-w-0" style={{ minWidth: MIN_MILLER }}>
          <div ref={millerRef} className="flex h-full overflow-x-auto overflow-y-hidden">
            <MillerColumn heading="Standards">
              {standards.map(s => (
                <StandardRow
                  key={s.manifest.id}
                  standard={s}
                  selected={s.manifest.id === activeStdId}
                  onSelect={() => selectStandard(s.manifest.id)}
                  statusDot={showStatus ? <StatusDot status={(s as any).status} /> : null}
                />
              ))}
            </MillerColumn>

            {standard != null && columns.map((colNodes, colIdx) => (
              <MillerColumn key={colIdx} heading={columnHeading(colNodes)}>
                {colNodes.length === 0
                  ? <p className="text-xs text-gray-400 text-center px-3 py-6">No items</p>
                  : colNodes.map(node => {
                    // Node dot only when the branch holds non-official work (local/pending).
                    const r = rollupByNode.get(node.id);
                    const dot = showStatus && (r === "local" || r === "pending") ? <StatusDot status={r} /> : null;
                    return (
                      <NodeRow key={node.id} node={node} selected={node.id === (selectedPath[colIdx] ?? null)} onSelect={() => selectNode(colIdx, node.id)} statusDot={dot} />
                    );
                  })}
              </MillerColumn>
            ))}

            {/* Colonne des profils du nœud sélectionné — DANS le Miller */}
            {standard != null && selectedNode != null && (
              <MillerColumn heading={`Profiles${nodeProfiles.length ? ` (${nodeProfiles.length})` : ""}`}>
                {nodeProfiles.length === 0
                  ? <p className="text-xs text-gray-400 text-center px-3 py-6 italic">No profiles on this node.</p>
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
                Select a standard in the first column to begin.
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
      )}
    </div>
    </AppFrame>
  );
}

// ---------------------------------------------------------------------------
// Vue des résultats de recherche
// ---------------------------------------------------------------------------

function SearchResultsView({ results, query, onNode, onProfile, onTogglePin, isPinned }: {
  results: { nodes: TaxonomyNodeItem[]; profiles: Profile[] };
  query: string;
  onNode: (nodeId: string) => void;
  onProfile: (p: Profile) => void;
  onTogglePin: (p: Profile) => void;
  isPinned: (id: string) => boolean;
}) {
  const total = results.nodes.length + results.profiles.length;
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
        {total} result{total !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
      </p>

      {total === 0 && (
        <p className="text-sm text-gray-400 text-center py-12">
          No match in the active standard. Search scans labels, codes, descriptions and
          tags, as well as profile name, author, every field and every dataset cell.
        </p>
      )}

      {results.nodes.length > 0 && (
        <section className="mb-8 max-w-3xl">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nodes ({results.nodes.length})</h3>
          <div className="space-y-1.5">
            {results.nodes.map(node => (
              <button key={node.id} onClick={() => onNode(node.id)}
                className="w-full text-left bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-blue-300 hover:shadow-sm transition-all group">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="font-medium text-sm text-gray-900 group-hover:text-blue-700">{node.label}</span>
                  <span className="text-xs font-mono text-gray-400">{node.code}</span>
                  <Badge variant="gray">{node.type}</Badge>
                </div>
                <p className="text-xs text-gray-400">{node.path.join(" › ")}</p>
                {node.description !== undefined && (
                  <p className="text-xs text-gray-500 mt-1 line-clamp-1">{node.description}</p>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {results.profiles.length > 0 && (
        <section className="max-w-3xl">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Profiles ({results.profiles.length})</h3>
          <div className="space-y-1.5">
            {results.profiles.map(p => {
              const s = profileStatusLabel(p.status);
              const pinned = isPinned(p.id);
              return (
                <div key={p.id} className="flex items-stretch gap-2 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all">
                  <button onClick={() => onProfile(p)} className="flex-1 min-w-0 text-left px-4 py-3 group">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-medium text-sm text-gray-900 group-hover:text-blue-700">{p.name}</span>
                      <Badge variant={s.variant}>{s.label}</Badge>
                      <span className="text-xs text-gray-400">{p.dataset.length} pts</span>
                    </div>
                    {p.description !== "" && <p className="text-xs text-gray-500 line-clamp-1">{p.description}</p>}
                    {p.author && p.author !== "unknown" && <p className="text-[11px] text-gray-400 italic mt-0.5">by {p.author}</p>}
                  </button>
                  <button onClick={() => onTogglePin(p)} title={pinned ? "Remove from comparison" : "Pin to compare"}
                    className={`flex-shrink-0 flex items-center px-3 border-l border-gray-100 transition-colors ${pinned ? "text-blue-600 bg-blue-50" : "text-gray-300 hover:text-blue-600 hover:bg-blue-50"}`}>
                    <Icon name="pin" size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Colonnes du Miller — flex-1 (largeur égale) + min-width
// ---------------------------------------------------------------------------

// The Miller (navigation structure) is deliberately greyed vs the white info/
// profile area on the right, so "structure" reads as secondary and "content" as
// primary (spec section 6).
function MillerColumn({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col border-r border-gray-200 bg-gray-50/50" style={{ minWidth: COL_MIN }}>
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

function StandardRow({ standard, selected, onSelect, statusDot }: { standard: StandardPlugin; selected: boolean; onSelect: () => void; statusDot?: React.ReactNode }) {
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

function NodeRow({ node, selected, onSelect, statusDot }: { node: TaxonomyNodeItem; selected: boolean; onSelect: () => void; statusDot?: React.ReactNode }) {
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
        <button onClick={onTogglePin} title={pinned ? "Remove from comparison" : "Pin to compare"}
          className={`flex-shrink-0 px-1.5 py-1 rounded transition-colors ${pinned ? "text-blue-600 bg-blue-100" : "text-gray-300 hover:text-blue-600 hover:bg-blue-50"}`}>
          <Icon name="pin" size={14} />
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

/** Charge à la demande l'image d'un nœud depuis db.nodeImages (phase 8). */
function useNodeImage(standardId: string | undefined, nodeId: string | undefined): string | null {
  const key = standardId && nodeId ? `${standardId} ${nodeId}` : "";
  const [state, setState] = useState<{ key: string; img: string | null }>({ key: "", img: null });
  useEffect(() => {
    let cancelled = false;
    if (key === "") { setState({ key: "", img: null }); return; }
    void getNodeImage(standardId!, nodeId!).then((d) => { if (!cancelled) setState({ key, img: d }); });
    return () => { cancelled = true; };
  }, [key, standardId, nodeId]);
  // Ne renvoie l'image QUE si elle correspond au nœud courant : évite d'afficher
  // l'image du nœud précédent (ou d'une autre norme) pendant le chargement async.
  return state.key === key ? state.img : null;
}

function DetailBody({ node, profile, schema, pinned, onTogglePin, onClearProfile }: {
  node: TaxonomyNodeItem | null;
  profile: Profile | null;
  schema: React.ComponentProps<typeof ProfileDetail>["schema"] | null;
  pinned: boolean;
  onTogglePin: (p: Profile) => void;
  onClearProfile: () => void;
}) {
  // Phase 8 : les images de nœuds (téléversées) vivent dans db.nodeImages ; on
  // les charge à la demande. Les builtin gardent un chemin inline dans imageData.
  const externalImage = useNodeImage(node?.standardId, node?.id);
  if (profile !== null && schema !== null) {
    return (
      <div>
        <div className="px-5 pt-4 flex justify-end">
          <button onClick={() => onTogglePin(profile)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${pinned ? "text-blue-700 bg-blue-50 border-blue-200" : "text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
            <span className="inline-flex items-center gap-1.5"><Icon name="pin" size={13} /> {pinned ? "Pinned" : "Pin to compare"}</span>
          </button>
        </div>
        <div className="px-6 pb-6">
          <ProfileDetail profile={profile} schema={schema} onBack={onClearProfile} backLabel="Back to profiles" />
        </div>
      </div>
    );
  }

  if (node === null) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-gray-400 text-center px-8 leading-relaxed">
          Select a node for its details, or a profile for its card.
        </p>
      </div>
    );
  }

  const nodeImage = node.imageData ?? externalImage;

  return (
    <div className="flex flex-col min-h-0">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="text-xs font-mono text-gray-400">{node.code}</span>
          <Badge variant="gray">{node.type}</Badge>
        </div>
        <h2 className="text-base font-semibold text-gray-900 leading-snug">{node.label}</h2>
      </div>
      {nodeImage !== null && (
        <div className="p-5 flex items-center justify-center bg-gray-50">
          <img src={nodeImage} alt={node.label} className="max-w-full max-h-[50vh] object-contain rounded-lg shadow-sm bg-white" />
        </div>
      )}
      {node.description !== undefined && (
        <div className="px-5 py-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Description</p>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{node.description}</p>
        </div>
      )}
      {nodeImage === null && node.description === undefined && (
        <div className="px-5 py-8 text-sm text-gray-400">No image or description attached to this node.</div>
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
          <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider truncate">Comparison · {standardLabel}</p>
          <p className="text-sm font-bold text-gray-900 truncate">{profile.name}</p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-1">
          <button onClick={onCollapse} title="Collapse" aria-label="Collapse" className="text-gray-400 hover:text-gray-700 px-1"><Icon name="collapse" size={14} /></button>
          <button onClick={onUnpin} title="Remove" aria-label="Remove" className="text-gray-400 hover:text-red-600 px-1"><Icon name="close" size={14} /></button>
        </div>
      </div>
      <div className="px-5 py-4">
        {schema !== null
          ? <ProfileDetail profile={profile} schema={schema} />
          : <p className="text-xs text-gray-400 italic">Schema not found (standard not loaded).</p>}
      </div>
    </div>
  );
}

function CollapsedPin({ name, onExpand, onUnpin }: { name: string; onExpand: () => void; onUnpin: () => void }) {
  return (
    <div className="flex-shrink-0 flex flex-col items-center border-l-2 border-blue-200 bg-blue-50/50" style={{ width: COLLAPSED_W }}>
      <button onClick={onExpand} title="Expand" aria-label="Expand" className="mt-2 text-gray-500 hover:text-blue-600"><Icon name="chevronRight" size={14} /></button>
      <button onClick={onExpand} title={name} className="flex-1 text-[11px] font-semibold text-gray-500 hover:text-blue-600 py-2" style={{ writingMode: "vertical-rl" }}>
        {name}
      </button>
      <button onClick={onUnpin} title="Remove" aria-label="Remove" className="mb-2 text-gray-400 hover:text-red-600"><Icon name="close" size={13} /></button>
    </div>
  );
}
