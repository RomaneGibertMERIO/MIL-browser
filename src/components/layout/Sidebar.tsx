import { useState } from "react";
import type { TaxonomyNodeItem, AppView } from "../../types";
import type { UseRepositoryResult } from "../../hooks/useRepository";
import type { UseTaxonomyResult } from "../../hooks/useTaxonomy";
import { buildTaxonomyTree } from "../../lib/treeBuilder";

interface SidebarProps {
  repository: UseRepositoryResult;
  taxonomy: UseTaxonomyResult;
  selectedNodePath: string[] | null;
  activeView: AppView;
  onNodeSelect: (path: string[]) => void;
  onViewChange: (view: AppView) => void;
}

// ---------------------------------------------------------------------------
// TaxNodeRow — single row in the taxonomy browse tree
// ---------------------------------------------------------------------------

interface TaxNodeRowProps {
  node: TaxonomyNodeItem;
  selectedPath: string[] | null;
  onNodeSelect: (path: string[]) => void;
  depth: number;
}

function pathsEqual(a: string[], b: string[] | null): boolean {
  if (b === null) return false;
  return a.length === b.length && a.every((l, i) => l === b[i]);
}

function isAncestor(
  nodePath: string[],
  selectedPath: string[] | null
): boolean {
  if (selectedPath === null) return false;
  return (
    nodePath.length < selectedPath.length &&
    nodePath.every((l, i) => l === selectedPath[i])
  );
}

function TaxNodeRow({
  node,
  selectedPath,
  onNodeSelect,
  depth,
}: TaxNodeRowProps) {
  const hasChildren = node.children.length > 0;
  const isSelected = pathsEqual(node.path, selectedPath);
  // Auto-expand ancestors of the selected node
  const [expanded, setExpanded] = useState(
    depth === 0 || isAncestor(node.path, selectedPath) || isSelected
  );

  function handleClick() {
    if (hasChildren) setExpanded((prev) => !prev);
    onNodeSelect(node.path);
  }

  const indent = depth * 14;

  return (
    <div>
      <button
        onClick={handleClick}
        title={node.label}
        className={`w-full text-left flex items-center gap-1.5 py-1.5 pr-2 rounded transition-colors text-sm ${
          isSelected
            ? "bg-blue-600 text-white"
            : "text-slate-300 hover:bg-slate-700/60 hover:text-white"
        }`}
        style={{ paddingLeft: `${8 + indent}px` }}
      >
        <span
          className={`flex-shrink-0 w-3 text-center text-xs leading-none ${
            isSelected ? "text-blue-200" : "text-slate-500"
          }`}
        >
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
            <TaxNodeRow
              key={child.id}
              node={child}
              selectedPath={selectedPath}
              onNodeSelect={onNodeSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar({
  repository,
  taxonomy,
  selectedNodePath,
  activeView,
  onNodeSelect,
  onViewChange,
}: SidebarProps) {
  const tree = buildTaxonomyTree(taxonomy.nodes, repository.allProfiles);

  return (
    <aside className="w-72 flex-shrink-0 bg-slate-900 flex flex-col overflow-hidden border-r border-slate-800">
      {/* ── View tabs ─────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex border-b border-slate-800">
        {(
          [
            { view: "browse", label: "Browse" },
            { view: "library", label: "Library" },
            { view: "taxonomy", label: "Taxonomy" },
          ] as const
        ).map(({ view, label }) => (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              activeView === view
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Taxonomy tree (browse view only) ──────────────────────── */}
      {activeView === "browse" && (
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
            Categories
          </p>
          {tree.length === 0 ? (
            <p className="text-xs text-slate-500 px-2 py-2 leading-relaxed">
              No categories defined. Switch to the Taxonomy tab to set up your
              classification.
            </p>
          ) : (
            <div className="space-y-0.5">
              {tree.map((node) => (
                <TaxNodeRow
                  key={node.id}
                  node={node}
                  selectedPath={selectedNodePath}
                  onNodeSelect={onNodeSelect}
                  depth={0}
                />
              ))}
            </div>
          )}
          <p className="mt-4 px-2 text-xs text-slate-600">● Has profiles</p>
        </div>
      )}
    </aside>
  );
}
