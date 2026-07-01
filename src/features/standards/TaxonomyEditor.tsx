/**
 * Taxonomy Editor
 *
 * Visual editor for a standard's node hierarchy.
 * All changes are kept in local state until "Save Changes" is clicked,
 * at which point the full nodes array is written back via onSave().
 *
 * Features:
 *   - Add root nodes and child nodes
 *   - Rename, change code/type, add description
 *   - Upload an image per node (stored as base64 data URI)
 *   - Delete nodes (with warning when profiles are attached)
 *   - Move nodes up / down among their siblings
 *
 * No network calls are made here; persistence is handled by the caller.
 */

import { useState, useMemo, useRef } from "react";
import type { StandardPlugin, StandardNode, NodeType } from "../../core/domain/standard";
import { buildTree } from "../../core/engine/treeBuilder";
import type { TaxonomyNodeItem } from "../../core/domain/tree";
import { useProfilesByStandard } from "../../shared/hooks/useProfiles";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TaxonomyEditorProps {
  standard: StandardPlugin;
  onSave: (nodes: StandardNode[]) => Promise<void>;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Node type options
// ---------------------------------------------------------------------------

const NODE_TYPES: NodeType[] = [
  "method", "procedure", "category", "zone", "condition", "section", "custom",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectDescendantIds(
  nodes: StandardNode[],
  rootId: string,
): Set<string> {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes) {
      if (n.parentId !== null && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id);
        changed = true;
      }
    }
  }
  return ids;
}

function maxSiblingOrder(nodes: StandardNode[], parentId: string | null): number {
  const siblings = nodes.filter(n => n.parentId === parentId);
  return siblings.reduce((m, n) => Math.max(m, n.order), 0);
}

// ---------------------------------------------------------------------------
// TaxonomyEditor
// ---------------------------------------------------------------------------

export function TaxonomyEditor({ standard, onSave, onCancel }: TaxonomyEditorProps) {
  const [workingNodes, setWorkingNodes] = useState<StandardNode[]>(standard.nodes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    label: string;
    profileCount: number;
  } | null>(null);

  const allProfiles = useProfilesByStandard(standard.manifest.id);
  const tree = useMemo(() => buildTree(workingNodes, []), [workingNodes]);
  const selectedNode = workingNodes.find(n => n.id === selectedId) ?? null;

  // ── Mutations ──────────────────────────────────────────────────────────

  function addNode(parentId: string | null) {
    const order = maxSiblingOrder(workingNodes, parentId) + 10;
    const newNode: StandardNode = {
      id: crypto.randomUUID(),
      parentId,
      standardId: standard.manifest.id,
      type: "custom",
      code: "new",
      label: "New Node",
      order,
      tags: [],
      metadata: {},
    };
    setWorkingNodes(prev => [...prev, newNode]);
    setSelectedId(newNode.id);
  }

  function updateNode(id: string, changes: Partial<StandardNode>) {
    setWorkingNodes(prev =>
      prev.map(n => (n.id === id ? { ...n, ...changes } : n)),
    );
  }

  function requestDelete(id: string) {
    const node = workingNodes.find(n => n.id === id);
    if (node === undefined) return;
    const affected = collectDescendantIds(workingNodes, id);
    const profileCount = (allProfiles ?? []).filter(p =>
      affected.has(p.nodeId),
    ).length;
    if (profileCount > 0) {
      setPendingDelete({ id, label: node.label, profileCount });
    } else {
      executeDelete(id);
    }
  }

  function executeDelete(id: string) {
    const toRemove = collectDescendantIds(workingNodes, id);
    setWorkingNodes(prev => prev.filter(n => !toRemove.has(n.id)));
    if (selectedId !== null && toRemove.has(selectedId)) setSelectedId(null);
    setPendingDelete(null);
  }

  function moveUp(id: string) {
    const node = workingNodes.find(n => n.id === id);
    if (node === undefined) return;
    const siblings = workingNodes
      .filter(n => n.parentId === node.parentId)
      .sort((a, b) => a.order - b.order);
    const idx = siblings.findIndex(n => n.id === id);
    if (idx <= 0) return;
    const prev = siblings[idx - 1]!;
    const prevOrder = prev.order;
    const curOrder = node.order;
    setWorkingNodes(nodes =>
      nodes.map(n => {
        if (n.id === id) return { ...n, order: prevOrder };
        if (n.id === prev.id) return { ...n, order: curOrder };
        return n;
      }),
    );
  }

  function moveDown(id: string) {
    const node = workingNodes.find(n => n.id === id);
    if (node === undefined) return;
    const siblings = workingNodes
      .filter(n => n.parentId === node.parentId)
      .sort((a, b) => a.order - b.order);
    const idx = siblings.findIndex(n => n.id === id);
    if (idx === -1 || idx >= siblings.length - 1) return;
    const next = siblings[idx + 1]!;
    const nextOrder = next.order;
    const curOrder = node.order;
    setWorkingNodes(nodes =>
      nodes.map(n => {
        if (n.id === id) return { ...n, order: nextOrder };
        if (n.id === next.id) return { ...n, order: curOrder };
        return n;
      }),
    );
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(workingNodes);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 truncate">
            Taxonomy Editor — {standard.manifest.label}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {workingNodes.length} node{workingNodes.length !== 1 ? "s" : ""} · changes are not saved until you click Save
          </p>
        </div>
        {standard.manifest.isBuiltin && (
          <span className="flex-shrink-0 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md font-medium">
            Built-in standard — edits saved locally
          </span>
        )}
      </div>

      {/* Delete confirmation overlay */}
      {pendingDelete !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              Delete node?
            </h3>
            <p className="text-sm text-gray-500 mb-2">
              <span className="font-medium text-gray-800">{pendingDelete.label}</span> and
              all its child nodes will be removed from the taxonomy.
            </p>
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-4">
              ⚠ {pendingDelete.profileCount} profile
              {pendingDelete.profileCount !== 1 ? "s are" : " is"} attached to this
              node or its children. Those profiles will remain in the database but will
              no longer appear in the taxonomy tree.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPendingDelete(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => executeDelete(pendingDelete.id)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
              >
                Delete Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two-panel body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: node tree */}
        <div className="w-72 flex-shrink-0 flex flex-col border-r border-gray-200 bg-white overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-100 flex-shrink-0">
            <button
              onClick={() => addNode(null)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
            >
              <span className="text-base leading-none">+</span>
              Add root node
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {tree.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6 px-3">
                No nodes yet. Add a root node to start building the taxonomy.
              </p>
            ) : (
              tree.map(node => (
                <EditorTreeNode
                  key={node.id}
                  node={node}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onAddChild={addNode}
                  onDelete={requestDelete}
                  onMoveUp={moveUp}
                  onMoveDown={moveDown}
                  depth={0}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: edit form */}
        <div className="flex-1 overflow-y-auto p-5">
          {selectedNode !== null ? (
            <NodeEditForm
              node={selectedNode}
              onChange={changes => updateNode(selectedNode.id, changes)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
              <span className="text-4xl text-gray-200">◱</span>
              <p className="text-sm text-gray-400 max-w-xs">
                Select a node in the tree to edit its name, description, and image.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 bg-white border-t border-gray-200 px-5 py-3 flex items-center justify-between gap-3">
        {saveError !== null && (
          <p className="text-sm text-red-600">{saveError}</p>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => { void handleSave(); }}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditorTreeNode
// ---------------------------------------------------------------------------

interface EditorTreeNodeProps {
  node: TaxonomyNodeItem;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  depth: number;
}

function EditorTreeNode({
  node,
  selectedId,
  onSelect,
  onAddChild,
  onDelete,
  onMoveUp,
  onMoveDown,
  depth,
}: EditorTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isSelected = node.id === selectedId;

  return (
    <div>
      <div
        className={`flex items-center group transition-colors ${
          isSelected
            ? "bg-blue-50 border-r-2 border-blue-600"
            : "hover:bg-gray-50"
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex-shrink-0 w-5 text-center text-xs text-gray-400 py-1.5"
        >
          {node.children.length > 0 ? (expanded ? "▾" : "▸") : "·"}
        </button>

        {/* Label */}
        <button
          onClick={() => onSelect(node.id)}
          className="flex-1 min-w-0 text-left py-1.5 pr-1"
        >
          <span className={`font-mono text-xs mr-1 ${isSelected ? "text-blue-500" : "text-gray-400"}`}>
            {node.code}
          </span>
          <span className={`text-sm truncate ${isSelected ? "text-blue-700 font-medium" : "text-gray-800"}`}>
            {node.label}
          </span>
        </button>

        {/* Action buttons (always visible when selected, on hover otherwise) */}
        <div className={`flex items-center gap-0.5 pr-1 flex-shrink-0 transition-opacity ${
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}>
          <button
            onClick={() => onMoveUp(node.id)}
            title="Move up"
            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded text-xs"
          >↑</button>
          <button
            onClick={() => onMoveDown(node.id)}
            title="Move down"
            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded text-xs"
          >↓</button>
          <button
            onClick={() => onAddChild(node.id)}
            title="Add child node"
            className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded text-xs"
          >+</button>
          <button
            onClick={() => onDelete(node.id)}
            title="Delete node"
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded text-xs"
          >✕</button>
        </div>
      </div>

      {expanded && node.children.length > 0 && (
        <div>
          {node.children.map(child => (
            <EditorTreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onDelete={onDelete}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NodeEditForm
// ---------------------------------------------------------------------------

interface NodeEditFormProps {
  node: StandardNode;
  onChange: (changes: Partial<StandardNode>) => void;
}

function NodeEditForm({ node, onChange }: NodeEditFormProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file === undefined) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const data = ev.target?.result;
      if (typeof data === "string") {
        onChange({ imageData: data });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const inputCls =
    "w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white";
  const labelCls = "block text-xs font-medium text-gray-700 mb-1";

  return (
    <div className="space-y-5 max-w-lg">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Code</label>
          <input
            type="text"
            value={node.code}
            onChange={e => onChange({ code: e.target.value })}
            className={inputCls}
            placeholder="e.g. 507.6"
          />
        </div>
        <div>
          <label className={labelCls}>Type</label>
          <select
            value={node.type}
            onChange={e => onChange({ type: e.target.value as NodeType })}
            className={inputCls}
          >
            {NODE_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Label <span className="text-red-500">*</span></label>
        <input
          type="text"
          value={node.label}
          onChange={e => onChange({ label: e.target.value })}
          className={inputCls}
          placeholder="Node display name"
        />
      </div>

      <div>
        <label className={labelCls}>Description</label>
        <textarea
          value={node.description ?? ""}
          onChange={e =>
            onChange({ description: e.target.value.length > 0 ? e.target.value : undefined })
          }
          rows={4}
          className={`${inputCls} resize-none`}
          placeholder="Optional description shown in the browser when this node is selected…"
        />
      </div>

      <div>
        <label className={labelCls}>Image (optional)</label>
        <p className="text-xs text-gray-400 mb-2">
          Used as a decision-support aid in the browser. Stored locally as a compressed image.
        </p>
        {node.imageData !== undefined && (
          <div className="mb-2 relative group w-fit">
            <img
              src={node.imageData}
              alt="Node preview"
              className="max-h-48 max-w-full rounded-md border border-gray-200 object-contain"
            />
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 transition-colors"
          >
            {node.imageData !== undefined ? "Replace image" : "Upload image"}
          </button>
          {node.imageData !== undefined && (
            <button
              type="button"
              onClick={() => onChange({ imageData: undefined })}
              className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
            >
              Remove image
            </button>
          )}
        </div>
      </div>

      <div className="pt-2 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          Node ID: <span className="font-mono text-gray-500">{node.id}</span>
        </p>
      </div>
    </div>
  );
}
