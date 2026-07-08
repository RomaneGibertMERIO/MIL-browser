/**
 * Profile creation and edit form.
 *
 * Renders a schema-driven form for creating or editing a profile.
 * The entire form shape (fields + dataset columns) is driven by the
 * standard's ProfileSchema — no hardcoded field names.
 *
 * Node selection uses a cascading dropdown system based on the standard's
 * node tree. The selected nodeId is stored in the draft as a stable ID.
 */

import { useState, type FormEvent } from "react";
import type { ProfileDraft, ValidationError } from "../../core/domain/profile";
import type { StandardPlugin } from "../../core/domain/standard";
import type { TaxonomyNodeItem } from "../../core/domain/tree";
import { buildTree } from "../../core/engine/treeBuilder";
import { getEffectiveSchema } from "../../core/engine/profileEngine";
import { Card } from "../../shared/components/ui/Card";
import { FieldRenderer } from "../../shared/components/forms/FieldRenderer";
import { DatasetEditor, type DatasetRow } from "./DatasetEditor";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProfileFormProps {
  standard: StandardPlugin;
  initialDraft: ProfileDraft | null;
  submitLabel: string;
  validationErrors: ValidationError[];
  onSubmit: (draft: ProfileDraft) => void;
  onCancel: () => void;
  /** Called on every draft change — used for live preview in the parent. */
  onChange?: (draft: ProfileDraft) => void;
  /** Hide the bottom Cancel/Save buttons (parent owns them). */
  hideActions?: boolean;
}

// ---------------------------------------------------------------------------
// ProfileForm
// ---------------------------------------------------------------------------

export function ProfileForm({
  standard,
  initialDraft,
  submitLabel,
  validationErrors,
  onSubmit,
  onCancel,
  onChange,
  hideActions = false,
}: ProfileFormProps) {
  const [draft, setDraft] = useState<ProfileDraft>(() =>
    initialDraft ?? buildEmptyDraft(standard),
  );

  const tree = buildTree(standard.nodes, []);

  function handleFieldChange(key: string, value: unknown) {
    const next = { ...draft, fields: { ...draft.fields, [key]: value } };
    setDraft(next);
    onChange?.(next);
  }

  function handleDatasetChange(rows: DatasetRow[]) {
    const next = { ...draft, datasetRows: rows };
    setDraft(next);
    onChange?.(next);
  }

  function handleNodeSelect(nodeId: string) {
    const newSchema = getEffectiveSchema(standard, nodeId);
    const fields: Record<string, unknown> = { ...draft.fields };
    for (const f of newSchema.fields) {
      if (!(f.key in fields)) fields[f.key] = f.defaultValue ?? null;
    }
    const next = { ...draft, nodeId, fields };
    setDraft(next);
    onChange?.(next);
  }

  function getError(key: string): string | undefined {
    return validationErrors.find((e) => e.field === key)?.message;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(draft);
  }

  const selectedNode = findNodeById(tree, draft.nodeId);
  const effectiveSchema = getEffectiveSchema(standard, draft.nodeId);

  return (
    <form id="profile-form" onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* ── Profile Information ─────────────────────────────────────── */}
      <Card title="Profile Information">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => { const next = { ...draft, name: e.target.value }; setDraft(next); onChange?.(next); }}
              placeholder="Profile name"
              className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                getError("name") !== undefined ? "border-red-400" : "border-gray-300"
              }`}
            />
            {getError("name") !== undefined && (
              <p className="mt-1 text-xs text-red-600">{getError("name")}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={draft.description}
              onChange={(e) => { const next = { ...draft, description: e.target.value }; setDraft(next); onChange?.(next); }}
              rows={2}
              placeholder="Optional description"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>
      </Card>

      {/* ── Taxonomy Node ───────────────────────────────────────────── */}
      <Card title="Classification">
        {getError("nodeId") !== undefined && (
          <p className="mb-3 text-xs text-red-600">{getError("nodeId")}</p>
        )}
        <NodeCascadeSelector
          tree={tree}
          selectedNodeId={draft.nodeId}
          onSelect={handleNodeSelect}
        />
        {selectedNode !== null && (
          <p className="mt-2 text-xs text-gray-400">
            Node:{" "}
            <span className="font-mono text-gray-600">{selectedNode.id}</span>
          </p>
        )}
      </Card>

      {/* ── Schema Fields (by group) ─────────────────────────────────── */}
      {renderFieldGroups(standard, draft, handleFieldChange, getError, effectiveSchema.fields)}

      {/* ── Dataset ─────────────────────────────────────────────────── */}
      <Card title="Dataset">
        {/* Options d'affichage des axes Logarithmiques */}
        <div className="flex items-center gap-6 p-3 bg-gray-50 border border-gray-200 rounded-lg mb-4">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Chart Scale:
          </span>
          
          <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!draft.fields["xIsLog"]}
              onChange={(e) => handleFieldChange("xIsLog", e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
            />
            Logarithmic X-Axis (Frequency)
          </label>
      
          <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!draft.fields["yIsLog"]}
              onChange={(e) => handleFieldChange("yIsLog", e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
            />
            Logarithmic Y-Axis (Amplitude)
          </label>
        </div>
      
        <DatasetEditor
          columns={effectiveSchema.datasetColumns}
          rows={draft.datasetRows}
          onChange={handleDatasetChange}
        />
        {getError("dataset") !== undefined && (
          <p className="mt-2 text-xs text-red-600">{getError("dataset")}</p>
        )}
      </Card>

      {!hideActions && (
        <div className="flex justify-end gap-3 pt-1 pb-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 transition-colors"
          >
            {submitLabel}
          </button>
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// NodeCascadeSelector
// ---------------------------------------------------------------------------

interface NodeCascadeSelectorProps {
  tree: TaxonomyNodeItem[];
  selectedNodeId: string;
  onSelect: (nodeId: string) => void;
}

/** Renders cascading dropdowns for navigating the taxonomy tree. */
function NodeCascadeSelector({
  tree,
  selectedNodeId,
  onSelect,
}: NodeCascadeSelectorProps) {
  const levels = buildCascadeLevels(tree, selectedNodeId);

  if (levels.length === 0) {
    return (
      <p className="text-sm text-amber-600">
        No taxonomy nodes defined for this standard.
      </p>
    );
  }

  const levelNames = [
    "Method / Section",
    "Procedure",
    "Category / Zone",
    "Condition",
    "Level 5",
    "Level 6",
  ];

  return (
    <div className="space-y-3">
      {levels.map(({ options, selectedId }, levelIndex) => (
        <div key={levelIndex}>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {levelNames[levelIndex] ?? `Level ${levelIndex + 1}`}
          </label>
          <select
            value={selectedId ?? ""}
            onChange={(e) => {
              if (e.target.value !== "") {
                onSelect(e.target.value);
              }
            }}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">— Select —</option>
            {options.map((node) => (
              <option key={node.id} value={node.id}>
                {node.code ? `${node.code} — ` : ""}{node.label}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CascadeLevel {
  options: TaxonomyNodeItem[];
  selectedId: string | null;
}

function buildCascadeLevels(
  tree: TaxonomyNodeItem[],
  selectedNodeId: string,
): CascadeLevel[] {
  const levels: CascadeLevel[] = [];
  let currentNodes = tree;

  while (currentNodes.length > 0) {
    const selected = currentNodes.find((n) => {
      if (n.id === selectedNodeId) return true;
      return isAncestorOfId(n, selectedNodeId);
    });

    levels.push({
      options: currentNodes,
      selectedId: selected?.id ?? null,
    });

    if (selected === undefined) break;

    // If the selected node IS the target, we might still show its children.
    if (selected.id === selectedNodeId && selected.children.length > 0) {
      levels.push({ options: selected.children, selectedId: null });
      break;
    }

    currentNodes = selected.children;
  }

  return levels;
}

function isAncestorOfId(node: TaxonomyNodeItem, targetId: string): boolean {
  return node.children.some(
    (c) => c.id === targetId || isAncestorOfId(c, targetId),
  );
}

function findNodeById(
  tree: TaxonomyNodeItem[],
  id: string,
): TaxonomyNodeItem | null {
  for (const node of tree) {
    if (node.id === id) return node;
    const found = findNodeById(node.children, id);
    if (found !== null) return found;
  }
  return null;
}

function buildEmptyDraft(standard: StandardPlugin): ProfileDraft {
  const fields: Record<string, unknown> = {};
  for (const f of standard.profileSchema.fields) {
    fields[f.key] = f.defaultValue ?? null;
  }
  return {
    name: "",
    description: "",
    nodeId: "",
    standardId: standard.manifest.id,
    fields,
    datasetRows: [],
  };
}

/** Renders field groups in order, skipping groups with no fields. */
function renderFieldGroups(
  standard: StandardPlugin,
  draft: ProfileDraft,
  onFieldChange: (key: string, value: unknown) => void,
  getError: (key: string) => string | undefined,
  fields?: StandardPlugin["profileSchema"]["fields"],
) {
  const groupOrder = [
    "identification",
    "conditions",
    "procedures",
    "acceptance",
    "references",
    "notes",
    "custom",
  ] as const;

  const groupLabels: Record<string, string> = {
    identification: "Identification",
    conditions:     "Test Conditions",
    procedures:     "Procedures",
    acceptance:     "Acceptance Criteria",
    references:     "References",
    notes:          "Notes",
    custom:         "Custom Fields",
  };

  const sourceFields = fields ?? standard.profileSchema.fields;

  return groupOrder.map((group) => {
    const groupFields = sourceFields.filter(
      (f) => f.group === group,
    );
    if (groupFields.length === 0) return null;

    return (
      <Card key={group} title={groupLabels[group] ?? group}>
        <div className={groupFields.length > 1 ? "grid grid-cols-2 gap-x-6 gap-y-4" : ""}>
          {groupFields.map((field) => (
            <div key={field.key} className={field.type === "multiline" ? "col-span-2" : ""}>
              <FieldRenderer
                definition={field}
                value={draft.fields[field.key]}
                onChange={(value) => onFieldChange(field.key, value)}
                error={getError(field.key)}
              />
            </div>
          ))}
        </div>
      </Card>
    );
  });
}
