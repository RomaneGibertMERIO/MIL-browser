/**
 * Sidebar taxonomy tree component.
 *
 * Renders the hierarchical classification tree for a single standard.
 * Nodes are identified by their stable StandardNode.id — never by label.
 *
 * Selection state is owned by the parent via onNodeSelect; this component
 * is purely presentational and does not write to the store.
 */

import { useState } from "react";
import type { TaxonomyNodeItem } from "../../core/domain/tree";

// ---------------------------------------------------------------------------
// NodeRow — single recursive row
// ---------------------------------------------------------------------------

interface NodeRowProps {
  node: TaxonomyNodeItem;
  activeNodeId: string | null;
  onSelect: (nodeId: string) => void;
  depth: number;
}

function isAncestorOf(ancestor: TaxonomyNodeItem, targetId: string): boolean {
  return ancestor.children.some(
    (c) => c.id === targetId || isAncestorOf(c, targetId),
  );
}

function NodeRow({ node, activeNodeId, onSelect, depth }: NodeRowProps) {
  const isSelected = node.id === activeNodeId;
  const [expanded, setExpanded] = useState(
    depth === 0 || isAncestorOf(node, activeNodeId ?? ""),
  );

  const hasChildren = node.children.length > 0;
  const indent = depth * 14;

  function handleClick() {
    if (hasChildren) setExpanded((prev) => !prev);
    onSelect(node.id);
  }

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
            title="Has profiles"
          />
        )}
      </button>

      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <NodeRow
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
// TaxonomyTree
// ---------------------------------------------------------------------------

interface TaxonomyTreeProps {
  tree: TaxonomyNodeItem[];
  activeNodeId: string | null;
  onSelect: (nodeId: string) => void;
}

/**
 * Renders the full taxonomy tree for a standard.
 * Nodes that have profiles show a blue indicator dot.
 */
export function TaxonomyTree({ tree, activeNodeId, onSelect }: TaxonomyTreeProps) {
  if (tree.length === 0) {
    return (
      <p className="text-xs text-slate-500 px-2 py-2 leading-relaxed">
        No nodes defined for this standard.
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {tree.map((node) => (
        <NodeRow
          key={node.id}
          node={node}
          activeNodeId={activeNodeId}
          onSelect={onSelect}
          depth={0}
        />
      ))}
      <p className="mt-4 px-2 text-xs text-slate-600">● Has profiles</p>
    </div>
  );
}
