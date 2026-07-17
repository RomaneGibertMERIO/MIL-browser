import { useState, useMemo, useRef } from "react";
import type { Profile, ProfileDraft } from "../../core/domain/profile";
import { ProfileSchema } from "../../core/domain/profile";
import type { StandardPlugin, ProfileDefinition } from "../../core/domain/standard";
import type { ValidationError } from "../../core/domain/profile";
import {
  buildProfileFromDraft,
  validateProfile,
  getEffectiveSchema,
} from "../../core/engine/profileEngine";
import {
  upsertProfile,
  deleteProfile as dbDeleteProfile,
} from "../../core/db/repositories/profiles.repo";
import {
  exportProfilesForStandard,
  importProfilesForStandard,
  type ImportResult,
} from "../../core/engine/importExportEngine";
import { useProfilesByStandard } from "../../shared/hooks/useProfiles";
import { ProfileForm } from "./ProfileForm";
import { TimeSeriesChart } from "../../shared/components/charts/TimeSeriesChart";

import { useAppStore } from "../../store/appStore"; // <-- Ajuste le chemin relatif si nécessaire

interface LibraryPageProps {
  standard: StandardPlugin;
}

export function LibraryPage({ standard }: LibraryPageProps) {
  // Sélection & Workspace State
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formKey, setFormKey] = useState(0);

  // Récupération de l'action Zustand pour notifier l'UI des modifications locales
  const refreshLocalChanges = useAppStore((state) => state.refreshLocalChanges);
 
  // Largeurs dynamiques des panneaux (Drag-to-resize)
  const [leftWidth, setLeftWidth] = useState(288); // 72 en Tailwind = 288px
  const [rightWidth, setRightWidth] = useState(320); // 80 en Tailwind = 320px

  // Live preview & validation
  const [previewDraft, setPreviewDraft] = useState<ProfileDraft | null>(null);
  const [previewTab, setPreviewTab] = useState<"chart" | "table" | "fields">("chart");
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Outils
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [pendingImport, setPendingImport] = useState<{ file: File; conflictCount: number } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Data
  const rawProfiles = useProfilesByStandard(standard.manifest.id);
  const availableProfiles = useMemo(() => rawProfiles ?? [], [rawProfiles]);
  
  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return availableProfiles;
    return availableProfiles.filter((p: Profile) =>
      p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    );
  }, [availableProfiles, search]);
  
  const selectedProfile = useMemo(
    () => selectedProfileId !== null ? (availableProfiles.find((p: Profile) => p.id === selectedProfileId) ?? null) : null,
    [availableProfiles, selectedProfileId]
  );

  // Live preview computation
  const previewProfile = useMemo((): Profile | null => {
    const d = previewDraft;
    if (d === null) return selectedProfile;
    try {
      const schema = getEffectiveSchema(standard, d.nodeId);
      return buildProfileFromDraft(d, schema, selectedProfile?.id, selectedProfile?.createdAt);
    } catch { return selectedProfile; }
  }, [previewDraft, selectedProfile, standard]);

  const previewSchema = useMemo((): ProfileDefinition =>
    previewDraft ? getEffectiveSchema(standard, previewDraft.nodeId) : standard.profileSchema,
    [previewDraft, standard]
  );

  const formInitialDraft = useMemo((): ProfileDraft | null => {
    if (selectedProfile === null) return null;
    const schema = getEffectiveSchema(standard, selectedProfile.nodeId);
    return profileToDraft(selectedProfile, schema.datasetColumns);
  }, [selectedProfile, standard]);

  // Détection des modifications non sauvegardées (Deep Check basique)
  const isDirty = useMemo(() => {
    if (!previewDraft) return false;
    return JSON.stringify(previewDraft) !== JSON.stringify(formInitialDraft);
  }, [previewDraft, formInitialDraft]);

  // Garde-fou anti-perte de données
  function confirmDiscardIfDirty(): boolean {
    if (isDirty) {
      return window.confirm("You have unsaved updates. Are you sure you want to discard your changes?");
    }
    return true;
  }

  // Resizer de gauche
  function startResizeLeft(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidth;
    function doResize(moveEvent: MouseEvent) {
      const newWidth = startWidth + (moveEvent.clientX - startX);
      if (newWidth > 200 && newWidth < 500) setLeftWidth(newWidth);
    }
    function stopResize() {
      window.removeEventListener("mousemove", doResize);
      window.removeEventListener("mouseup", stopResize);
    }
    window.addEventListener("mousemove", doResize);
    window.addEventListener("mouseup", stopResize);
  }

  // Resizer de droite
  function startResizeRight(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightWidth;
    function doResize(moveEvent: MouseEvent) {
      const newWidth = startWidth - (moveEvent.clientX - startX);
      if (newWidth > 240 && newWidth < 600) setRightWidth(newWidth);
    }
    function stopResize() {
      window.removeEventListener("mousemove", doResize);
      window.removeEventListener("mouseup", stopResize);
    }
    window.addEventListener("mousemove", doResize);
    window.addEventListener("mouseup", stopResize);
  }

  // Actions
  function resetEditorState() {
    setPreviewDraft(null);
    setValidationErrors([]);
    setSaveStatus("idle");
    setFormKey(k => k + 1);
  }

  function selectProfile(profile: Profile) {
    if (!confirmDiscardIfDirty()) return;
    setSelectedProfileId(profile.id);
    setIsCreating(false);
    resetEditorState();
  }

  function startCreate() {
    if (!confirmDiscardIfDirty()) return;
    setSelectedProfileId(null);
    setIsCreating(true);
    resetEditorState();
  }

  function handleCancel() {
    if (!confirmDiscardIfDirty()) return;
    if (isCreating) { setSelectedProfileId(null); setIsCreating(false); }
    resetEditorState();
  }

    async function handleSave(draft: ProfileDraft) {
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
    
    // 1. Écriture IndexedDB
    await upsertProfile(profile);
    
    // 2. Notification immédiate du Store Zustand pour le badge de synchro
    await refreshLocalChanges();
    
    // Bypass de sécurité pour recharger proprement le nouveau brouillon de référence
    setPreviewDraft(null); 
    setSelectedProfileId(profile.id);
    setIsCreating(false);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }

    async function handleDuplicate(profile: Profile) {
    if (!confirmDiscardIfDirty()) return;
    const copy: Profile = {
      ...profile, id: crypto.randomUUID(),
      name: `${profile.name} (copy)`, source: "user",
      status: "local", author: profile.author ?? "User",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };

    // 1. Écriture IndexedDB
    await upsertProfile(copy);

    // 2. Notification du Store Zustand
    await refreshLocalChanges();

    setSelectedProfileId(copy.id);
    setIsCreating(false);
    resetEditorState();
  }

    async function handleDeleteConfirm() {
    if (deletingId === null) return;

    // 1. Écriture IndexedDB (Suppression)
    await dbDeleteProfile(deletingId);

    // 2. Notification du Store Zustand
    await refreshLocalChanges();

    if (selectedProfileId === deletingId) {
      setSelectedProfileId(null);
      setIsCreating(false);
      setPreviewDraft(null);
    }
    setDeletingId(null);
  }

  async function handleExport() {
    await exportProfilesForStandard(standard.manifest.id, availableProfiles, standard);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file === undefined) return;
    e.target.value = "";
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as Record<string, unknown>;
      const arr = raw["profiles"];
      if (Array.isArray(arr)) {
        const ids = new Set(availableProfiles.map((p: Profile) => p.id));
        let c = 0;
        for (const item of arr) {
          const parsed = ProfileSchema.safeParse(item);
          if (parsed.success && ids.has(parsed.data.id)) c++;
        }
        if (c > 0) { setPendingImport({ file, conflictCount: c }); return; }
      }
    } catch {}
    
    const result = await importProfilesForStandard(file, standard);
    setImportResult(result);
    
    // Notification du store
    await refreshLocalChanges();
    
    if (result.errors && result.errors.length > 0) {
      alert("⚠️ ERRORS :\n\n" + JSON.stringify(result.errors, null, 2));
    } else {
      alert("🎉 Successfully imported " + result.profilesImported + " profiles!");
    }
  }

  async function confirmImport() {
    if (pendingImport === null) return;
    const result = await importProfilesForStandard(pendingImport.file, standard);
    setImportResult(result);
    setPendingImport(null);

    // Notification du store
    await refreshLocalChanges();
  }

  const showEditor = isCreating || selectedProfile !== null;
  const editorTitle = previewDraft?.name || selectedProfile?.name || (isCreating ? "New Profile" : "");

  return (
    <div className="flex h-full select-none">

      {/* Panel 1: Profile list */}
      <div 
        style={{ width: `${leftWidth}px` }} 
        className="flex-shrink-0 flex flex-col border-r border-gray-200 bg-white overflow-hidden select-text"
      >
        <div className="flex-shrink-0 px-3 pt-3 pb-2 border-b border-gray-200 space-y-2">
          <button
            onClick={startCreate}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z"/></svg>
            New Profile
          </button>
          <div className="grid grid-cols-4 gap-1">
            <input ref={importInputRef} type="file" accept=".json" onChange={(e) => { void handleImportFile(e); }} className="hidden" />
            <button onClick={() => importInputRef.current?.click()} className="px-1 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors">Import</button>
            <button onClick={() => { void handleExport(); }} className="px-1 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors">Export</button>
            <button
              onClick={() => selectedProfile !== null && void handleDuplicate(selectedProfile)}
              disabled={selectedProfile === null}
              title="Duplicate selected"
              className="px-1 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >Dup.</button>
            <button
              onClick={() => selectedProfile !== null && setDeletingId(selectedProfile.id)}
              disabled={selectedProfile === null || selectedProfile.source === "builtin"}
              title={selectedProfile?.source === "builtin" ? "Builtin profiles cannot be deleted" : "Delete selected"}
              className="px-1 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >Del.</button>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search profiles…"
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {importResult !== null && (
          <div className="mx-3 mt-2 p-2 rounded border border-blue-200 bg-blue-50 text-xs text-blue-700 flex items-center justify-between flex-shrink-0">
            <span>Imported {importResult.profilesImported} profile{importResult.profilesImported !== 1 ? "s" : ""}.</span>
            <button onClick={() => setImportResult(null)} className="ml-2">✕</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {filteredProfiles.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <p className="text-sm text-gray-400">
                {availableProfiles.length === 0 ? "No profiles yet." : "No profiles match your search."}
              </p>
            </div>
          ) : (
            filteredProfiles.map((profile: Profile) => (
              <LibraryListItem
                key={profile.id}
                profile={profile}
                isSelected={selectedProfileId === profile.id}
                onClick={() => selectProfile(profile)}
              />
            ))
          )}
        </div>

        <div className="flex-shrink-0 px-4 py-2 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            {availableProfiles.length} profiles · {standard.manifest.label}
          </p>
        </div>
      </div>

      {/* LEFT DRAG BAR */}
      <div 
        onMouseDown={startResizeLeft} 
        className="w-1.5 bg-transparent hover:bg-blue-500/30 cursor-col-resize flex-shrink-0 transition-colors border-r border-gray-100" 
      />

      {/* Panel 2: Editor */}
      <div className="flex-1 min-w-0 flex flex-col bg-white overflow-hidden select-text">
        {showEditor ? (
          <>
            <div className="flex-shrink-0 px-6 py-3 bg-white border-b border-gray-200 flex items-center gap-4">
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
                  <span className="text-xs px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 rounded font-medium">Saved ✓</span>
                )}
                <button type="button" onClick={handleCancel} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                  Discard
                </button>
                <button type="submit" form="profile-form" disabled={saveStatus === "saving"} className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
                  {saveStatus === "saving" ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <ProfileForm
                key={`${selectedProfileId ?? "new"}-${formKey}`}
                standard={standard}
                initialDraft={formInitialDraft}
                submitLabel="Save"
                validationErrors={validationErrors}
                onSubmit={(draft) => { void handleSave(draft); }}
                onCancel={handleCancel}
                onChange={setPreviewDraft}
                hideActions
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
            <span className="text-6xl text-gray-200">◧</span>
            <div>
              <p className="text-base font-semibold text-gray-500">Select a profile to edit</p>
              <p className="text-sm text-gray-400 mt-1">or click <strong className="text-gray-600">New Profile</strong> to create one</p>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT DRAG BAR */}
      <div 
        onMouseDown={startResizeRight} 
        className="w-1.5 bg-transparent hover:bg-blue-500/30 cursor-col-resize flex-shrink-0 transition-colors border-l border-gray-100" 
      />

      {/* Panel 3: Live preview */}
      <div 
        style={{ width: `${rightWidth}px` }} 
        className="flex-shrink-0 flex flex-col bg-gray-50 overflow-hidden select-text"
      >
        <div className="flex-shrink-0 px-4 py-2 bg-white border-b border-gray-200 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Preview</span>
          {previewProfile !== null && (
            <div className="flex gap-0.5">
              {(["chart", "table", "fields"] as const).map(t => (
                <button key={t} onClick={() => setPreviewTab(t)}
                  className={`px-2 py-0.5 text-xs rounded capitalize transition-colors ${
                    previewTab === t ? "bg-gray-200 text-gray-900 font-medium" : "text-gray-400 hover:text-gray-700"
                  }`}>{t}</button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {previewProfile !== null ? (
            <PreviewPanel profile={previewProfile} schema={previewSchema} tab={previewTab} />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-gray-400 px-4 text-center leading-relaxed">
              Select or create a profile to see a live preview
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {deletingId !== null && (
        <DeleteConfirmDialog
          profileName={availableProfiles.find((p: Profile) => p.id === deletingId)?.name ?? ""}
          onConfirm={() => { void handleDeleteConfirm(); }}
          onCancel={() => setDeletingId(null)}
        />
      )}
      {pendingImport !== null && (
        <ImportOverwriteDialog
          conflictCount={pendingImport.conflictCount}
          onConfirm={() => { void confirmImport(); }}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composants secondaires inchangés (LibraryListItem, PreviewPanel, Dialogs, etc.)
// ---------------------------------------------------------------------------

function LibraryListItem({ profile, isSelected, onClick }: {
  profile: Profile;
  isSelected: boolean;
  onClick: () => void;
}) {
  const status = profile.status ?? "local";
  const statusConfig = {
    local: { dotColor: "bg-blue-500", textColor: "text-blue-600", label: "Local" },
    pending: { dotColor: "bg-amber-500", textColor: "text-amber-600", label: "Pending" },
    approved: { dotColor: "bg-green-500", textColor: "text-green-600", label: "Official" },
  };
  const currentStatus = statusConfig[status] ?? statusConfig.local;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${
        isSelected ? "bg-blue-50 border-l-2 border-l-blue-500 pl-3.5" : "hover:bg-gray-50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={`text-sm font-semibold truncate ${isSelected ? "text-blue-700" : "text-gray-900"}`}>
          {profile.name}
        </p>
        <span className={`flex items-center gap-1.5 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-gray-50 border border-gray-100 ${currentStatus.textColor}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${currentStatus.dotColor}`} />
          {currentStatus.label}
        </span>
      </div>
      {profile.description !== "" && (
        <p className="text-xs text-gray-400 truncate mt-0.5">{profile.description}</p>
      )}
      <div className="flex items-center justify-between mt-1 text-[11px] text-gray-400">
        <span>{profile.dataset?.length ?? 0} data points</span>
        {profile.author && profile.author !== "unknown" && (
          <span className="italic">by {profile.author}</span>
        )}
      </div>
    </button>
  );
}

function PreviewPanel({ profile, schema, tab }: {
  profile: Profile;
  schema: ProfileDefinition;
  tab: "chart" | "table" | "fields";
}) {
  // 1. Sécurise le premier check de dataset
  if (tab === "chart") {
    return (
      <div className="p-4">
        {(profile.dataset?.length ?? 0) === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">Dataset is empty — add rows to see the chart.</p>
        ) : (
          <TimeSeriesChart columns={schema?.datasetColumns ?? []} data={profile.dataset ?? []} fields={profile.fields} />
        )}
      </div>
    );
  }

  // 2. Sécurise le second check de dataset et de schema
  if (tab === "table") {
    const cols = schema?.datasetColumns?.filter(c => c.axis !== "none") ?? [];
    if ((profile.dataset?.length ?? 0) === 0) return <p className="text-xs text-gray-400 text-center py-8 px-4">No dataset rows.</p>;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-white border-b border-gray-200 sticky top-0">
            <tr>
              {cols.map(col => (
                <th key={col.key} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {col.label} <span className="font-normal ml-1 text-gray-300 normal-case">({col.unit})</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(profile.dataset ?? []).map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                {cols.map(col => (
                  <td key={col.key} className="px-3 py-1.5 font-mono text-gray-700 whitespace-nowrap">
                    {String(row[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // 3. Sécurise également l'accès aux fields du schéma
  const fieldsWithValues = (schema?.fields ?? []).filter(f => {
    const v = profile.fields?.[f.key];
    return v !== null && v !== undefined && v !== "";
  });
  if (fieldsWithValues.length === 0) return <p className="text-xs text-gray-400 text-center py-8 px-4">No metadata fields filled in.</p>;
  return (
    <div className="p-4 space-y-3">
      {fieldsWithValues.map(f => (
        <div key={f.key}>
          <p className="text-xs text-gray-400">{f.label}{f.unit ? ` (${f.unit})` : ""}</p>
          <p className="text-sm text-gray-800">{String(profile.fields?.[f.key] ?? "")}</p>
        </div>
      ))}
    </div>
  );
}

function DeleteConfirmDialog({ profileName, onConfirm, onCancel }: DeleteConfirmDialogProps) {
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

function ImportOverwriteDialog({ conflictCount, onConfirm, onCancel }: ImportOverwriteDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4">
        <h3 className="text-base font-semibold text-gray-900 mb-2">Overwrite existing profiles?</h3>
        <p className="text-sm text-gray-500 mb-5">
          The file contains <span className="font-medium text-gray-800">{conflictCount} profiles</span> that already exist.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700">Overwrite & Import</button>
        </div>
      </div>
    </div>
  );
}

function profileToDraft(profile: Profile, columns: StandardPlugin["profileSchema"]["datasetColumns"]): ProfileDraft {
  const datasetRows = profile.dataset.map((row) => {
    const stringRow: Record<string, string> = {};
    for (const col of columns) stringRow[col.key] = String(row[col.key] ?? "");
    return stringRow;
  });
  return {
    name: profile.name,
    description: profile.description,
    nodeId: profile.nodeId,
    standardId: profile.standardId,
    author: profile.author ?? "unknown",
    fields: { ...profile.fields },
    datasetRows,
  };
}

interface DeleteConfirmDialogProps { profileName: string; onConfirm: () => void; onCancel: () => void; }
interface ImportOverwriteDialogProps { conflictCount: number; onConfirm: () => void; onCancel: () => void; }
