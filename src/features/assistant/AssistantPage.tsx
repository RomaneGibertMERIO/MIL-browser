/**
 * Standards Browser — progressive column navigation.
 *
 * READ-ONLY. No editing controls are present on this screen.
 * Use the Management workspace (sidebar → Library / Standards) to edit content.
 *
 * Layout
 * ──────
 *   ┌─ Header: standard selector · search · path · Manage button ─────┐
 *   │ Col 0 │ Col 1 │ Col N │              Detail Panel               │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Selecting a node at column k reveals column k+1 with the node's children
 * and shows node info (title, description, image, profiles) in the detail panel.
 * The full path breadcrumb is always visible in the header.
 * Typing in the search box replaces columns with a flat results list.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import type { Profile } from "../../core/domain/profile";
import type { TaxonomyNodeItem } from "../../core/domain/tree";
import { buildTree, getProfilesForNode } from "../../core/engine/treeBuilder";
import { useStandards } from "../../shared/hooks/useStandards";
import { useProfilesByStandard } from "../../shared/hooks/useProfiles";
import { useAppStore } from "../../store/appStore";
import { saveActiveStandard } from "../../core/db/repositories/settings.repo";
import { LoadingSpinner } from "../../shared/components/ui/LoadingSpinner";
import { Badge } from "../../shared/components/ui/Badge";
import { ProfileDetail } from "../profile/ProfileDetail";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findNode(nodes: TaxonomyNodeItem[], id: string): TaxonomyNodeItem | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found !== null) return found;
  }
  return null;
}

function buildIdPath(tree: TaxonomyNodeItem[], targetId: string): string[] {
  function search(nodes: TaxonomyNodeItem[], path: string[]): string[] | null {
    for (const n of nodes) {
      const p = [...path, n.id];
      if (n.id === targetId) return p;
      const found = search(n.children, p);
      if (found !== null) return found;
    }
    return null;
  }
  return search(tree, []) ?? [];
}

function buildColumns(
  tree: TaxonomyNodeItem[],
  selectedPath: string[],
): TaxonomyNodeItem[][] {
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

function searchNodes(tree: TaxonomyNodeItem[], query: string): TaxonomyNodeItem[] {
  const q = query.toLowerCase();
  const results: TaxonomyNodeItem[] = [];
  function traverse(nodes: TaxonomyNodeItem[]) {
    for (const n of nodes) {
      if (
        n.label.toLowerCase().includes(q) ||
        n.code.toLowerCase().includes(q) ||
        (n.description?.toLowerCase().includes(q) ?? false)
      ) {
        results.push(n);
      }
      traverse(n.children);
    }
  }
  traverse(tree);
  return results;
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
  const standards   = useStandards();
  const activeStdId = useAppStore(s => s.activeStandardId);
  const setActiveStd = useAppStore(s => s.setActiveStandard);
  const setMode     = useAppStore(s => s.setMode);

  const [selectedPath, setSelectedPath]     = useState<string[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [searchQuery, setSearchQuery]       = useState("");

  const standard = useMemo(
    () => standards?.find(s => s.manifest.id === activeStdId) ?? null,
    [standards, activeStdId],
  );
  const allProfiles = useProfilesByStandard(activeStdId ?? "");

  const tree = useMemo(
    () => (standard != null ? buildTree(standard.nodes, allProfiles ?? []) : []),
    [standard, allProfiles],
  );
  const columns   = useMemo(() => buildColumns(tree, selectedPath), [tree, selectedPath]);
  const selectedNode = useMemo((): TaxonomyNodeItem | null => {
    if (selectedPath.length === 0) return null;
    return findNode(tree, selectedPath[selectedPath.length - 1]!);
  }, [tree, selectedPath]);
  const nodeProfiles = useMemo((): Profile[] => {
    if (selectedNode == null || allProfiles == null) return [];
    return getProfilesForNode(selectedNode, allProfiles);
  }, [selectedNode, allProfiles]);
  const searchResults = useMemo((): TaxonomyNodeItem[] => {
    if (searchQuery.trim().length < 2) return [];
    return searchNodes(tree, searchQuery.trim());
  }, [tree, searchQuery]);

  const columnsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (columnsRef.current) {
      columnsRef.current.scrollLeft = columnsRef.current.scrollWidth;
    }
  }, [columns.length]);

  useEffect(() => {
    setSelectedPath([]);
    setSelectedProfile(null);
  }, [activeStdId]);

  function handleStandardChange(id: string) {
    setActiveStd(id);
    void saveActiveStandard(id);
  }

  function handleNodeSelect(colIdx: number, nodeId: string) {
    setSelectedPath(prev => [...prev.slice(0, colIdx), nodeId]);
    setSelectedProfile(null);
  }

  function handleSearchResultSelect(node: TaxonomyNodeItem) {
    setSelectedPath(buildIdPath(tree, node.id));
    setSearchQuery("");
    setSelectedProfile(null);
  }

  if (standards === undefined) return <LoadingSpinner />;

  // Profile detail full-page overlay
  if (selectedProfile !== null && standard !== null) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-5 py-2.5 flex items-center gap-3">
          <span className="text-xs font-bold text-gray-600 tracking-widest uppercase">MIL Browser</span>
          <span className="text-gray-200 select-none">|</span>
          <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded font-semibold uppercase tracking-wide">Browse</span>
          <button
            onClick={() => setSelectedProfile(null)}
            className="ml-auto flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z" />
            </svg>
            Back to browser
          </button>
        </div>
        <div className="max-w-4xl mx-auto px-6 py-6">
          <ProfileDetail
            profile={selectedProfile}
            schema={standard.profileSchema}
            onBack={() => setSelectedProfile(null)}
            backLabel="Back to browser"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold text-gray-600 tracking-widest uppercase mr-1">MIL Browser</span>
        <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded font-semibold uppercase tracking-wide flex-shrink-0">
          Read-Only
        </span>

        <select
          value={activeStdId ?? ""}
          onChange={e => handleStandardChange(e.target.value)}
          className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-md bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px] flex-shrink-0"
        >
          <option value="" disabled>— Select standard —</option>
          {(standards ?? []).map(s => (
            <option key={s.manifest.id} value={s.manifest.id}>{s.manifest.label}</option>
          ))}
        </select>

        <div className="relative min-w-[160px] max-w-xs flex-1">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.099zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search nodes…"
            className="w-full pl-8 pr-7 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery.length > 0 && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-sm">✕</button>
          )}
        </div>

        {selectedPath.length > 0 && selectedNode != null && searchQuery.length === 0 && (
          <div className="hidden xl:flex items-center gap-1 text-xs text-gray-500 flex-1 min-w-0 overflow-hidden">
            {selectedNode.path.map((label, i) => (
              <span key={i} className="flex items-center gap-1 min-w-0">
                {i > 0 && <span className="text-gray-300 flex-shrink-0">›</span>}
                <span className={`truncate flex-shrink-0 max-w-[120px] ${i === selectedNode.path.length - 1 ? "font-medium text-gray-700" : "text-gray-400"}`} title={label}>{label}</span>
              </span>
            ))}
          </div>
        )}

        <button
          onClick={() => setMode("admin")}
          className="ml-auto flex-shrink-0 flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
            <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.475l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
          </svg>
          Manage
        </button>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {searchQuery.trim().length >= 2 ? (
          /* Search results */
          <div className="flex-1 overflow-y-auto p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for &ldquo;{searchQuery}&rdquo;
            </p>
            {searchResults.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No matching nodes found.</p>
            ) : (
              <div className="space-y-1.5 max-w-2xl">
                {searchResults.map(node => (
                  <button
                    key={node.id}
                    onClick={() => handleSearchResultSelect(node)}
                    className="w-full text-left bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-blue-300 hover:shadow-sm transition-all group"
                  >
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
            )}
          </div>
        ) : standard == null ? (
          /* No standard selected */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
            <span className="text-5xl text-gray-200">⊞</span>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Select a standard to start browsing</p>
              <p className="text-xs text-gray-400">Use the dropdown in the header.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Miller columns */}
            <div ref={columnsRef} className="flex flex-1 overflow-x-auto overflow-y-hidden" style={{ scrollBehavior: "smooth" }}>
              {columns.map((colNodes, colIdx) => (
                <BrowserColumn
                  key={colIdx}
                  heading={columnHeading(colNodes)}
                  nodes={colNodes}
                  selectedNodeId={selectedPath[colIdx] ?? null}
                  onSelect={nodeId => handleNodeSelect(colIdx, nodeId)}
                />
              ))}
              <div className="flex-shrink-0 w-4" />
            </div>

            {/* Detail panel */}
            <NodeDetailPanel
              node={selectedNode}
              profiles={nodeProfiles}
              onSelectProfile={setSelectedProfile}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BrowserColumn
// ---------------------------------------------------------------------------

interface BrowserColumnProps {
  heading: string;
  nodes: TaxonomyNodeItem[];
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
}

function BrowserColumn({ heading, nodes, selectedNodeId, onSelect }: BrowserColumnProps) {
  return (
    <div className="flex-shrink-0 w-52 flex flex-col border-r border-gray-200 bg-white overflow-hidden">
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
                className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                  selected ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${
                  node.hasProfiles ? (selected ? "bg-blue-200" : "bg-blue-400") : "bg-transparent"
                }`} />
                <span className="flex-1 min-w-0">
                  <span className={`block text-xs font-mono leading-tight ${selected ? "text-blue-200" : "text-gray-400"}`}>{node.code}</span>
                  <span className="block text-sm leading-snug truncate">{node.label}</span>
                </span>
                {node.children.length > 0 && (
                  <svg className={`flex-shrink-0 w-3 h-3 ${selected ? "text-blue-200" : "text-gray-300"}`} viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
                  </svg>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NodeDetailPanel
// ---------------------------------------------------------------------------

interface NodeDetailPanelProps {
  node: TaxonomyNodeItem | null;
  profiles: Profile[];
  onSelectProfile: (profile: Profile) => void;
}

function NodeDetailPanel({ node, profiles, onSelectProfile }: NodeDetailPanelProps) {
  if (node === null) {
    return (
      <div className="w-72 flex-shrink-0 border-l border-gray-200 bg-white flex items-center justify-center">
        <p className="text-sm text-gray-400 text-center px-6 leading-relaxed">
          Select a node to view its details and attached profiles.
        </p>
      </div>
    );
  }

  return (
    <div className="w-72 flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto flex flex-col">
      {/* Node header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="text-xs font-mono text-gray-400">{node.code}</span>
          <Badge variant="gray">{node.type}</Badge>
        </div>
        <h2 className="text-sm font-semibold text-gray-900 leading-snug">{node.label}</h2>
      </div>

      {node.imageData !== undefined && (
        <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <img src={node.imageData} alt={node.label} className="w-full rounded-md object-contain max-h-48 bg-gray-50" />
        </div>
      )}

      {node.description !== undefined && (
        <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Description</p>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{node.description}</p>
        </div>
      )}

      <div className="px-4 py-3 flex-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          {profiles.length === 0 ? "No profiles" : `${profiles.length} profile${profiles.length !== 1 ? "s" : ""}`}
        </p>
        {profiles.length > 0 ? (
          <div className="space-y-1.5">
            {profiles.map(profile => (
              <button
                key={profile.id}
                onClick={() => onSelectProfile(profile)}
                className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-all group"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 group-hover:text-blue-700 truncate">{profile.name}</p>
                    {profile.description !== "" && (
                      <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{profile.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <Badge variant={profile.source === "builtin" ? "blue" : "gray"}>
                      {profile.source === "builtin" ? "built-in" : "user"}
                    </Badge>
                    <span className="text-xs text-gray-400">{profile.dataset.length}pts</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          node.description === undefined && node.imageData === undefined && (
            <p className="text-xs text-gray-400 italic">No content attached to this node.</p>
          )
        )}
      </div>
    </div>
  );
}
  selectedNodeId: null,
  selectedProfile: null,
};

// ---------------------------------------------------------------------------
// AssistantPage
// ---------------------------------------------------------------------------

export function AssistantPage() {
  const [state, setState] = useState<AssistantState>(INITIAL_STATE);

  const standards = useStandards();

  if (standards === undefined) return <LoadingSpinner />;

  function reset() {
    setState(INITIAL_STATE);
  }

  function selectStandard(standardId: string) {
    setState({
      phase: "choosing",
      selectedStandardId: standardId,
      selectedNodeId: null,
      selectedProfile: null,
    });
  }

  function selectNode(nodeId: string) {
    setState((prev) => ({ ...prev, phase: "results", selectedNodeId: nodeId }));
  }

  function selectProfile(profile: Profile) {
    setState((prev) => ({ ...prev, phase: "detail", selectedProfile: profile }));
  }

  function backToChoosing() {
    setState((prev) => ({ ...prev, phase: "choosing", selectedProfile: null }));
  }

  function backToResults() {
    setState((prev) => ({ ...prev, phase: "results", selectedProfile: null }));
  }

  const selectedStandard = standards.find(
    (s) => s.manifest.id === state.selectedStandardId,
  ) ?? null;

  return (
    <div className="min-h-screen bg-gray-50">
      <ProgressBreadcrumb
        phase={state.phase}
        standardLabel={selectedStandard?.manifest.label ?? null}
        onReset={reset}
      />

      <div className="max-w-5xl mx-auto px-6 py-6">
        {state.phase === "standard_selection" && (
          <StandardSelectionPhase
            standards={standards}
            onSelect={selectStandard}
          />
        )}

        {state.phase === "choosing" && selectedStandard !== null && (
          <ChoosingPhase
            standard={selectedStandard}
            selectedNodeId={state.selectedNodeId}
            onSelectNode={selectNode}
            onBack={reset}
          />
        )}

        {state.phase === "results" &&
          selectedStandard !== null &&
          state.selectedNodeId !== null && (
            <ResultsPhase
              standard={selectedStandard}
              selectedNodeId={state.selectedNodeId}
              onSelectNode={selectNode}
              onSelectProfile={selectProfile}
              onBack={backToChoosing}
            />
          )}

        {state.phase === "detail" &&
          selectedStandard !== null &&
          state.selectedProfile !== null && (
            <ProfileDetail
              profile={state.selectedProfile}
              schema={selectedStandard.profileSchema}
              onBack={backToResults}
              backLabel="Back to results"
            />
          )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase: Standard Selection
// ---------------------------------------------------------------------------

interface StandardSelectionPhaseProps {
  standards: StandardPlugin[];
  onSelect: (standardId: string) => void;
}

function StandardSelectionPhase({
  standards,
  onSelect,
}: StandardSelectionPhaseProps) {
  if (standards.length === 0) {
    return (
      <EmptyState
        title="No standards loaded"
        message="No standards are available. Please check the application configuration."
      />
    );
  }

  return (
    <div>
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Environmental Testing Browser
        </h1>
        <p className="text-gray-500 max-w-xl mx-auto">
          Select the applicable standard to browse test profiles and
          environmental limit profiles.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {standards.map((s) => (
          <button
            key={s.manifest.id}
            onClick={() => onSelect(s.manifest.id)}
            className="group text-left bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-400 hover:shadow-md transition-all"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <span className="text-sm font-bold text-blue-700">
                {s.manifest.id.toUpperCase().replace(/-/g, " ")}
              </span>
              {s.manifest.isBuiltin && (
                <Badge variant="blue">Built-in</Badge>
              )}
            </div>
            <p className="font-semibold text-gray-900 mb-1 group-hover:text-blue-700 transition-colors text-sm">
              {s.manifest.label}
            </p>
            {s.manifest.description !== undefined && (
              <p className="text-xs text-gray-400 line-clamp-2">
                {s.manifest.description}
              </p>
            )}
            <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
              <span>{s.nodes.length} nodes</span>
              <span>{s.manifest.organization}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase: Choosing (tree navigation)
// ---------------------------------------------------------------------------

interface ChoosingPhaseProps {
  standard: StandardPlugin;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onBack: () => void;
}

function ChoosingPhase({
  standard,
  selectedNodeId,
  onSelectNode,
  onBack,
}: ChoosingPhaseProps) {
  const allProfiles = useProfilesByStandard(standard.manifest.id);
  const tree = useMemo(
    () => buildTree(standard.nodes, allProfiles ?? []),
    [standard.nodes, allProfiles],
  );

  const [localNodeId, setLocalNodeId] = useState<string | null>(selectedNodeId);

  function handleSelect(nodeId: string) {
    setLocalNodeId(nodeId);
  }

  function handleConfirm() {
    if (localNodeId !== null) onSelectNode(localNodeId);
  }

  const selectedNode = localNodeId !== null ? findNode(tree, localNodeId) : null;
  const profileCount =
    selectedNode !== null && allProfiles !== undefined
      ? getProfilesForNode(selectedNode, allProfiles).length
      : null;

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium mb-4"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z" />
          </svg>
          Change standard
        </button>
        <h2 className="text-lg font-semibold text-gray-900">
          {standard.manifest.label}
        </h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Select a test method or condition category.
        </p>
      </div>

      <div className="flex gap-6">
        <div className="w-56 flex-shrink-0 bg-white rounded-xl border border-gray-200 p-3 self-start sticky top-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2">
            Taxonomy
          </p>
          <AssistantTree
            tree={tree}
            activeNodeId={localNodeId}
            onSelect={handleSelect}
          />
        </div>

        <div className="flex-1">
          {selectedNode !== null ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-1">
                {selectedNode.label}
              </h3>
              {selectedNode.code !== undefined && (
                <p className="text-xs font-mono text-gray-400 mb-3">
                  {selectedNode.code}
                </p>
              )}
              {profileCount !== null && (
                <p className="text-sm text-gray-500 mb-5">
                  <span className="font-semibold text-gray-800">
                    {profileCount}
                  </span>{" "}
                  profile{profileCount !== 1 ? "s" : ""} available in this
                  category and sub-categories.
                </p>
              )}
              <button
                onClick={handleConfirm}
                disabled={profileCount === 0}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Browse profiles →
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">
              Select a category on the left
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase: Results
// ---------------------------------------------------------------------------

interface ResultsPhaseProps {
  standard: StandardPlugin;
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  onSelectProfile: (profile: Profile) => void;
  onBack: () => void;
}

function ResultsPhase({
  standard,
  selectedNodeId,
  onSelectProfile,
  onBack,
}: ResultsPhaseProps) {
  const allProfiles = useProfilesByStandard(standard.manifest.id);
  const tree = useMemo(
    () => buildTree(standard.nodes, allProfiles ?? []),
    [standard.nodes, allProfiles],
  );

  const selectedNode = findNode(tree, selectedNodeId);
  const nodeProfiles =
    selectedNode !== null && allProfiles !== undefined
      ? getProfilesForNode(selectedNode, allProfiles)
      : [];

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium mb-5"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z" />
        </svg>
        Back to navigation
      </button>

      {selectedNode !== null && (
        <div className="mb-5">
          <div className="flex flex-wrap items-center gap-1 text-sm mb-1">
            {selectedNode.path.map((label, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-300">›</span>}
                <span
                  className={
                    i === selectedNode.path.length - 1
                      ? "font-semibold text-gray-900"
                      : "text-gray-400"
                  }
                >
                  {label}
                </span>
              </span>
            ))}
          </div>
          <p className="text-sm text-gray-400">
            {nodeProfiles.length} profile{nodeProfiles.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      {nodeProfiles.length === 0 ? (
        <EmptyState
          title="No profiles"
          message="No profiles found for this category. Try a different selection."
        />
      ) : (
        <div className="space-y-3">
          {nodeProfiles.map((profile) => (
            <button
              key={profile.id}
              onClick={() => onSelectProfile(profile)}
              className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm text-gray-900 group-hover:text-blue-700 transition-colors">
                      {profile.name}
                    </span>
                    <Badge variant={profile.source === "builtin" ? "blue" : "gray"}>
                      {profile.source === "builtin" ? "Built-in" : "User"}
                    </Badge>
                  </div>
                  {profile.description !== "" && (
                    <p className="text-sm text-gray-500 line-clamp-2">
                      {profile.description}
                    </p>
                  )}
                </div>
                <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full flex-shrink-0">
                  {profile.dataset.length} pts
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProgressBreadcrumb
// ---------------------------------------------------------------------------

interface ProgressBreadcrumbProps {
  phase: AssistantPhase;
  standardLabel: string | null;
  onReset: () => void;
}

function ProgressBreadcrumb({
  phase,
  standardLabel,
  onReset,
}: ProgressBreadcrumbProps) {
  const steps: { id: AssistantPhase; label: string }[] = [
    { id: "standard_selection", label: "Select Standard" },
    { id: "choosing",           label: standardLabel ?? "Navigate" },
    { id: "results",            label: "Results" },
    { id: "detail",             label: "Profile" },
  ];

  const activeIndex = steps.findIndex((s) => s.id === phase);

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3">
      <div className="max-w-5xl mx-auto flex items-center gap-2">
        {steps.map((step, i) => {
          const isDone = i < activeIndex;
          const isActive = i === activeIndex;
          return (
            <div key={step.id} className="flex items-center gap-2">
              {i > 0 && <span className="text-gray-300">›</span>}
              {isDone ? (
                <button
                  onClick={i === 0 ? onReset : undefined}
                  className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
                >
                  {step.label}
                </button>
              ) : (
                <span
                  className={`text-sm ${
                    isActive ? "font-semibold text-gray-900" : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssistantTree — simplified tree for the choosing phase sidebar
// ---------------------------------------------------------------------------

interface AssistantTreeProps {
  tree: TaxonomyNodeItem[];
  activeNodeId: string | null;
  onSelect: (nodeId: string) => void;
}

function AssistantTree({ tree, activeNodeId, onSelect }: AssistantTreeProps) {
  return (
    <div className="space-y-0.5">
      {tree.map((node) => (
        <AssistantTreeNode
          key={node.id}
          node={node}
          activeNodeId={activeNodeId}
          onSelect={onSelect}
          depth={0}
        />
      ))}
    </div>
  );
}

interface AssistantTreeNodeProps {
  node: TaxonomyNodeItem;
  activeNodeId: string | null;
  onSelect: (nodeId: string) => void;
  depth: number;
}

function AssistantTreeNode({
  node,
  activeNodeId,
  onSelect,
  depth,
}: AssistantTreeNodeProps) {
  const isSelected = node.id === activeNodeId;
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        onClick={() => {
          if (hasChildren) setExpanded((v) => !v);
          onSelect(node.id);
        }}
        className={`w-full text-left flex items-center gap-1.5 py-1.5 pr-2 rounded transition-colors text-sm ${
          isSelected
            ? "bg-blue-600 text-white"
            : "text-slate-700 hover:bg-slate-100"
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <span className="flex-shrink-0 w-3 text-center text-xs leading-none text-slate-400">
          {hasChildren ? (expanded ? "▾" : "▸") : "·"}
        </span>
        <span className="flex-1 truncate">{node.label}</span>
        {node.hasProfiles && (
          <span
            className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${
              isSelected ? "bg-blue-200" : "bg-blue-400"
            }`}
          />
        )}
      </button>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <AssistantTreeNode
              key={child.id}
              node={child}
              activeNodeId={activeNodeId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findNode(
  tree: TaxonomyNodeItem[],
  nodeId: string,
): TaxonomyNodeItem | null {
  for (const node of tree) {
    if (node.id === nodeId) return node;
    const found = findNode(node.children, nodeId);
    if (found !== null) return found;
  }
  return null;
}
