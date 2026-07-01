import { useState, useRef, type FormEvent, type ChangeEvent } from "react";
import type {
  TaxonomyNodeItem,
  RepoProfile,
  CanonicalCondition,
} from "../../types";
import type { UseTaxonomyResult } from "../../hooks/useTaxonomy";
import { buildTaxonomyTree } from "../../lib/treeBuilder";
import { exportTaxonomy, importTaxonomy } from "../../lib/taxonomyStorage";

interface TaxonomyManagerProps {
  taxonomy: UseTaxonomyResult;
  allProfiles: ReadonlyArray<RepoProfile>;
}

// ---------------------------------------------------------------------------
// NodeRow — a single taxonomy node with inline add / edit / delete actions
// ---------------------------------------------------------------------------

interface NodeRowProps {
  node: TaxonomyNodeItem;
  taxonomy: UseTaxonomyResult;
  allProfiles: ReadonlyArray<RepoProfile>;
  depth: number;
}

function NodeRow({ node, taxonomy, allProfiles, depth }: NodeRowProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editingImageData, setEditingImageData] = useState("");
  const [editingCondition, setEditingCondition] = useState<
    CanonicalCondition | ""
  >("");
  const [addingChild, setAddingChild] = useState(false);
  const [newChildLabel, setNewChildLabel] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const hasChildren = node.children.length > 0;
  const indent = depth * 20;

  function startEdit() {
    setEditingLabel(node.label);
    setEditingImageData(node.imageData ?? "");
    setEditingCondition(node.canonicalCondition ?? "");
  }

  function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (editingLabel !== null && editingLabel.trim()) {
      taxonomy.updateNode(node.id, {
        label: editingLabel.trim(),
        parentId: node.parentId,
        imageData: editingImageData.trim() || undefined,
        canonicalCondition: editingCondition || undefined,
      });
    }
    setEditingLabel(null);
  }

  function saveNewChild(e: FormEvent) {
    e.preventDefault();
    if (newChildLabel.trim()) {
      taxonomy.addNode(node.id, newChildLabel.trim());
      setNewChildLabel("");
      setAddingChild(false);
      setExpanded(true);
    }
  }

  function handleDeleteClick() {
    if (confirmDelete) {
      taxonomy.deleteNode(node.id);
    } else {
      setConfirmDelete(true);
    }
  }

  return (
    <div>
      {/* ── Node row ──────────────────────────────────────────────── */}
      <div
        className="group flex items-center gap-1 py-1 rounded hover:bg-gray-50 transition-colors"
        style={{ paddingLeft: `${8 + indent}px` }}
      >
        {/* Expand / leaf indicator */}
        <button
          type="button"
          onClick={() => hasChildren && setExpanded((p) => !p)}
          className={`flex-shrink-0 w-5 h-5 flex items-center justify-center text-xs text-gray-400 rounded transition-colors ${
            hasChildren
              ? "hover:text-gray-700 cursor-pointer"
              : "cursor-default"
          }`}
          aria-label={
            hasChildren ? (expanded ? "Collapse" : "Expand") : undefined
          }
        >
          {hasChildren ? (expanded ? "▾" : "▸") : "·"}
        </button>

        {/* Label (normal or edit-mode) */}
        {editingLabel !== null ? (
          <form
            onSubmit={saveEdit}
            className="flex-1 min-w-0 space-y-2 py-1 pr-2"
          >
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                type="text"
                value={editingLabel}
                onChange={(e) => setEditingLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditingLabel(null);
                }}
                placeholder="Node label"
                className="flex-1 min-w-0 px-2 py-0.5 text-sm border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={editingCondition}
                onChange={(e) =>
                  setEditingCondition(e.target.value as CanonicalCondition | "")
                }
                className="px-2 py-0.5 text-xs border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">— no condition —</option>
                <option value="operational">operational</option>
                <option value="storage">storage</option>
              </select>
              <input
                type="text"
                value={editingImageData}
                onChange={(e) => setEditingImageData(e.target.value)}
                placeholder="image.jpg"
                className="flex-1 min-w-0 px-2 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="text-xs text-green-600 hover:text-green-800 font-medium"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingLabel(null)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <span className="flex-1 text-sm text-gray-800 select-none truncate">
              {node.label}
            </span>

            {node.hasProfiles && (
              <span
                className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400 mr-1"
                title="Has profiles"
              />
            )}

            {/* Hover actions */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button
                type="button"
                title="Add child category"
                onClick={() => {
                  setAddingChild(true);
                  setExpanded(true);
                }}
                className="px-1.5 py-0.5 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors font-medium"
              >
                + Child
              </button>
              <button
                type="button"
                title="Rename"
                onClick={startEdit}
                className="px-1.5 py-0.5 text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
              >
                Edit
              </button>

              {confirmDelete ? (
                <>
                  <button
                    type="button"
                    onClick={handleDeleteClick}
                    className="px-1.5 py-0.5 text-xs text-white bg-red-500 hover:bg-red-600 rounded font-medium transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-100 rounded transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  title={
                    node.hasProfiles
                      ? "Delete — profiles referencing this node will lose their path segment"
                      : "Delete node and all children"
                  }
                  onClick={handleDeleteClick}
                  className="px-1.5 py-0.5 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                >
                  Delete
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Add child form ────────────────────────────────────────── */}
      {addingChild && (
        <form
          onSubmit={saveNewChild}
          className="flex items-center gap-2 py-1"
          style={{ paddingLeft: `${8 + indent + 25}px` }}
        >
          <input
            autoFocus
            type="text"
            value={newChildLabel}
            onChange={(e) => setNewChildLabel(e.target.value)}
            placeholder="New category name…"
            className="flex-1 min-w-0 px-2 py-1 text-sm border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="px-2 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 font-medium flex-shrink-0"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setAddingChild(false);
              setNewChildLabel("");
            }}
            className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            Cancel
          </button>
        </form>
      )}

      {/* ── Children ─────────────────────────────────────────────── */}
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <NodeRow
              key={child.id}
              node={child}
              taxonomy={taxonomy}
              allProfiles={allProfiles}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );

  async function handleImageUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      setEditingImageData(reader.result as string);
    };

    reader.readAsDataURL(file);
  }
}

// ---------------------------------------------------------------------------
// TaxonomyManager — top-level view
// ---------------------------------------------------------------------------

export function TaxonomyManager({
  taxonomy,
  allProfiles,
}: TaxonomyManagerProps) {
  const [addingRoot, setAddingRoot] = useState(false);
  const [newRootLabel, setNewRootLabel] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);

  const tree = buildTaxonomyTree(taxonomy.nodes, allProfiles);

  function saveNewRoot(e: FormEvent) {
    e.preventDefault();

    if (newRootLabel.trim()) {
      taxonomy.addNode(null, newRootLabel.trim());
      setNewRootLabel("");
      setAddingRoot(false);
    }
  }

  async function handleImportTaxonomy(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file) return;

    try {
      const importedNodes = await importTaxonomy(file);

      taxonomy.importTaxonomy(importedNodes);

      alert(`${importedNodes.length} taxonomy nodes imported`);
    } catch (error) {
      console.error(error);
      alert("Invalid taxonomy file");
    }

    e.target.value = "";
  }

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Taxonomy Management
          </h2>

          <p className="text-sm text-gray-400 mt-0.5">
            {taxonomy.nodes.length} node{taxonomy.nodes.length !== 1 ? "s" : ""}{" "}
            · Build the classification hierarchy used for Browse and profile
            creation
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            Import Taxonomy
          </button>

          <button
            type="button"
            onClick={() => exportTaxonomy(taxonomy.nodes)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            Export Taxonomy
          </button>

          <button
            type="button"
            onClick={() => setAddingRoot(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2Z" />
            </svg>
            Add Root Category
          </button>
        </div>
      </div>

      {/* ── Add root form ────────────────────────────────────────── */}
      {addingRoot && (
        <form
          onSubmit={saveNewRoot}
          className="flex items-center gap-2 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg"
        >
          <input
            autoFocus
            type="text"
            value={newRootLabel}
            onChange={(e) => setNewRootLabel(e.target.value)}
            placeholder="Root category name (e.g. Environmental Testing)…"
            className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-blue-400 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 font-medium flex-shrink-0"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setAddingRoot(false);
              setNewRootLabel("");
            }}
            className="text-sm text-gray-500 hover:text-gray-700 flex-shrink-0"
          >
            Cancel
          </button>
        </form>
      )}

      <input
        ref={importInputRef}
        type="file"
        accept=".json"
        onChange={handleImportTaxonomy}
        className="hidden"
      />

      {/* ── Tree ────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {tree.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-gray-500">
              No taxonomy categories defined.
            </p>
            <p className="mt-1 text-sm text-gray-400">
              Click "Add Root Category" to start building your classification.
            </p>
          </div>
        ) : (
          <div className="p-2">
            {tree.map((node) => (
              <NodeRow
                key={node.id}
                node={node}
                taxonomy={taxonomy}
                allProfiles={allProfiles}
                depth={0}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Help text ────────────────────────────────────────────── */}
      <div className="mt-3 text-xs text-gray-400 space-y-0.5">
        <p>
          Hover over any node to reveal Rename, + Child, and Delete actions.
        </p>
        <p>● A blue dot indicates that profiles reference this node.</p>
        <p>Deleting a node also removes all its children from the taxonomy.</p>
      </div>
    </div>
  );
}
