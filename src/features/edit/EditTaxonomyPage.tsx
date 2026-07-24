/**
 * Edit database — Taxonomy mode (phase 4b).
 *
 * Édition de la taxonomie d'une norme via le même Miller que le mode Profils :
 * on navigue Standards → nœuds (pas de colonne Profils), chaque colonne porte
 * une ligne « + » (nouvelle norme / nouveau nœud), et le nœud sélectionné
 * s'édite à droite (propriétés + « Customize expected fields »), avec une zone
 * d'action Save/Cancel identique au mode Profils.
 *
 * La logique de mutation (add/update/delete/reorder) reprend celle de
 * TaxonomyEditor : tout est mis en tampon dans `workingNodes` puis persisté en
 * UN SEUL upsert (via updateStandardNodes). Les panneaux d'édition
 * (NodePropertiesPanel / NodeSchemaPanel) sont réutilisés tels quels. Aucune
 * logique métier n'est modifiée (docs/UI-UX-SPEC.md §12/§15.2, §27). Les images
 * de nœuds restent inline — frontière de la phase 8.
 */
import { useState, useMemo, useRef, useEffect, useCallback, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { StandardPlugin, StandardNode } from "../../core/domain/standard";
import type { Profile } from "../../core/domain/profile";
import type { TaxonomyNodeItem } from "../../core/domain/tree";
import { buildTree } from "../../core/engine/treeBuilder";
import { updateStandardNodes, createStandard } from "../../core/db/repositories/standards.repo";
import { attachNodeImages } from "../../core/db/repositories/nodeImages.repo";
import { saveActiveStandard } from "../../core/db/repositories/settings.repo";
import { useProfilesByStandard } from "../../shared/hooks/useProfiles";
import { useStandards } from "../../shared/hooks/useStandards";
import { useAppStore } from "../../store/appStore";
import { Icon } from "../../shared/components/ui/Icon";
import { StatusDot } from "../../shared/components/ui/StatusBadge";
import {
  MillerColumn,
  StandardRow,
  NodeRow,
  AddRow,
  buildColumns,
  columnHeading,
} from "../../shared/components/miller/Miller";
import { NodePropertiesPanel, NodeSchemaPanel } from "../standards/TaxonomyEditor";

const MIN_MILLER = 320;

// --- Helpers de mutation (repris de TaxonomyEditor, purs) -------------------

function collectDescendantIds(nodes: StandardNode[], rootId: string): Set<string> {
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
  return nodes.filter((n) => n.parentId === parentId).reduce((m, n) => Math.max(m, n.order), 0);
}

export function EditTaxonomyPage() {
  const activeStandardId = useAppStore((s) => s.activeStandardId);
  const setActiveStandard = useAppStore((s) => s.setActiveStandard);
  const repoMode = useAppStore((s) => s.repoMode);
  const standards = useStandards();
  const standard = useMemo(
    () => standards?.find((s) => s.manifest.id === activeStandardId) ?? null,
    [standards, activeStandardId],
  );
  const allProfiles = useProfilesByStandard(activeStandardId ?? "");

  // Tampon d'édition + navigation Miller
  const [workingNodes, setWorkingNodes] = useState<StandardNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [hydrated, setHydrated] = useState(false); // tampon chargé (images incluses) ?
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string; profileCount: number } | null>(null);
  const [newStdOpen, setNewStdOpen] = useState(false);

  const [editorWidth, setEditorWidth] = useState(560);
  const resizeAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => resizeAbortRef.current?.abort(), []);

  // Référence « toujours à jour » du tampon, pour détecter une saisie
  // concurrente pendant un enregistrement asynchrone (cf. handleSave).
  const workingNodesRef = useRef(workingNodes);
  workingNodesRef.current = workingNodes;

  // Charge le tampon depuis la norme quand l'IDENTITÉ de la norme change (pas à
  // chaque nouvel objet norme, sinon un save réinitialiserait l'édition).
  const loadedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (standard === null) {
      loadedIdRef.current = null;
      setWorkingNodes([]);
      setSelectedPath([]);
      setDirty(false);
      setHydrated(false);
      return;
    }
    if (loadedIdRef.current !== standard.manifest.id) {
      loadedIdRef.current = standard.manifest.id;
      setSelectedPath([]);
      setDirty(false);
      setSaveError(null);
      hydrateBuffer(standard);
    }
  }, [standard]);

  // Hydrate le tampon avec les images (db.standards est allégé en phase 8) AVANT
  // toute édition, sinon un Save réconcilierait les images à néant. Les mutations
  // et le Save restent bloqués tant que `hydrated` est faux (voir addNode / Save).
  function hydrateBuffer(std: StandardPlugin) {
    const idAtLoad = std.manifest.id;
    setHydrated(false);
    setWorkingNodes([]);
    void attachNodeImages(std).then((h) => {
      if (loadedIdRef.current === idAtLoad) {
        setWorkingNodes(h.nodes);
        setHydrated(true);
      }
    });
  }

  const tree = useMemo(() => buildTree(workingNodes, []), [workingNodes]);
  const columns = useMemo(() => buildColumns(tree, selectedPath), [tree, selectedPath]);

  // Roll-up de statut par nœud (identique au Browser / mode Profils) : purement
  // dérivé des profils. N'affiche les pastilles qu'en mode partagé.
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

  const selectedId = selectedPath.length > 0 ? selectedPath[selectedPath.length - 1]! : null;
  const selectedNode = useMemo(
    () => (selectedId === null ? null : workingNodes.find((n) => n.id === selectedId) ?? null),
    [workingNodes, selectedId],
  );

  function confirmDiscardIfDirty(): boolean {
    if (dirty) return window.confirm("You have unsaved taxonomy changes. Discard them?");
    return true;
  }

  // --- Mutations (tampon local) ---------------------------------------------

  function addNode(parentId: string | null) {
    // Ne jamais muter un tampon non hydraté : un Save réconcilierait les images
    // à néant (le tampon serait allégé).
    if (standard === null || !hydrated) return;
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
    setWorkingNodes((prev) => [...prev, newNode]);
    setDirty(true);
    // Sélectionne le nouveau nœud (chemin jusqu'à son parent + lui-même).
    setSelectedPath((prev) => {
      if (parentId === null) return [newNode.id];
      const parentIdx = prev.indexOf(parentId);
      const base = parentIdx >= 0 ? prev.slice(0, parentIdx + 1) : prev;
      return [...base, newNode.id];
    });
  }

  const updateNode = useCallback((id: string, changes: Partial<StandardNode>) => {
    setWorkingNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...changes } : n)));
    setDirty(true);
  }, []);

  function requestDelete(id: string) {
    const node = workingNodes.find((n) => n.id === id);
    if (node === undefined) return;
    const affected = collectDescendantIds(workingNodes, id);
    const profileCount = (allProfiles ?? []).filter((p) => affected.has(p.nodeId)).length;
    if (profileCount > 0) {
      setPendingDelete({ id, label: node.label, profileCount });
    } else {
      executeDelete(id);
    }
  }

  function executeDelete(id: string) {
    const toRemove = collectDescendantIds(workingNodes, id);
    setWorkingNodes((prev) => prev.filter((n) => !toRemove.has(n.id)));
    setSelectedPath((prev) => prev.filter((nid) => !toRemove.has(nid)));
    setDirty(true);
    setPendingDelete(null);
  }

  function moveSibling(id: string, dir: -1 | 1) {
    const node = workingNodes.find((n) => n.id === id);
    if (node === undefined) return;
    const siblings = workingNodes.filter((n) => n.parentId === node.parentId).sort((a, b) => a.order - b.order);
    const idx = siblings.findIndex((n) => n.id === id);
    const swapIdx = idx + dir;
    if (idx === -1 || swapIdx < 0 || swapIdx >= siblings.length) return;
    const other = siblings[swapIdx]!;
    const a = node.order;
    const b = other.order;
    setWorkingNodes((nodes) =>
      nodes.map((n) => {
        if (n.id === id) return { ...n, order: b };
        if (n.id === other.id) return { ...n, order: a };
        return n;
      }),
    );
    setDirty(true);
  }

  // --- Navigation -----------------------------------------------------------

  function selectStandard(id: string) {
    if (!confirmDiscardIfDirty()) return;
    setActiveStandard(id);
    void saveActiveStandard(id);
    // Le rechargement du tampon est piloté par l'effet sur l'identité de norme.
  }

  function selectNode(colIdx: number, nodeId: string) {
    // Pas de garde : l'édition vit dans workingNodes, changer de nœud ne perd rien.
    setSelectedPath((prev) => [...prev.slice(0, colIdx), nodeId]);
  }

  // --- Persistance ----------------------------------------------------------

  async function handleSave() {
    if (standard === null) return;
    const snapshot = workingNodes;
    setSaving(true);
    setSaveError(null);
    try {
      await updateStandardNodes(standard.manifest.id, snapshot);
      // Ne baisse le drapeau que si le tampon n'a PAS changé pendant l'écriture,
      // sinon une saisie concurrente serait marquée « sauvegardée » sans l'être.
      if (workingNodesRef.current === snapshot) setDirty(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save taxonomy.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (!confirmDiscardIfDirty()) return;
    setSelectedPath([]);
    setDirty(false);
    setSaveError(null);
    // Ré-hydrater depuis db.nodeImages (NE PAS réinstaller les nœuds allégés de
    // db.standards, sinon un Save ultérieur réconcilierait les images à néant).
    if (standard !== null) hydrateBuffer(standard);
    else { setWorkingNodes([]); setHydrated(false); }
  }

  async function handleCreateStandard(plugin: StandardPlugin) {
    await createStandard(plugin);
    setNewStdOpen(false);
    setActiveStandard(plugin.manifest.id);
    void saveActiveStandard(plugin.manifest.id);
  }

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = editorWidth;
    resizeAbortRef.current?.abort();
    const controller = new AbortController();
    resizeAbortRef.current = controller;
    const { signal } = controller;
    function doResize(ev: MouseEvent) {
      if (ev.buttons === 0) { controller.abort(); return; }
      const newWidth = startWidth - (ev.clientX - startX);
      if (newWidth > 420 && newWidth < 900) setEditorWidth(newWidth);
    }
    window.addEventListener("mousemove", doResize, { signal });
    window.addEventListener("mouseup", () => controller.abort(), { signal });
    document.addEventListener("mouseleave", () => controller.abort(), { signal });
  }

  return (
    <div className="flex h-full select-none overflow-x-auto">
      {/* Miller éditable (pas de colonne Profils en mode Taxonomie) */}
      <div className="flex-1 min-w-0" style={{ minWidth: MIN_MILLER }}>
        <div className="flex h-full overflow-x-auto overflow-y-hidden">
          <MillerColumn heading="Standards">
            {(standards ?? []).map((s) => (
              <StandardRow
                key={s.manifest.id}
                standard={s}
                selected={s.manifest.id === activeStandardId}
                onSelect={() => selectStandard(s.manifest.id)}
                statusDot={showStatus ? <StatusDot status={(s as { status?: string }).status} /> : null}
              />
            ))}
            <AddRow label="New standard" onClick={() => { if (confirmDiscardIfDirty()) setNewStdOpen(true); }} />
          </MillerColumn>

          {standard !== null && columns.map((colNodes, colIdx) => {
            const parentId = colIdx === 0 ? null : (selectedPath[colIdx - 1] ?? null);
            return (
              <MillerColumn key={colIdx} heading={columnHeading(colNodes)}>
                {colNodes.map((node) => {
                  const r = rollupByNode.get(node.id);
                  const dot = showStatus && (r === "local" || r === "pending") ? <StatusDot status={r} /> : null;
                  return (
                    <NodeRow
                      key={node.id}
                      node={node}
                      selected={node.id === (selectedPath[colIdx] ?? null)}
                      onSelect={() => selectNode(colIdx, node.id)}
                      statusDot={dot}
                    />
                  );
                })}
                <AddRow label="New node here" onClick={() => addNode(parentId)} disabled={!hydrated} />
              </MillerColumn>
            );
          })}

          {standard === null && (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400 px-8 text-center">
              Select a standard to edit its taxonomy.
            </div>
          )}
        </div>
      </div>

      {/* Poignée */}
      <div
        onMouseDown={startResize}
        className="w-1.5 bg-transparent hover:bg-blue-500/30 cursor-col-resize flex-shrink-0 transition-colors border-l border-gray-200"
      />

      {/* Éditeur du nœud */}
      <div style={{ width: `${editorWidth}px` }} className="flex-shrink-0 flex flex-col bg-white overflow-hidden select-text">
        {standard !== null ? (
          <>
            <div className="flex-shrink-0 px-6 py-3 bg-white border-b border-gray-200 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Taxonomy</p>
                <p className="text-base font-semibold text-gray-900 truncate">{standard.manifest.label}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {saveError !== null && (
                  <span className="text-xs px-2 py-0.5 bg-red-50 border border-red-200 text-red-700 rounded font-medium max-w-[220px] truncate" title={saveError}>
                    {saveError}
                  </span>
                )}
                {savedFlash && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 rounded font-medium">
                    <Icon name="check" size={12} /> Saved
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={!dirty}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => { void handleSave(); }}
                  disabled={saving || !dirty || !hydrated}
                  className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {selectedNode !== null ? (
                <>
                  {/* Barre d'actions du nœud */}
                  <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 bg-gray-50/60 flex-wrap">
                    <button
                      type="button"
                      onClick={() => addNode(selectedNode.id)}
                      disabled={!hydrated}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Icon name="add" size={13} /> Add child
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSibling(selectedNode.id, -1)}
                      title="Move up among siblings"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      <Icon name="chevronUp" size={13} /> Up
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSibling(selectedNode.id, 1)}
                      title="Move down among siblings"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      <Icon name="chevronDown" size={13} /> Down
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDelete(selectedNode.id)}
                      title="Delete node and its children"
                      className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
                    >
                      <Icon name="delete" size={13} /> Delete
                    </button>
                  </div>

                  <NodePropertiesPanel node={selectedNode} onChange={(c) => updateNode(selectedNode.id, c)} />
                  <NodeSchemaPanel node={selectedNode} standard={standard} onChange={(c) => updateNode(selectedNode.id, c)} />
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
                  <Icon name="standards" size={40} className="text-gray-200" />
                  <div>
                    <p className="text-base font-semibold text-gray-500">Select a node to edit it</p>
                    <p className="text-sm text-gray-400 mt-1">
                      or use <strong className="text-gray-600">+ New node here</strong> at the bottom of a column.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400 px-8 text-center">
            Pick a standard in the first column, or create one.
          </div>
        )}
      </div>

      {/* Confirmation de suppression */}
      {pendingDelete !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete node?</h3>
            <p className="text-sm text-gray-500 mb-2">
              <span className="font-medium text-gray-800">{pendingDelete.label}</span> and all its child nodes will be removed from the taxonomy.
            </p>
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-4">
              {pendingDelete.profileCount} profile{pendingDelete.profileCount !== 1 ? "s are" : " is"} attached to this node or its children. Those profiles remain in the database but no longer appear in the taxonomy.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setPendingDelete(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancel</button>
              <button onClick={() => executeDelete(pendingDelete.id)} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700">Delete anyway</button>
            </div>
          </div>
        </div>
      )}

      {newStdOpen && (
        <NewStandardModal
          existingIds={(standards ?? []).map((s) => s.manifest.id)}
          onCancel={() => setNewStdOpen(false)}
          onCreate={handleCreateStandard}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NewStandardModal — création d'une norme locale vide
// ---------------------------------------------------------------------------

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function NewStandardModal({ existingIds, onCancel, onCreate }: {
  existingIds: string[];
  onCancel: () => void;
  onCreate: (plugin: StandardPlugin) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [organization, setOrganization] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const id = slugify(label);
    if (label.trim() === "") { setError("Label is required."); return; }
    if (organization.trim() === "") { setError("Organization is required."); return; }
    if (id === "") { setError("Label must contain letters or digits."); return; }
    if (existingIds.includes(id)) { setError(`A standard with id "${id}" already exists.`); return; }

    const plugin: StandardPlugin = {
      manifest: {
        id,
        version: "1.0",
        schemaVersion: 1,
        organization: organization.trim(),
        label: label.trim(),
        description: "",
        isBuiltin: false,
      },
      nodes: [],
      profileSchema: { version: 1, fields: [], datasetColumns: [] },
      migrations: [],
    };
    setSaving(true);
    try {
      await onCreate(plugin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create standard.");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={onCancel}>
      <form
        onSubmit={handleSubmit}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white shadow-xl border border-gray-200"
      >
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">New standard</h3>
          <p className="text-xs text-gray-500 mt-0.5">Creates an empty local standard you can then populate.</p>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Label</label>
            <input
              autoFocus
              value={label}
              onChange={(e) => { setLabel(e.target.value); setError(null); }}
              placeholder="e.g. MIL-STD-810H"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {label.trim() !== "" && (
              <p className="mt-1 text-xs text-gray-400">id: <span className="font-mono">{slugify(label) || "—"}</span></p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Organization</label>
            <input
              value={organization}
              onChange={(e) => { setOrganization(e.target.value); setError(null); }}
              placeholder="e.g. US DoD"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error !== null && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-gray-100">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors">
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
