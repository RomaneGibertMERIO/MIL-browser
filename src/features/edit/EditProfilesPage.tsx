/**
 * Edit database — Profile mode (phase 4a).
 *
 * Remplace la liste plate de LibraryPage par un Miller éditable
 * (Standards → nœuds → Profils) : on navigue jusqu'à un nœud, la colonne
 * Profils liste ses profils avec une ligne « + New profile », et l'éditeur
 * (ProfileForm réutilisé tel quel, nœud imposé) + l'aperçu live occupent la
 * droite, avec une zone d'action Save/Discard fixe.
 *
 * TOUTE la logique métier est réutilisée à l'identique (getEffectiveSchema,
 * buildProfileFromDraft, validateProfile, upsertProfile, deleteProfile,
 * refreshLocalChanges) — voir docs/UI-UX-SPEC.md §12/§15.2 et la contrainte de
 * non-régression §27. Les éditions structurelles (nœuds, normes) arrivent en
 * phase 4b (mode Taxonomie).
 */
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { Profile, ProfileDraft, ValidationError } from "../../core/domain/profile";
import type { StandardPlugin, ProfileDefinition } from "../../core/domain/standard";
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
import { saveActiveStandard } from "../../core/db/repositories/settings.repo";
import { useProfilesByStandard } from "../../shared/hooks/useProfiles";
import { useStandards } from "../../shared/hooks/useStandards";
import { useAppStore } from "../../store/appStore";
import { ProfileForm } from "../library/ProfileForm";
import { Icon } from "../../shared/components/ui/Icon";
import { StatusDot } from "../../shared/components/ui/StatusBadge";
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

export function EditProfilesPage() {
  // Navigation Miller
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [creatingNodeId, setCreatingNodeId] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  // Éditeur
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Largeur redimensionnable de l'éditeur ; le Miller occupe le reste.
  const [editorWidth, setEditorWidth] = useState(620);
  const resizeAbortRef = useRef<AbortController | null>(null);

  // Le graphe et le dataset sont rendus DANS le ProfileForm : taper ne re-rend
  // plus le parent. `editedRef` note simplement qu'une saisie a eu lieu, pour la
  // garde anti-perte à la navigation.
  const editedRef = useRef(false);
  useEffect(() => () => resizeAbortRef.current?.abort(), []);

  // Store
  const activeStandardId = useAppStore((s) => s.activeStandardId);
  const setActiveStandard = useAppStore((s) => s.setActiveStandard);
  const refreshLocalChanges = useAppStore((s) => s.refreshLocalChanges);
  const repoMode = useAppStore((s) => s.repoMode);

  // Données
  const standards = useStandards();
  const standard = useMemo(
    () => standards?.find((s) => s.manifest.id === activeStandardId) ?? null,
    [standards, activeStandardId],
  );
  const rawProfiles = useProfilesByStandard(activeStandardId ?? "");
  const availableProfiles = useMemo(() => rawProfiles ?? [], [rawProfiles]);

  const tree = useMemo(
    () => (standard != null ? buildTree(standard.nodes, availableProfiles) : []),
    [standard, availableProfiles],
  );
  const columns = useMemo(() => buildColumns(tree, selectedPath), [tree, selectedPath]);

  // Roll-up de statut par nœud (identique au Browser ; purement dérivé).
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

  const selectedNode = useMemo((): TaxonomyNodeItem | null => {
    if (selectedPath.length === 0) return null;
    return findNode(tree, selectedPath[selectedPath.length - 1]!);
  }, [tree, selectedPath]);

  // Profils attachés EXACTEMENT au nœud sélectionné (l'édition d'un profil de
  // descendant se fait en descendant dans la colonne enfant).
  const nodeProfilesExact = useMemo(
    () => (selectedNode == null ? [] : availableProfiles.filter((p) => p.nodeId === selectedNode.id)),
    [availableProfiles, selectedNode],
  );

  const selectedProfile = useMemo(
    () => (selectedProfileId !== null ? (availableProfiles.find((p) => p.id === selectedProfileId) ?? null) : null),
    [availableProfiles, selectedProfileId],
  );

  // Brouillon initial : création (nœud imposé) ou édition d'un profil existant.
  const formInitialDraft = useMemo((): ProfileDraft | null => {
    if (standard == null) return null;
    if (isCreating && creatingNodeId != null) return emptyDraftForNode(standard, creatingNodeId);
    if (selectedProfile !== null) {
      const schema = getEffectiveSchema(standard, selectedProfile.nodeId);
      return profileToDraft(selectedProfile, schema.datasetColumns ?? []);
    }
    return null;
  }, [standard, isCreating, creatingNodeId, selectedProfile]);

  function confirmDiscardIfDirty(): boolean {
    if (editedRef.current) {
      return window.confirm("You have unsaved updates. Are you sure you want to discard your changes?");
    }
    return true;
  }

  // Le ProfileForm signale une saisie ; le rendu (graphe/dataset) se fait chez
  // lui, donc on ne fait que lever le drapeau anti-perte (aucun re-rendu parent).
  const handleFormChange = useCallback(() => {
    editedRef.current = true;
  }, []);

  // Réinitialise l'état de navigation quand la norme active change (comme le
  // Browser). Couvre aussi les changements externes de activeStandardId.
  useEffect(() => {
    editedRef.current = false;
    setSelectedPath([]);
    setSelectedProfileId(null);
    setIsCreating(false);
    setCreatingNodeId(null);
    setValidationErrors([]);
    setSaveStatus("idle");
    setFormKey((k) => k + 1);
  }, [activeStandardId]);

  function resetEditorState() {
    editedRef.current = false;
    setValidationErrors([]);
    setSaveStatus("idle");
    setFormKey((k) => k + 1);
  }

  function selectStandard(id: string) {
    if (!confirmDiscardIfDirty()) return;
    setActiveStandard(id);
    void saveActiveStandard(id);
    // Le reset de navigation est piloté par l'effet sur activeStandardId.
  }

  function selectNode(colIdx: number, nodeId: string) {
    if (!confirmDiscardIfDirty()) return;
    setSelectedPath((prev) => [...prev.slice(0, colIdx), nodeId]);
    setSelectedProfileId(null);
    setIsCreating(false);
    setCreatingNodeId(null);
    resetEditorState();
  }

  function selectProfile(profile: Profile) {
    if (!confirmDiscardIfDirty()) return;
    setSelectedProfileId(profile.id);
    setIsCreating(false);
    setCreatingNodeId(null);
    resetEditorState();
  }

  function startCreateProfile(nodeId: string) {
    if (!confirmDiscardIfDirty()) return;
    setSelectedProfileId(null);
    setIsCreating(true);
    setCreatingNodeId(nodeId);
    resetEditorState();
  }

  function handleCancel() {
    if (!confirmDiscardIfDirty()) return;
    if (isCreating) {
      setIsCreating(false);
      setCreatingNodeId(null);
    }
    resetEditorState();
  }

  async function handleSave(draft: ProfileDraft) {
    if (standard == null) return;
    const schema = getEffectiveSchema(standard, draft.nodeId);
    const isEditingBuiltin = selectedProfile?.source === "builtin";

    const targetId = isEditingBuiltin ? crypto.randomUUID() : selectedProfile?.id;
    const targetCreatedAt = isEditingBuiltin ? new Date().toISOString() : selectedProfile?.createdAt;

    const profile = buildProfileFromDraft(draft, schema, targetId, targetCreatedAt);
    if (isEditingBuiltin) {
      profile.source = "user";
      profile.status = "local";
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

  // Dupliquer un profil (y compris builtin) : crée une copie locale éditable.
  // C'est la façon d'obtenir une copie modifiable d'un profil builtin.
  async function handleDuplicate() {
    if (selectedProfile === null) return;
    if (!confirmDiscardIfDirty()) return;
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

  async function handleDeleteConfirm() {
    if (deletingId === null) return;
    await dbDeleteProfile(deletingId);
    await refreshLocalChanges();
    if (selectedProfileId === deletingId) {
      // Supprimer un profil qu'on éditait doit lever la garde anti-perte, sinon
      // fausse alerte « unsaved changes » à la navigation suivante.
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
      // L'éditeur est à droite de la poignée : il grandit quand la poignée va
      // vers la gauche (le Miller flex-1 absorbe la différence).
      const newWidth = startWidth - (ev.clientX - startX);
      if (newWidth > 460 && newWidth < 900) setEditorWidth(newWidth);
    }

    window.addEventListener("mousemove", doResize, { signal });
    window.addEventListener("mouseup", () => controller.abort(), { signal });
    document.addEventListener("mouseleave", () => controller.abort(), { signal });
  }

  const showEditor = isCreating || selectedProfile !== null;
  const editorTitle = selectedProfile?.name || (isCreating ? "New profile" : "");
  const lockedNodeId = isCreating ? (creatingNodeId ?? undefined) : (selectedProfile?.nodeId ?? undefined);

  return (
    // overflow-x-auto : si la fenêtre est trop étroite pour la somme des
    // largeurs mini (Miller + éditeur + aperçu), toute la rangée défile
    // horizontalement au lieu de rogner l'aperçu hors écran (la fenêtre
    // Electron n'a pas de largeur mini).
    <div className="flex h-full select-none overflow-x-auto">
      {/* Miller (flexible) */}
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
          </MillerColumn>

          {standard != null && columns.map((colNodes, colIdx) => (
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
            </MillerColumn>
          ))}

          {standard != null && selectedNode != null && (
            <MillerColumn heading={`Profiles${nodeProfilesExact.length ? ` (${nodeProfilesExact.length})` : ""}`} tone="content">
              {nodeProfilesExact.map((p) => (
                <EditProfileRow
                  key={p.id}
                  profile={p}
                  selected={p.id === selectedProfileId}
                  onSelect={() => selectProfile(p)}
                />
              ))}
              <AddRow label="New profile" onClick={() => startCreateProfile(selectedNode.id)} />
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

      {/* Éditeur */}
      <div style={{ width: `${editorWidth}px` }} className="flex-shrink-0 flex flex-col bg-white overflow-hidden select-text">
        {showEditor && standard != null ? (
          <>
            <div className="flex-shrink-0 px-6 py-3 bg-white border-b border-gray-200 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                  {isCreating ? "Creating" : "Editing"}
                </p>
                <p className="text-base font-semibold text-gray-900 truncate">{editorTitle || "—"}</p>
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
                      onClick={() => selectedProfile.source !== "builtin" && setDeletingId(selectedProfile.id)}
                      disabled={selectedProfile.source === "builtin"}
                      title={selectedProfile.source === "builtin" ? "Built-in profiles cannot be deleted — duplicate it first" : "Delete profile"}
                      className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Icon name="delete" size={16} />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleCancel}
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
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <ProfileForm
                key={`${selectedProfileId ?? "new"}-${creatingNodeId ?? ""}-${formKey}`}
                standard={standard}
                initialDraft={formInitialDraft}
                submitLabel="Save"
                validationErrors={validationErrors}
                onSubmit={(draft) => { void handleSave(draft); }}
                onCancel={handleCancel}
                onChange={handleFormChange}
                hideActions
                lockedNodeId={lockedNodeId}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
            <Icon name="edit" size={40} className="text-gray-200" />
            <div>
              <p className="text-base font-semibold text-gray-500">Select a profile to edit</p>
              <p className="text-sm text-gray-400 mt-1">
                Navigate to a node, then pick a profile or click <strong className="text-gray-600">+ New profile</strong>.
              </p>
            </div>
          </div>
        )}
      </div>

      {deletingId !== null && (
        <DeleteConfirmDialog
          profileName={availableProfiles.find((p) => p.id === deletingId)?.name ?? ""}
          onConfirm={() => { void handleDeleteConfirm(); }}
          onCancel={() => setDeletingId(null)}
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
// Helpers de brouillon (repris de LibraryPage / ProfileForm, inchangés)
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
