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
import type {
  StandardPlugin, StandardNode, NodeType,
  NodeSchemaDefinition, FieldDefinition, ColumnDefinition,
  FieldGroup, FieldType, AxisPosition,
} from "../../core/domain/standard";
import type { ProfileDefinition } from "../../core/domain/standard";
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
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-gray-900">
            Taxonomy Editor — {standard.manifest.label}
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {workingNodes.length} node{workingNodes.length !== 1 ? "s" : ""} · Changes are staged locally until you save.
          </p>
        </div>
        {standard.manifest.isBuiltin && (
          <span className="flex-shrink-0 text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg font-medium">
            ⚠ Built-in standard — edits saved locally
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

      {/* Three-panel body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Panel 1: Taxonomy tree */}
        <div className="w-80 flex-shrink-0 flex flex-col border-r border-gray-200 bg-slate-50 overflow-hidden">
          {/* Toolbar — always visible */}
          <div className="flex-shrink-0 border-b border-gray-200 bg-white">
            <div className="px-3 py-2.5 flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => addNode(null)}
                title="Add root node"
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
              >
                + Root
              </button>
              <button
                onClick={() => selectedId !== null && addNode(selectedId)}
                disabled={selectedId === null}
                title="Add child to selected node"
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + Child
              </button>
              <button
                onClick={() => selectedId !== null && moveUp(selectedId)}
                disabled={selectedId === null}
                title="Move node up"
                className="px-2 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >↑</button>
              <button
                onClick={() => selectedId !== null && moveDown(selectedId)}
                disabled={selectedId === null}
                title="Move node down"
                className="px-2 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >↓</button>
              <div className="flex-1" />
              <button
                onClick={() => selectedId !== null && requestDelete(selectedId)}
                disabled={selectedId === null}
                title="Delete selected node"
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {tree.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10 px-4">
                No nodes yet. Click "Add Root Node" to begin building the taxonomy.
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

        {/* Panel 2: Node properties */}
        <div className="w-[480px] flex-shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
          {selectedNode !== null ? (
            <NodePropertiesPanel
              node={selectedNode}
              onChange={changes => updateNode(selectedNode.id, changes)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center px-8">
              <span className="text-5xl text-gray-200">◱</span>
              <p className="text-base font-medium text-gray-400">Select a node to edit its properties</p>
              <p className="text-sm text-gray-300">or add a root node to get started</p>
            </div>
          )}
        </div>

        {/* Panel 3: Node schema */}
        <div className="flex-1 bg-gray-50 overflow-y-auto">
          {selectedNode !== null ? (
            <NodeSchemaPanel
              node={selectedNode}
              standard={standard}
              onChange={changes => updateNode(selectedNode.id, changes)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
              <span className="text-5xl text-gray-200">⊞</span>
              <p className="text-base font-medium text-gray-400">Profile schema configuration</p>
              <p className="text-sm text-gray-300">Select a node to configure its fields and columns</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between gap-3">
        {saveError !== null && (
          <p className="text-sm text-red-600">{saveError}</p>
        )}
        <div className="flex items-center gap-3 ml-auto">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { void handleSave(); }}
            disabled={saving}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
        className={`flex items-center group transition-colors cursor-pointer ${
          isSelected
            ? "bg-blue-600"
            : "hover:bg-slate-100"
        }`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          className={`flex-shrink-0 w-6 text-center text-sm py-2.5 ${
            isSelected ? "text-blue-200" : "text-gray-400"
          }`}
        >
          {node.children.length > 0 ? (expanded ? "▾" : "▸") : "·"}
        </button>

        {/* Label */}
        <button
          onClick={() => onSelect(node.id)}
          className="flex-1 min-w-0 text-left py-2.5 pr-2"
        >
          <span className={`font-mono text-xs mr-1.5 ${
            isSelected ? "text-blue-200" : "text-gray-400"
          }`}>
            {node.code}
          </span>
          <span className={`text-sm ${
            isSelected ? "text-white font-medium" : "text-gray-900"
          }`}>
            {node.label}
          </span>
        </button>

        {/* Action buttons */}
        <div className={`flex items-center gap-0.5 pr-2 flex-shrink-0 transition-opacity ${
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}>
          <button
            onClick={(e) => { e.stopPropagation(); onMoveUp(node.id); }}
            title="Move up"
            className={`p-1.5 rounded text-sm ${
              isSelected ? "text-blue-200 hover:bg-blue-500" : "text-gray-400 hover:text-gray-700 hover:bg-gray-200"
            }`}
          >↑</button>
          <button
            onClick={(e) => { e.stopPropagation(); onMoveDown(node.id); }}
            title="Move down"
            className={`p-1.5 rounded text-sm ${
              isSelected ? "text-blue-200 hover:bg-blue-500" : "text-gray-400 hover:text-gray-700 hover:bg-gray-200"
            }`}
          >↓</button>
          <button
            onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }}
            title="Add child node"
            className={`p-1.5 rounded text-sm font-bold ${
              isSelected ? "text-blue-100 hover:bg-blue-500" : "text-gray-400 hover:text-green-600 hover:bg-green-50"
            }`}
          >+</button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
            title="Delete node"
            className={`p-1.5 rounded text-sm ${
              isSelected ? "text-red-300 hover:bg-red-600" : "text-gray-400 hover:text-red-600 hover:bg-red-50"
            }`}
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
// NodePropertiesPanel — center panel: code, type, label, description, image
// ---------------------------------------------------------------------------

interface NodePropertiesPanelProps {
  node: StandardNode;
  onChange: (changes: Partial<StandardNode>) => void;
}

function NodePropertiesPanel({ node, onChange }: NodePropertiesPanelProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file === undefined) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const data = ev.target?.result;
      if (typeof data === "string") onChange({ imageData: data });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const fieldCls = "w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";
  const labelCls = "block text-sm font-medium text-gray-700 mb-1.5";

  return (
    <>
      {/* Always-visible node context header */}
      <div className="flex-shrink-0 px-6 py-3 bg-gray-50 border-b border-gray-200">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Editing Node</p>
        <p className="text-sm font-semibold text-gray-900 mt-0.5">
          <span className="font-mono text-blue-600 mr-2">{node.code}</span>
          {node.label}
        </p>
      </div>
      {/* Scrollable form content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">Node Properties</p>
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className={labelCls}>Code</label>
            <input type="text" value={node.code} onChange={e => onChange({ code: e.target.value })} className={fieldCls} placeholder="e.g. 507.6" />
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <select value={node.type} onChange={e => onChange({ type: e.target.value as NodeType })} className={fieldCls}>
              {NODE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div className="mb-5">
          <label className={labelCls}>Label <span className="text-red-500">*</span></label>
          <input type="text" value={node.label} onChange={e => onChange({ label: e.target.value })} className={fieldCls} placeholder="Node display name" />
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <textarea
            value={node.description ?? ""}
            onChange={e => onChange({ description: e.target.value.length > 0 ? e.target.value : undefined })}
            rows={6}
            className={`${fieldCls} resize-none`}
            placeholder="Optional description shown in the browser when this node is selected…"
          />
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Decision Support Image</p>
        <p className="text-sm text-gray-400 mb-3">Displayed full-size in the browser when this node is selected. Helps engineers pick the right profile.</p>
        {node.imageData !== undefined && (
          <img src={node.imageData} alt="Node preview" className="mb-3 max-h-56 max-w-full rounded-lg border border-gray-200 object-contain bg-gray-50" />
        )}
        <div className="flex items-center gap-3">
          <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          <button type="button" onClick={() => imageInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 transition-colors">
            {node.imageData !== undefined ? "Replace Image" : "Upload Image"}
          </button>
          {node.imageData !== undefined && (
            <button type="button" onClick={() => onChange({ imageData: undefined })} className="px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400">Stable ID: <span className="font-mono text-gray-500 select-all">{node.id}</span></p>
      </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// NodeSchemaPanel — right panel: profile schema configuration
// ---------------------------------------------------------------------------

interface NodeSchemaPanelProps {
  node: StandardNode;
  standard: StandardPlugin;
  onChange: (changes: Partial<StandardNode>) => void;
}

function NodeSchemaPanel({ node, standard, onChange }: NodeSchemaPanelProps) {
  return (
    <div className="p-6">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Profile Schema</p>
      <p className="text-sm text-gray-500 mb-5 leading-relaxed">
        Custom fields and dataset columns for profiles created under this node. When active, overrides the standard-level schema.
      </p>
      <NodeSchemaSection
        nodeSchema={node.nodeSchema}
        standardSchema={standard.profileSchema}
        onChange={ns => onChange({ nodeSchema: ns })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// NodeSchemaSection — per-node field/column override editor
// ---------------------------------------------------------------------------

const FIELD_GROUPS: FieldGroup[] = ["identification", "conditions", "procedures", "acceptance", "references", "notes", "custom"];
const FIELD_TYPES: FieldType[] = ["text", "number", "enum", "boolean", "multiline", "date", "duration"];
const AXIS_OPTIONS: AxisPosition[] = ["x", "left", "right", "none"];

interface NodeSchemaSectionProps {
  nodeSchema: NodeSchemaDefinition | undefined;
  standardSchema: ProfileDefinition;
  onChange: (ns: NodeSchemaDefinition | undefined) => void;
}

function NodeSchemaSection({ nodeSchema, standardSchema, onChange }: NodeSchemaSectionProps) {
  const hasCustom = nodeSchema !== undefined;

  function enable() {
    onChange({
      fields: [...standardSchema.fields],
      datasetColumns: [...standardSchema.datasetColumns],
    });
  }

  function updateField(idx: number, changes: Partial<FieldDefinition>) {
    if (!nodeSchema) return;
    onChange({ ...nodeSchema, fields: nodeSchema.fields.map((f, i) => i === idx ? { ...f, ...changes } : f) });
  }

  function addField() {
    if (!nodeSchema) return;
    const newField: FieldDefinition = {
      key: `field_${Date.now()}`,
      label: "New Field",
      group: "conditions",
      type: "text",
      required: false,
      validation: [],
    };
    onChange({ ...nodeSchema, fields: [...nodeSchema.fields, newField] });
  }

  function removeField(idx: number) {
    if (!nodeSchema) return;
    onChange({ ...nodeSchema, fields: nodeSchema.fields.filter((_, i) => i !== idx) });
  }

  function updateColumn(idx: number, changes: Partial<ColumnDefinition>) {
    if (!nodeSchema) return;
    onChange({ ...nodeSchema, datasetColumns: nodeSchema.datasetColumns.map((c, i) => i === idx ? { ...c, ...changes } : c) });
  }

  function addColumn() {
    if (!nodeSchema) return;
    const newCol: ColumnDefinition = {
      key: `col_${Date.now()}`,
      label: "New Column",
      unit: "",
      type: "number",
      axis: "left",
      color: null,
      required: false,
    };
    onChange({ ...nodeSchema, datasetColumns: [...nodeSchema.datasetColumns, newCol] });
  }

  function removeColumn(idx: number) {
    if (!nodeSchema) return;
    onChange({ ...nodeSchema, datasetColumns: nodeSchema.datasetColumns.filter((_, i) => i !== idx) });
  }

  const cellCls = "px-2 py-1 text-xs border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500";

  if (!hasCustom) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-3 bg-gray-50">
        <p className="text-xs text-gray-500 mb-2">
          This node uses the standard-level profile schema. You can override it with node-specific fields and dataset columns.
        </p>
        <button
          type="button"
          onClick={enable}
          className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
        >
          Define custom schema for this node
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-blue-200 bg-blue-50/30 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Custom schema active</span>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-xs text-red-500 hover:text-red-700 transition-colors"
        >
          Revert to standard schema
        </button>
      </div>

      {/* Fields */}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-1.5">Profile Fields</p>
        {nodeSchema.fields.length === 0 && (
          <p className="text-xs text-gray-400 italic mb-1">No fields — profile form will show nothing for this node.</p>
        )}
        <div className="space-y-1.5">
          {nodeSchema.fields.map((field, idx) => (
            <div key={idx} className="flex items-center gap-1.5 flex-wrap">
              <input
                type="text"
                placeholder="key"
                value={field.key}
                onChange={e => updateField(idx, { key: e.target.value })}
                className={`${cellCls} w-28 font-mono`}
              />
              <input
                type="text"
                placeholder="Label"
                value={field.label}
                onChange={e => updateField(idx, { label: e.target.value })}
                className={`${cellCls} w-32`}
              />
              <select
                value={field.group}
                onChange={e => updateField(idx, { group: e.target.value as FieldGroup })}
                className={cellCls}
              >
                {FIELD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <select
                value={field.type}
                onChange={e => updateField(idx, { type: e.target.value as FieldType })}
                className={cellCls}
              >
                {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                type="text"
                placeholder="unit"
                value={field.unit ?? ""}
                onChange={e => updateField(idx, { unit: e.target.value || undefined })}
                className={`${cellCls} w-14`}
              />
              <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={e => updateField(idx, { required: e.target.checked })}
                  className="w-3 h-3"
                />
                req
              </label>
              <button
                type="button"
                onClick={() => removeField(idx)}
                className="text-red-400 hover:text-red-600 text-xs leading-none"
                title="Remove field"
              >✕</button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addField}
          className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          + Add field
        </button>
      </div>

      {/* Dataset columns */}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-1.5">Dataset Columns</p>
        {nodeSchema.datasetColumns.length === 0 && (
          <p className="text-xs text-gray-400 italic mb-1">No columns — dataset editor will be empty for this node.</p>
        )}
        <div className="space-y-1.5">
          {nodeSchema.datasetColumns.map((col, idx) => (
            <div key={idx} className="flex items-center gap-1.5 flex-wrap">
              <input
                type="text"
                placeholder="key"
                value={col.key}
                onChange={e => updateColumn(idx, { key: e.target.value })}
                className={`${cellCls} w-28 font-mono`}
              />
              <input
                type="text"
                placeholder="Label"
                value={col.label}
                onChange={e => updateColumn(idx, { label: e.target.value })}
                className={`${cellCls} w-32`}
              />
              <input
                type="text"
                placeholder="unit"
                value={col.unit}
                onChange={e => updateColumn(idx, { unit: e.target.value })}
                className={`${cellCls} w-14`}
              />
              <select
                value={col.type}
                onChange={e => updateColumn(idx, { type: e.target.value as "number" | "string" })}
                className={cellCls}
              >
                <option value="number">number</option>
                <option value="string">string</option>
              </select>
              <select
                value={col.axis}
                onChange={e => updateColumn(idx, { axis: e.target.value as AxisPosition })}
                className={cellCls}
              >
                {AXIS_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={col.required}
                  onChange={e => updateColumn(idx, { required: e.target.checked })}
                  className="w-3 h-3"
                />
                req
              </label>
              <button
                type="button"
                onClick={() => removeColumn(idx)}
                className="text-red-400 hover:text-red-600 text-xs leading-none"
                title="Remove column"
              >✕</button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addColumn}
          className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          + Add column
        </button>
      </div>
    </div>
  );
}
