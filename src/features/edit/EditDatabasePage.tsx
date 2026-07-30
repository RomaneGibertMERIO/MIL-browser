/**
 * Edit database — UNIFIED page (merge of the former Profiles + Taxonomy tabs).
 *
 * One Miller (Standards → nodes → profiles at a leaf) and ONE contextual right
 * panel that adapts to the deepest selection:
 *   - a profile selected/creating → ProfileForm (per-profile save);
 *   - a node selected             → node editor (NodePropertiesPanel +
 *                                    NodeSchemaPanel) with the buffered
 *                                    Save/Discard of the taxonomy;
 *   - a standard selected only    → StandardInfoPanel (its own save/delete);
 *   - nothing                     → placeholder.
 *
 * ZERO logic change (user constraint): every behaviour is composed from the
 * existing, unchanged pieces — profile logic from the old EditProfilesPage,
 * node-buffer logic (workingNodes + image hydration + single updateStandardNodes)
 * from the old EditTaxonomyPage, and the sub-panels (ProfileForm,
 * NodePropertiesPanel, NodeSchemaPanel, StandardInfoPanel, NewStandardModal,
 * Miller) reused verbatim. The tree is driven by the node BUFFER (so node edits
 * show live) while the Profiles column and status dots come from the LIVE
 * profile query. A row holds either child nodes OR profiles, never both: profiles
 * appear only on a leaf, and a node that already has profiles cannot take
 * children (its "Add child" is disabled).
 */
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { Profile, ProfileDraft, ValidationError } from "../../core/domain/profile";
import type { StandardPlugin, StandardNode, ProfileDefinition } from "../../core/domain/standard";
import type { TaxonomyNodeItem } from "../../core/domain/tree";
import {
  buildProfileFromDraft,
  validateProfile,
  getEffectiveSchema,
} from "../../core/engine/profileEngine";
import { buildTree } from "../../core/engine/treeBuilder";
import {
  upsertProfile,
  deleteProfile as dbDeleteProfile,
} from "../../core/db/repositories/profiles.repo";
import {
  updateStandardNodes,
  createStandard,
} from "../../core/db/repositories/standards.repo";
import { attachNodeImages } from "../../core/db/repositories/nodeImages.repo";
import { saveActiveStandard } from "../../core/db/repositories/settings.repo";
import { useProfilesByStandard } from "../../shared/hooks/useProfiles";
import { useStandards } from "../../shared/hooks/useStandards";
import { useAppStore } from "../../store/appStore";
import { ProfileForm } from "../library/ProfileForm";
import { ProfileDetail } from "../profile/ProfileDetail";
import { Icon } from "../../shared/components/ui/Icon";
import { StatusDot } from "../../shared/components/ui/StatusBadge";
import { useConfirm } from "../../shared/components/ui/ConfirmDialog";
import { toast } from "../../shared/toast/toastStore";
import { StandardInfoPanel } from "./StandardInfoPanel";
import { NewStandardModal } from "./NewStandardModal";
import { NodePropertiesPanel, NodeSchemaPanel } from "../standards/TaxonomyEditor";
import {
  MillerColumn,
  StandardRow,
  NodeRow,
  AddRow,
  EditProfileRow,
  buildColumns,
  columnHeading,
  findNode,
} from "../../shared/components/miller/Miller";

const MIN_MILLER = 320;

// --- Helpers de mutation de nœuds (repris de TaxonomyEditor, purs) ----------
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

export function EditDatabasePage() {
  // ── Store ────────────────────────────────────────────────────────────────
  const activeStandardId = useAppStore((s) => s.activeStandardId);
  const setActiveStandard = useAppStore((s) => s.setActiveStandard);
  const refreshLocalChanges = useAppStore((s) => s.refreshLocalChanges);
  const repoMode = useAppStore((s) => s.repoMode);

  // ── Données ──────────────────────────────────────────────────────────────
  const standards = useStandards();
  const standard = useMemo(
    () => standards?.find((s) => s.manifest.id === activeStandardId) ?? null,
    [standards, activeStandardId],
  );
  const rawProfiles = useProfilesByStandard(activeStandardId ?? "");
  const availableProfiles = useMemo(() => rawProfiles ?? [], [rawProfiles]);

  // ── Navigation Miller (partagée) ─────────────────────────────────────────
  const [selectedPath, setSelectedPath] = useState<string[]>([]);

  // ── Éditeur de PROFIL (repris d'EditProfilesPage) ────────────────────────
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [creatingNodeId, setCreatingNodeId] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewingOriginal, setViewingOriginal] = useState<Profile | null>(null);
  const editedRef = useRef(false); // saisie du ProfileForm (garde anti-perte)

  // ── Tampon d'édition de NŒUDS (repris d'EditTaxonomyPage) ────────────────
  const [workingNodes, setWorkingNodes] = useState<StandardNode[]>([]);
  const [dirty, setDirty] = useState(false); // tampon taxonomie modifié
  const [hydrated, setHydrated] = useState(false); // tampon chargé AVEC images ?
  const [savingNodes, setSavingNodes] = useState(false);
  const [nodeSaveError, setNodeSaveError] = useState<string | null>(null);
  const [nodeSavedFlash, setNodeSavedFlash] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string; profileCount: number } | null>(null);
  const [newStdOpen, setNewStdOpen] = useState(false);
  const workingNodesRef = useRef(workingNodes);
  workingNodesRef.current = workingNodes;
  const loadedIdRef = useRef<string | null>(null);

  // ── Panneau d'infos standard ─────────────────────────────────────────────
  const [infoDirty, setInfoDirty] = useState(false);

  // ── Mise en page ─────────────────────────────────────────────────────────
  const [editorWidth, setEditorWidth] = useState(620);
  const resizeAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => resizeAbortRef.current?.abort(), []);

  const { confirm, dialog: confirmDialog } = useConfirm();

  // ── Arbre : structure PILOTÉE PAR LE TAMPON (édits de nœud live), profils
  //    LIVE. Avant hydratation, on affiche standard.nodes (allégé) pour éviter
  //    un flash vide ; la navigation reste immédiate. ─────────────────────────
  const treeNodes = hydrated ? workingNodes : (standard?.nodes ?? []);
  const tree = useMemo(
    () => (standard != null ? buildTree(treeNodes, availableProfiles) : []),
    [standard, treeNodes, availableProfiles],
  );
  const columns = useMemo(() => buildColumns(tree, selectedPath), [tree, selectedPath]);

  // Roll-up de statut par nœud (dérivé des profils ; pastilles en mode partagé).
  const rollupByNode = useMemo(() => {
    const RANK: Record<string, number> = { local: 3, pending: 2, approved: 1 };
    const LABEL = ["", "approved", "pending", "local"];
    const profByNode = new Map<string, Profile[]>();
    for (const p of availableProfiles) {
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
  }, [tree, availableProfiles]);
  const showStatus = repoMode === "shared";

  const selectedId = selectedPath.length > 0 ? selectedPath[selectedPath.length - 1]! : null;
  // Nœud pour la NAVIGATION (arbre) et pour l'ÉDITION (tampon).
  const selectedTreeNode = useMemo(
    () => (selectedId === null ? null : findNode(tree, selectedId)),
    [tree, selectedId],
  );
  const selectedBufferNode = useMemo(
    () => (selectedId === null ? null : workingNodes.find((n) => n.id === selectedId) ?? null),
    [workingNodes, selectedId],
  );

  // Built-in masqués (une copie locale existe) et profils exacts du nœud.
  const maskedBuiltinIds = useMemo(() => {
    const s = new Set<string>();
    for (const p of availableProfiles) if (p.forkedFrom) s.add(p.forkedFrom);
    return s;
  }, [availableProfiles]);
  const nodeProfilesExact = useMemo(
    () =>
      selectedTreeNode == null
        ? []
        : availableProfiles.filter(
            (p) => p.nodeId === selectedTreeNode.id && !(p.source === "builtin" && maskedBuiltinIds.has(p.id)),
          ),
    [availableProfiles, selectedTreeNode, maskedBuiltinIds],
  );
  // Colonne Profils uniquement AU BOUT (feuille) — une rangée = nœuds OU profils.
  const showProfilesColumn =
    selectedTreeNode != null && (selectedTreeNode.children.length === 0 || nodeProfilesExact.length > 0);
  // Un nœud portant des profils ne peut plus recevoir de sous-nœud.
  const canAddChild = hydrated && nodeProfilesExact.length === 0;

  const selectedProfile = useMemo(
    () => (selectedProfileId !== null ? (availableProfiles.find((p) => p.id === selectedProfileId) ?? null) : null),
    [availableProfiles, selectedProfileId],
  );
  const forkedOrigin = useMemo(
    () =>
      selectedProfile?.forkedFrom
        ? (availableProfiles.find((p) => p.id === selectedProfile.forkedFrom) ?? null)
        : null,
    [selectedProfile, availableProfiles],
  );

  const formInitialDraft = useMemo((): ProfileDraft | null => {
    if (standard == null) return null;
    if (isCreating && creatingNodeId != null) return emptyDraftForNode(standard, creatingNodeId);
    if (selectedProfile !== null) {
      const schema = getEffectiveSchema(standard, selectedProfile.nodeId);
      return profileToDraft(selectedProfile, schema.datasetColumns ?? []);
    }
    return null;
  }, [standard, isCreating, creatingNodeId, selectedProfile]);

  // ── Hydratation du tampon (images) — obligatoire avant édition/save nœud ──
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

  // Réinit navigation/éditeur + (re)chargement du tampon quand la norme change
  // (keyé sur l'identité de norme : un save produit un nouvel objet mais NE doit
  // PAS recharger le tampon).
  function resetProfileNav() {
    editedRef.current = false;
    setSelectedProfileId(null);
    setIsCreating(false);
    setCreatingNodeId(null);
    setValidationErrors([]);
    setSaveStatus("idle");
    setFormKey((k) => k + 1);
  }
  useEffect(() => {
    if (standard === null) {
      loadedIdRef.current = null;
      setWorkingNodes([]);
      setSelectedPath([]);
      setDirty(false);
      setHydrated(false);
      resetProfileNav();
      return;
    }
    if (loadedIdRef.current !== standard.manifest.id) {
      loadedIdRef.current = standard.manifest.id;
      setSelectedPath([]);
      setDirty(false);
      setNodeSaveError(null);
      resetProfileNav();
      hydrateBuffer(standard);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standard]);

  function resetEditorState() {
    editedRef.current = false;
    setValidationErrors([]);
    setSaveStatus("idle");
    setFormKey((k) => k + 1);
  }

  // ── Garde anti-perte unifiée ─────────────────────────────────────────────
  async function confirmDiscardIf(hasUnsaved: boolean): Promise<boolean> {
    if (!hasUnsaved) return true;
    return confirm({
      title: "Unsaved changes",
      message: "You have unsaved updates. Discard your changes?",
      confirmLabel: "Discard",
      destructive: true,
    });
  }

  const handleFormChange = useCallback(() => {
    editedRef.current = true;
  }, []);

  function handleStandardDeleted() {
    setActiveStandard(null);
    void saveActiveStandard(null);
  }

  // ── Navigation ───────────────────────────────────────────────────────────
  async function selectStandard(id: string) {
    // Re-cliquer la norme DÉJÀ active ne fait que revenir au niveau « norme »
    // (le tampon de nœuds et le panneau d'infos sont conservés) → on ne garde
    // alors QUE l'édition de profil, sinon on affiche un faux prompt « discard ».
    // Changer vraiment de norme perd tout.
    const switching = id !== activeStandardId;
    if (!(await confirmDiscardIf(editedRef.current || (switching && (dirty || infoDirty))))) return;
    setActiveStandard(id);
    void saveActiveStandard(id);
    // Toujours revenir au niveau « norme » même en re-cliquant la norme active
    // (l'effet keyé sur l'identité ne se déclenche alors pas).
    setSelectedPath([]);
    setSelectedProfileId(null);
    setIsCreating(false);
    setCreatingNodeId(null);
    resetEditorState();
  }

  async function selectNode(colIdx: number, nodeId: string) {
    // Le tampon de nœuds survit au changement de nœud ; on protège l'édition de
    // profil ouverte et le panneau d'infos standard.
    if (!(await confirmDiscardIf(editedRef.current || infoDirty))) return;
    setSelectedPath((prev) => [...prev.slice(0, colIdx), nodeId]);
    setSelectedProfileId(null);
    setIsCreating(false);
    setCreatingNodeId(null);
    resetEditorState();
  }

  async function selectProfile(profile: Profile) {
    if (!(await confirmDiscardIf(editedRef.current || infoDirty))) return;
    setSelectedProfileId(profile.id);
    setIsCreating(false);
    setCreatingNodeId(null);
    resetEditorState();
  }

  async function startCreateProfile(nodeId: string) {
    if (!(await confirmDiscardIf(editedRef.current || infoDirty))) return;
    setSelectedProfileId(null);
    setIsCreating(true);
    setCreatingNodeId(nodeId);
    resetEditorState();
  }

  // ── Mutations de nœuds (tampon local) ────────────────────────────────────
  function addNode(parentId: string | null) {
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
    setSelectedProfileId(null);
    setIsCreating(false);
    setCreatingNodeId(null);
    editedRef.current = false; // on quitte toute édition de profil ouverte
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
    const profileCount = availableProfiles.filter((p) => affected.has(p.nodeId)).length;
    setPendingDelete({ id, label: node.label, profileCount });
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

  // ── Persistance ──────────────────────────────────────────────────────────
  async function handleSaveNodes() {
    if (standard === null || !hydrated) return;
    const snapshot = workingNodes;
    setSavingNodes(true);
    setNodeSaveError(null);
    try {
      await updateStandardNodes(standard.manifest.id, snapshot);
      if (workingNodesRef.current === snapshot) setDirty(false);
      setNodeSavedFlash(true);
      setTimeout(() => setNodeSavedFlash(false), 2000);
    } catch (err) {
      setNodeSaveError(err instanceof Error ? err.message : "Failed to save taxonomy.");
    } finally {
      setSavingNodes(false);
    }
  }

  async function handleCancelNodes() {
    if (!(await confirmDiscardIf(dirty))) return;
    // Réinit du chemin AVANT ré-hydratation : un nœud non sauvegardé (Add child)
    // référencé par selectedPath disparaîtrait du tampon rechargé et bloquerait
    // le panneau sur « Loading node… ».
    setSelectedPath([]);
    setDirty(false);
    setNodeSaveError(null);
    if (standard !== null) hydrateBuffer(standard);
    else { setWorkingNodes([]); setHydrated(false); }
  }

  async function handleCreateStandard(plugin: StandardPlugin) {
    await createStandard(plugin);
    setNewStdOpen(false);
    setActiveStandard(plugin.manifest.id);
    void saveActiveStandard(plugin.manifest.id);
  }

  async function handleSaveProfile(draft: ProfileDraft) {
    if (standard == null) return;
    const schema = getEffectiveSchema(standard, draft.nodeId);
    const isEditingBuiltin = selectedProfile?.source === "builtin";
    const targetId = isEditingBuiltin ? crypto.randomUUID() : selectedProfile?.id;
    const targetCreatedAt = isEditingBuiltin ? new Date().toISOString() : selectedProfile?.createdAt;

    const profile = buildProfileFromDraft(draft, schema, targetId, targetCreatedAt);
    profile.author = useAppStore.getState().systemUsername || "User";
    if (isEditingBuiltin) {
      profile.source = "user";
      profile.status = "local";
      profile.forkedFrom = selectedProfile?.id;
    }

    const result = validateProfile(profile, schema);
    if (!result.valid) { setValidationErrors(result.errors); return; }

    setValidationErrors([]);
    setSaveStatus("saving");
    await upsertProfile(profile);
    await refreshLocalChanges();

    editedRef.current = false;
    setSelectedProfileId(profile.id);
    setIsCreating(false);
    setCreatingNodeId(null);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }

  async function handleCancelProfile() {
    if (!(await confirmDiscardIf(editedRef.current || infoDirty))) return;
    if (isCreating) {
      setIsCreating(false);
      setCreatingNodeId(null);
    }
    resetEditorState();
  }

  async function handleDuplicate() {
    if (selectedProfile === null) return;
    if (!(await confirmDiscardIf(editedRef.current || infoDirty))) return;
    const copy: Profile = {
      ...selectedProfile,
      id: crypto.randomUUID(),
      name: `${selectedProfile.name} (copy)`,
      source: "user",
      status: "local",
      author: selectedProfile.author ?? "unknown",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await upsertProfile(copy);
    await refreshLocalChanges();
    setSelectedProfileId(copy.id);
    setIsCreating(false);
    setCreatingNodeId(null);
    resetEditorState();
  }

  async function handleRestoreBuiltin() {
    if (selectedProfile === null || forkedOrigin === null) return;
    if (!(await confirmDiscardIf(editedRef.current || infoDirty))) return;
    const ok = await confirm({
      title: "Restore built-in",
      message: `Discard your local copy "${selectedProfile.name}" and restore the original built-in profile? Your local edits will be lost.`,
      confirmLabel: "Restore",
      destructive: true,
    });
    if (!ok) return;
    const originId = forkedOrigin.id;
    await dbDeleteProfile(selectedProfile.id);
    await refreshLocalChanges();
    editedRef.current = false;
    setViewingOriginal(null);
    setSelectedProfileId(originId);
    setIsCreating(false);
    setCreatingNodeId(null);
  }

  async function handleDeleteConfirm() {
    if (deletingId === null) return;
    const { reviewRequested } = await dbDeleteProfile(deletingId);
    await refreshLocalChanges();
    toast[reviewRequested ? "info" : "success"](
      reviewRequested
        ? "Deletion request added — review it in Synchronization and send it to the admin."
        : "Profile deleted.",
    );
    if (selectedProfileId === deletingId) {
      editedRef.current = false;
      setSelectedProfileId(null);
      setIsCreating(false);
      setCreatingNodeId(null);
    }
    setDeletingId(null);
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
      if (newWidth > 460 && newWidth < 900) setEditorWidth(newWidth);
    }
    window.addEventListener("mousemove", doResize, { signal });
    window.addEventListener("mouseup", () => controller.abort(), { signal });
    document.addEventListener("mouseleave", () => controller.abort(), { signal });
  }

  const showProfileEditor = isCreating || selectedProfile !== null;
  const editorTitle = selectedProfile?.name || (isCreating ? "New profile" : "");
  const lockedNodeId = isCreating ? (creatingNodeId ?? undefined) : (selectedProfile?.nodeId ?? undefined);

  return (
    <div className="flex h-full select-none overflow-x-auto">
      {confirmDialog}

      {/* "View original" : le built-in d'origine, en lecture seule. */}
      {viewingOriginal !== null && standard != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Original built-in profile"
          onMouseDown={() => setViewingOriginal(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-gray-50 p-4 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Original built-in profile</h3>
              <button type="button" onClick={() => setViewingOriginal(null)} aria-label="Close" className="text-gray-400 hover:text-gray-700">
                <Icon name="close" size={18} />
              </button>
            </div>
            <ProfileDetail profile={viewingOriginal} schema={getEffectiveSchema(standard, viewingOriginal.nodeId)} />
          </div>
        </div>
      )}

      {/* ── Miller (flexible) ─────────────────────────────────────────────── */}
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
            <AddRow
              label="New standard"
              onClick={async () => { if (await confirmDiscardIf(editedRef.current || dirty || infoDirty)) setNewStdOpen(true); }}
            />
          </MillerColumn>

          {standard != null && columns.map((colNodes, colIdx) => {
            const parentId = colIdx === 0 ? null : (selectedPath[colIdx - 1] ?? null);
            return (
              <MillerColumn key={colIdx} heading={columnHeading(colNodes)}>
                {colNodes.length === 0
                  ? <p className="text-xs text-gray-400 text-center px-3 py-6">No items</p>
                  : colNodes.map((node) => {
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
                <AddRow
                  label="New node here"
                  onClick={async () => { if (await confirmDiscardIf(editedRef.current || infoDirty)) addNode(parentId); }}
                  disabled={!hydrated}
                />
              </MillerColumn>
            );
          })}

          {standard != null && showProfilesColumn && selectedTreeNode != null && (
            <MillerColumn heading={`Profiles${nodeProfilesExact.length ? ` (${nodeProfilesExact.length})` : ""}`} tone="content">
              {nodeProfilesExact.map((p) => (
                <EditProfileRow key={p.id} profile={p} selected={p.id === selectedProfileId} onSelect={() => selectProfile(p)} />
              ))}
              <AddRow label="New profile" onClick={() => startCreateProfile(selectedTreeNode.id)} />
            </MillerColumn>
          )}

          {standard == null && (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400 px-8 text-center">
              Select a standard in the first column to begin.
            </div>
          )}
        </div>
      </div>

      {/* Poignée Miller / Éditeur */}
      <div
        onMouseDown={startResize}
        className="w-1.5 bg-transparent hover:bg-blue-500/30 cursor-col-resize flex-shrink-0 transition-colors border-l border-gray-200"
      />

      {/* ── Panneau droit contextuel ──────────────────────────────────────── */}
      <div style={{ width: `${editorWidth}px` }} className="flex-shrink-0 flex flex-col bg-white overflow-hidden select-text">
        {showProfileEditor && standard != null ? (
          // ─── 1) Éditeur de PROFIL ───────────────────────────────────────
          <>
            <div className="flex-shrink-0 px-6 py-3 bg-white border-b border-gray-200 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{isCreating ? "Creating" : "Editing"}</p>
                <p className="text-base font-semibold text-gray-900 truncate">{editorTitle || "—"}</p>
                {selectedProfile !== null && selectedProfile.author && selectedProfile.author !== "unknown" && (
                  <p className="text-[11px] text-gray-400 truncate">Last modified by {selectedProfile.author}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {validationErrors.length > 0 && (
                  <span className="text-xs px-2 py-0.5 bg-red-50 border border-red-200 text-red-700 rounded font-medium">
                    {validationErrors.length} error{validationErrors.length !== 1 ? "s" : ""}
                  </span>
                )}
                {saveStatus === "saved" && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 rounded font-medium">
                    <Icon name="check" size={12} /> Saved
                  </span>
                )}
                {selectedProfile !== null && !isCreating && (
                  <>
                    <button
                      type="button"
                      onClick={() => { void handleDuplicate(); }}
                      title="Duplicate this profile (creates an editable local copy)"
                      className="px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingId(selectedProfile.id)}
                      title="Delete profile"
                      className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      <Icon name="delete" size={16} />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleCancelProfile}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  form="profile-form"
                  disabled={saveStatus === "saving"}
                  className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
                >
                  {saveStatus === "saving" ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
            {forkedOrigin !== null && (
              <div className="flex-shrink-0 flex items-center gap-3 px-6 py-2.5 bg-gray-50 border-b border-gray-200">
                <Icon name="info" size={15} className="flex-shrink-0 text-gray-400" />
                <p className="flex-1 min-w-0 text-xs text-gray-600">This profile is a local copy of a built-in.</p>
                <button
                  type="button"
                  onClick={() => setViewingOriginal(forkedOrigin)}
                  className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
                >
                  View original
                </button>
                <button
                  type="button"
                  onClick={() => { void handleRestoreBuiltin(); }}
                  className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
                >
                  Restore built-in
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <ProfileForm
                key={`${selectedProfileId ?? "new"}-${creatingNodeId ?? ""}-${formKey}`}
                standard={standard}
                initialDraft={formInitialDraft}
                submitLabel="Save"
                validationErrors={validationErrors}
                onSubmit={(draft) => { void handleSaveProfile(draft); }}
                onCancel={handleCancelProfile}
                onChange={handleFormChange}
                hideActions
                lockedNodeId={lockedNodeId}
              />
            </div>
          </>
        ) : standard != null ? (
          // ─── 2) Contexte TAXONOMIE : éditeur de nœud OU infos standard ───
          <>
            <div className="flex-shrink-0 px-6 py-3 bg-white border-b border-gray-200 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                  {selectedBufferNode !== null ? "Node" : "Taxonomy"}
                </p>
                <p className="text-base font-semibold text-gray-900 truncate">
                  {selectedBufferNode !== null ? (selectedBufferNode.label || "—") : standard.manifest.label}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {nodeSaveError !== null && (
                  <span className="text-xs px-2 py-0.5 bg-red-50 border border-red-200 text-red-700 rounded font-medium max-w-[220px] truncate" title={nodeSaveError}>
                    {nodeSaveError}
                  </span>
                )}
                {nodeSavedFlash && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 rounded font-medium">
                    <Icon name="check" size={12} /> Saved
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => { void handleCancelNodes(); }}
                  disabled={!dirty}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => { void handleSaveNodes(); }}
                  disabled={savingNodes || !dirty || !hydrated}
                  className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {savingNodes ? "Saving…" : "Save"}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {selectedBufferNode !== null ? (
                <>
                  <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 bg-gray-50/60 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setSelectedPath([])}
                      title="Back to standard information"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      <Icon name="back" size={13} /> Standard info
                    </button>
                    <button
                      type="button"
                      onClick={() => addNode(selectedBufferNode.id)}
                      disabled={!canAddChild}
                      title={nodeProfilesExact.length > 0 ? "A node with profiles cannot have child nodes" : "Add a child node"}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Icon name="add" size={13} /> Add child
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSibling(selectedBufferNode.id, -1)}
                      title="Move up among siblings"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      <Icon name="chevronUp" size={13} /> Up
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSibling(selectedBufferNode.id, 1)}
                      title="Move down among siblings"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      <Icon name="chevronDown" size={13} /> Down
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDelete(selectedBufferNode.id)}
                      title="Delete node and its children"
                      className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
                    >
                      <Icon name="delete" size={13} /> Delete
                    </button>
                  </div>

                  <NodePropertiesPanel node={selectedBufferNode} onChange={(c) => updateNode(selectedBufferNode.id, c)} />
                  <NodeSchemaPanel node={selectedBufferNode} standard={standard} onChange={(c) => updateNode(selectedBufferNode.id, c)} />
                </>
              ) : selectedId !== null ? (
                // Un nœud est sélectionné mais le tampon n'est pas encore hydraté
                // (chargement des images). Transitoire — évite de monter/démonter
                // StandardInfoPanel pour rien (et de faire clignoter infoDirty).
                <div className="p-6 text-sm text-gray-400">Loading node…</div>
              ) : (
                <StandardInfoPanel
                  key={standard.manifest.id}
                  standard={standard}
                  onDeleted={handleStandardDeleted}
                  onDirtyChange={setInfoDirty}
                />
              )}
            </div>
          </>
        ) : (
          // ─── 3) Rien ────────────────────────────────────────────────────
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
            <Icon name="edit" size={40} className="text-gray-200" />
            <div>
              <p className="text-base font-semibold text-gray-500">Select a standard to begin</p>
              <p className="text-sm text-gray-400 mt-1">Pick a standard, then navigate its nodes and profiles.</p>
            </div>
          </div>
        )}
      </div>

      {/* Suppression de PROFIL (dialogue dédié). */}
      {deletingId !== null && (
        <DeleteConfirmDialog
          profileName={availableProfiles.find((p) => p.id === deletingId)?.name ?? ""}
          onConfirm={() => { void handleDeleteConfirm(); }}
          onCancel={() => setDeletingId(null)}
        />
      )}

      {/* Suppression de NŒUD : bloquée si des profils sont attachés. */}
      {pendingDelete !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4">
            {pendingDelete.profileCount > 0 ? (
              <>
                <h3 className="text-base font-semibold text-gray-900 mb-2">Can't delete this node</h3>
                <p className="text-sm text-gray-500 mb-4">
                  <span className="font-medium text-gray-800">{pendingDelete.label}</span> (or one of its child nodes) still has{" "}
                  <span className="font-semibold text-gray-800">{pendingDelete.profileCount}</span>{" "}
                  attached profile{pendingDelete.profileCount !== 1 ? "s" : ""}. Move or delete{" "}
                  {pendingDelete.profileCount !== 1 ? "them" : "it"} first, then delete the node.
                </p>
                <div className="flex justify-end">
                  <button onClick={() => setPendingDelete(null)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Close</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-gray-900 mb-2">Delete node?</h3>
                <p className="text-sm text-gray-500 mb-4">
                  <span className="font-medium text-gray-800">{pendingDelete.label}</span> and all its child nodes will be removed from the taxonomy.
                </p>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setPendingDelete(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancel</button>
                  <button onClick={() => executeDelete(pendingDelete.id)} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700">Delete</button>
                </div>
              </>
            )}
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

function DeleteConfirmDialog({ profileName, onConfirm, onCancel }: {
  profileName: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4">
        <h3 className="text-base font-semibold text-gray-900 mb-2">Delete profile?</h3>
        <p className="text-sm text-gray-500 mb-5">
          <span className="font-medium text-gray-800">{profileName}</span> will be permanently deleted.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700">Delete</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers de brouillon (repris d'EditProfilesPage, inchangés)
// ---------------------------------------------------------------------------
function emptyDraftForNode(standard: StandardPlugin, nodeId: string): ProfileDraft {
  const schema = getEffectiveSchema(standard, nodeId);
  const fields: Record<string, unknown> = {};
  for (const f of schema.fields) fields[f.key] = f.defaultValue ?? null;
  return {
    name: "",
    description: "",
    nodeId,
    standardId: standard.manifest.id,
    author: "unknown",
    fields,
    datasetRows: [],
  };
}

function profileToDraft(profile: Profile, columns: ProfileDefinition["datasetColumns"]): ProfileDraft {
  const datasetRows = (profile?.dataset ?? []).map((row) => {
    const stringRow: Record<string, string> = {};
    for (const col of columns || []) stringRow[col.key] = String(row[col.key] ?? "");
    return stringRow;
  });
  return {
    name: profile?.name ?? "",
    description: profile?.description ?? "",
    nodeId: profile?.nodeId ?? "",
    standardId: profile?.standardId ?? "",
    author: profile?.author ?? "unknown",
    fields: profile?.fields ? { ...profile.fields } : {},
    datasetRows,
  };
}
