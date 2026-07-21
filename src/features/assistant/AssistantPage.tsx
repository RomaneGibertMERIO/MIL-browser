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

import React, { useState, useMemo, useRef, useEffect } from "react";
import type { Profile } from "../../core/domain/profile";
import type { TaxonomyNodeItem } from "../../core/domain/tree";
import { buildTree, getProfilesForNode } from "../../core/engine/treeBuilder";
import { useStandards } from "../../shared/hooks/useStandards";
import { useProfilesByStandard } from "../../shared/hooks/useProfiles";
import { useAppStore } from "../../store/appStore";
import { saveActiveStandard } from "../../core/db/repositories/settings.repo";
import { LoadingSpinner } from "../../shared/components/ui/LoadingSpinner";
import { EmptyWorkspaceNotice } from "../../shared/components/ui/EmptyWorkspaceNotice";
import { Badge } from "../../shared/components/ui/Badge";
import { ProfileDetail } from "../profile/ProfileDetail";
import { getEffectiveSchema } from "../../core/engine/profileEngine";

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
  const [colWidths, setColWidths]           = useState<Record<number, number>>({});
  const [sideWidth, setSideWidth]           = useState(480);

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
  const resizingRef = useRef<{ colIdx: number; startX: number; startWidth: number } | null>(null);
  const sideResizingRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (columnsRef.current) {
      columnsRef.current.scrollLeft = columnsRef.current.scrollWidth;
    }
  }, [columns.length]);

  useEffect(() => {
    setSelectedPath([]);
    setSelectedProfile(null);
    setColWidths({});
  }, [activeStdId]);

  function getColWidth(idx: number, defaultWidth = 208): number {
    return colWidths[idx] ?? defaultWidth;
  }

  function handleResizeStart(e: React.MouseEvent, colIdx: number) {
    e.preventDefault();
    const startWidth = getColWidth(colIdx);
    resizingRef.current = { colIdx, startX: e.clientX, startWidth };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const { colIdx: idx, startX, startWidth: sw } = resizingRef.current;
      const newWidth = Math.max(120, sw + ev.clientX - startX);
      setColWidths(prev => ({ ...prev, [idx]: newWidth }));
    };

    const onMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function handleSideResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    sideResizingRef.current = { startX: e.clientX, startWidth: sideWidth };

    const onMouseMove = (ev: MouseEvent) => {
      if (!sideResizingRef.current) return;
      const { startX, startWidth } = sideResizingRef.current;
      const newWidth = Math.max(280, startWidth - (ev.clientX - startX));
      setSideWidth(newWidth);
    };

    const onMouseUp = () => {
      sideResizingRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

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

  // Espace de travail vide : on explique POURQUOI (dépôt injoignable, dépôt
  // sans norme, ou socle non chargé) au lieu d'afficher une arborescence vide.
  if (standards.length === 0) return <EmptyWorkspaceNotice />;

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200">
        <div className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
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
        </div>
        {selectedPath.length > 0 && selectedNode != null && searchQuery.length === 0 && (
          <div className="px-4 py-1.5 border-t border-gray-100 bg-gray-50 flex flex-wrap items-center gap-1 text-xs text-gray-500">
            {selectedNode.path.map((label, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-300 select-none">›</span>}
                <span className={i === selectedNode.path.length - 1 ? "font-medium text-gray-700" : "text-gray-400"}>
                  {label}
                </span>
              </span>
            ))}
          </div>
        )}
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
            <div className="flex-1 min-w-0 overflow-hidden">
              <div ref={columnsRef} className="flex h-full overflow-x-auto overflow-y-hidden" style={{ scrollBehavior: "smooth" }}>
                {columns.map((colNodes, colIdx) => (
                  <BrowserColumn
                    key={colIdx}
                    heading={columnHeading(colNodes)}
                    nodes={colNodes}
                    selectedNodeId={selectedPath[colIdx] ?? null}
                    onSelect={nodeId => handleNodeSelect(colIdx, nodeId)}
                    width={getColWidth(colIdx)}
                    onResizeStart={e => handleResizeStart(e, colIdx)}
                  />
                ))}
                {selectedNode != null && (
                  <ProfilesColumn
                    profiles={nodeProfiles}
                    onSelectProfile={setSelectedProfile}
                    selectedProfileId={selectedProfile?.id ?? null}
                    width={getColWidth(columns.length, 280)}
                    onResizeStart={e => handleResizeStart(e, columns.length)}
                  />
                )}
                <div className="flex-shrink-0 w-4" />
              </div>
            </div>

            <BrowserSidePanel
              node={selectedNode}
              profile={selectedProfile}
              profileSchema={selectedProfile !== null && standard !== null
                ? getEffectiveSchema(standard, selectedProfile.nodeId)
                : null}
              onClearProfile={() => setSelectedProfile(null)}
              width={sideWidth}
              onResizeStart={handleSideResizeStart}
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
  width: number;
  onResizeStart: (e: React.MouseEvent) => void;
}

function BrowserColumn({ heading, nodes, selectedNodeId, onSelect, width, onResizeStart }: BrowserColumnProps) {
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
      <div
        onMouseDown={onResizeStart}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400 transition-colors z-10"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProfilesColumn
// ---------------------------------------------------------------------------

interface ProfilesColumnProps {
  profiles: Profile[];
  onSelectProfile: (profile: Profile) => void;
  selectedProfileId: string | null;
  width: number;
  onResizeStart: (e: React.MouseEvent) => void;
}

function ProfilesColumn({ profiles, onSelectProfile, selectedProfileId, width, onResizeStart }: ProfilesColumnProps) {
  return (
    <div className="flex-shrink-0 flex flex-col border-r border-gray-200 bg-white relative" style={{ width }}>
      <div className="flex-shrink-0 px-3 py-2 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {profiles.length === 0 ? "Profiles" : `Profiles (${profiles.length})`}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {profiles.length === 0 ? (
          <p className="text-xs text-gray-400 text-center px-3 py-6 italic">No profiles attached to this node.</p>
        ) : (
          profiles.map(profile => (
            <button
              key={profile.id}
              onClick={() => onSelectProfile(profile)}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-50 transition-colors group ${
                profile.id === selectedProfileId
                  ? "bg-blue-50 border-blue-100"
                  : "hover:bg-blue-50"
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700">{profile.name}</p>
                  {profile.description !== "" && (
                    <p className="text-xs text-gray-400 mt-0.5">{profile.description}</p>
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
          ))
        )}
      </div>

      <div
        onMouseDown={onResizeStart}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400 transition-colors z-10"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// BrowserSidePanel
// ---------------------------------------------------------------------------

interface BrowserSidePanelProps {
  node: TaxonomyNodeItem | null;
  profile: Profile | null;
  profileSchema: React.ComponentProps<typeof ProfileDetail>["schema"] | null;
  onClearProfile: () => void;
  width: number;
  onResizeStart: (e: React.MouseEvent) => void;
}

function BrowserSidePanel({ node, profile, profileSchema, onClearProfile, width, onResizeStart }: BrowserSidePanelProps) {
  if (profile !== null && profileSchema !== null) {
    return (
      <aside className="flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto relative" style={{ width }}>
        <div
          onMouseDown={onResizeStart}
          className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-blue-400 transition-colors z-10"
        />
        <div className="px-6 py-5">
          <ProfileDetail
            profile={profile}
            schema={profileSchema}
            onBack={onClearProfile}
            backLabel="Back to profiles"
          />
        </div>
      </aside>
    );
  }

  if (node === null) {
    return (
      <aside className="flex-shrink-0 border-l border-gray-200 bg-white flex items-center justify-center relative" style={{ width }}>
        <div
          onMouseDown={onResizeStart}
          className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-blue-400 transition-colors z-10"
        />
        <p className="text-sm text-gray-400 text-center px-8 leading-relaxed">
          Select a node to see its decision support image and details.
        </p>
      </aside>
    );
  }

  return (
    <aside className="flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto flex flex-col min-h-0 relative" style={{ width }}>
      <div
        onMouseDown={onResizeStart}
        className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-blue-400 transition-colors z-10"
      />
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="text-xs font-mono text-gray-400">{node.code}</span>
          <Badge variant="gray">{node.type}</Badge>
        </div>
        <h2 className="text-base font-semibold text-gray-900 leading-snug">{node.label}</h2>
      </div>

      {node.imageData !== undefined ? (
        <div className="flex-1 min-h-0 p-5 flex items-center justify-center bg-gray-50">
          <img
            src={node.imageData}
            alt={node.label}
            className="max-w-full max-h-full object-contain rounded-lg shadow-sm bg-white"
          />
        </div>
      ) : null}

      {node.description !== undefined && (
        <div className="px-5 py-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Description</p>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{node.description}</p>
        </div>
      )}

      {node.imageData === undefined && node.description === undefined && (
        <div className="px-5 py-8 text-sm text-gray-400">
          No image or descriptive guidance is attached to this node.
        </div>
      )}
    </aside>
  );
}
