/**
 * Library feature page.
 *
 * Provides full CRUD for user-created profiles within a selected standard.
 * Reads are live via useLiveQuery. Writes go through the profile engine
 * (validation) then the profile repository (IndexedDB + sync event).
 *
 * Sub-views: list → create | edit. Delete is confirmed via inline state.
 */

import { useState, useRef } from "react";
import type { Profile, ProfileDraft } from "../../core/domain/profile";
import { ProfileSchema } from "../../core/domain/profile";
import type { StandardPlugin } from "../../core/domain/standard";
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
import { EmptyState } from "../../shared/components/ui/EmptyState";
import { Badge } from "../../shared/components/ui/Badge";
import { ProfileForm } from "./ProfileForm";
import { ProfileDetail } from "../profile/ProfileDetail";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LibrarySubView = "list" | "create" | "edit" | "detail";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LibraryPageProps {
  standard: StandardPlugin;
}

// ---------------------------------------------------------------------------
// LibraryPage
// ---------------------------------------------------------------------------

export function LibraryPage({ standard }: LibraryPageProps) {
  const [subView, setSubView] = useState<LibrarySubView>("list");
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [viewingProfile, setViewingProfile] = useState<Profile | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [search, setSearch] = useState("");
  const [pendingImport, setPendingImport] = useState<{ file: File; conflictCount: number } | null>(null);

  const importInputRef = useRef<HTMLInputElement>(null);

  const allProfiles = useProfilesByStandard(standard.manifest.id);
  const userProfiles = (allProfiles ?? []).filter((p) => p.source === "user");

  const filteredProfiles =
    search.trim() === ""
      ? userProfiles
      : userProfiles.filter(
          (p) =>
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.description.toLowerCase().includes(search.toLowerCase()),
        );

  // ── Create ───────────────────────────────────────────────────────────────
  async function handleCreate(draft: ProfileDraft) {
    const schema = getEffectiveSchema(standard, draft.nodeId);
    const profile = buildProfileFromDraft(draft, schema);
    const result = validateProfile(profile, schema);
    if (!result.valid) {
      setValidationErrors(result.errors);
      return;
    }
    setValidationErrors([]);
    await upsertProfile(profile);
    setSubView("list");
  }

  // ── Update ───────────────────────────────────────────────────────────────
  async function handleUpdate(draft: ProfileDraft) {
    if (editingProfile === null) return;
    const schema = getEffectiveSchema(standard, draft.nodeId);
    const profile = buildProfileFromDraft(
      draft,
      schema,
      editingProfile.id,
      editingProfile.createdAt,
    );
    const result = validateProfile(profile, schema);
    if (!result.valid) {
      setValidationErrors(result.errors);
      return;
    }
    setValidationErrors([]);
    await upsertProfile(profile);
    setEditingProfile(null);
    setSubView("list");
  }

  // ── Duplicate ─────────────────────────────────────────────────────────────
  async function handleDuplicate(profile: Profile) {
    const copy: Profile = {
      ...profile,
      id: crypto.randomUUID(),
      name: `${profile.name} (copy)`,
      source: "user",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await upsertProfile(copy);
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  async function handleDeleteConfirm() {
    if (deletingProfileId === null) return;
    await dbDeleteProfile(deletingProfileId);
    setDeletingProfileId(null);
  }

  // ── Export ───────────────────────────────────────────────────────────────
  async function handleExport() {
    await exportProfilesForStandard(
      standard.manifest.id,
      userProfiles,
      standard,
    );
  }

  // ── Import ───────────────────────────────────────────────────────────────
  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file === undefined) return;
    e.target.value = "";

    // Count conflicts before importing
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as Record<string, unknown>;
      const profilesArray = raw["profiles"];
      if (Array.isArray(profilesArray)) {
        const existingIds = new Set(userProfiles.map(p => p.id));
        let conflicts = 0;
        for (const item of profilesArray) {
          const parsed = ProfileSchema.safeParse(item);
          if (parsed.success && existingIds.has(parsed.data.id)) conflicts++;
        }
        if (conflicts > 0) {
          setPendingImport({ file, conflictCount: conflicts });
          return;
        }
      }
    } catch {
      // Ignore parse errors here; importProfilesForStandard will report them
    }

    const result = await importProfilesForStandard(file, standard);
    setImportResult(result);
  }

  async function confirmImport() {
    if (pendingImport === null) return;
    const result = await importProfilesForStandard(pendingImport.file, standard);
    setImportResult(result);
    setPendingImport(null);
  }

  // ── Sub-view: Detail ────────────────────────────────────────────────────
  if (subView === "detail" && viewingProfile !== null) {
    return (
      <ProfileDetail
        profile={viewingProfile}
        schema={getEffectiveSchema(standard, viewingProfile.nodeId)}
        onBack={() => {
          setViewingProfile(null);
          setSubView("list");
        }}
        backLabel="Back to Library"
      />
    );
  }

  // ── Sub-view: Create ─────────────────────────────────────────────────────
  if (subView === "create") {
    return (
      <div className="max-w-3xl">
        <SubViewHeader title="New Profile" onBack={() => setSubView("list")} />
        <ProfileForm
          standard={standard}
          initialDraft={null}
          submitLabel="Create Profile"
          validationErrors={validationErrors}
          onSubmit={(draft) => { void handleCreate(draft); }}
          onCancel={() => { setValidationErrors([]); setSubView("list"); }}
        />
      </div>
    );
  }

  // ── Sub-view: Edit ───────────────────────────────────────────────────────
  if (subView === "edit" && editingProfile !== null) {
    return (
      <div className="max-w-3xl">
        <SubViewHeader
          title="Edit Profile"
          onBack={() => {
            setEditingProfile(null);
            setValidationErrors([]);
            setSubView("list");
          }}
        />
        <ProfileForm
          standard={standard}
          initialDraft={profileToDraft(editingProfile, getEffectiveSchema(standard, editingProfile.nodeId).datasetColumns)}
          submitLabel="Save Changes"
          validationErrors={validationErrors}
          onSubmit={(draft) => { void handleUpdate(draft); }}
          onCancel={() => {
            setEditingProfile(null);
            setValidationErrors([]);
            setSubView("list");
          }}
        />
      </div>
    );
  }

  // ── Sub-view: List ───────────────────────────────────────────────────────
  return (
    <>
      {/* Import conflict confirmation overlay */}
      {pendingImport !== null && (
        <ImportOverwriteDialog
          conflictCount={pendingImport.conflictCount}
          onConfirm={() => { void confirmImport(); }}
          onCancel={() => setPendingImport(null)}
        />
      )}

      {/* Delete confirmation overlay */}
      {deletingProfileId !== null && (
        <DeleteConfirmDialog
          profileName={
            userProfiles.find((p) => p.id === deletingProfileId)?.name ?? ""
          }
          onConfirm={() => { void handleDeleteConfirm(); }}
          onCancel={() => setDeletingProfileId(null)}
        />
      )}

      {/* Import result banner */}
      {importResult !== null && (
        <div className="mb-4 p-3 rounded-lg border border-blue-200 bg-blue-50 text-sm text-blue-700">
          Imported {importResult.profilesImported} profiles.
          {importResult.errors.length > 0 && (
            <span className="text-amber-700">
              {" "}
              {importResult.errors.length} error(s).
            </span>
          )}
          <button
            onClick={() => setImportResult(null)}
            className="ml-2 text-blue-500 hover:text-blue-700"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Profile Library</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {userProfiles.length} user profile{userProfiles.length !== 1 ? "s" : ""}
            {" · "}
            {standard.manifest.label}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            onChange={(e) => { void handleImportFile(e); }}
            className="hidden"
          />
          <button
            onClick={() => importInputRef.current?.click()}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            Import
          </button>
          <button
            onClick={() => { void handleExport(); }}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            Export
          </button>
          <button
            onClick={() => setSubView("create")}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
          >
            + New Profile
          </button>
        </div>
      </div>

      <div className="relative mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or description…"
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {filteredProfiles.length === 0 ? (
        <EmptyState
          title="No user profiles"
          message='Create your first profile using the "New Profile" button above.'
        />
      ) : (
        <div className="space-y-3">
          {filteredProfiles.map((profile) => (
            <ProfileListRow
              key={profile.id}
              profile={profile}
              onView={() => { setViewingProfile(profile); setSubView("detail"); }}
              onEdit={() => { setEditingProfile(profile); setSubView("edit"); }}
              onDuplicate={() => { void handleDuplicate(profile); }}
              onDelete={() => setDeletingProfileId(profile.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SubViewHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z" />
        </svg>
        Back
      </button>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
    </div>
  );
}

interface ProfileListRowProps {
  profile: Profile;
  onView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function ProfileListRow({ profile, onView, onEdit, onDuplicate, onDelete }: ProfileListRowProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <button
            onClick={onView}
            className="text-sm font-semibold text-gray-900 hover:text-blue-700 transition-colors text-left"
          >
            {profile.name}
          </button>
          {profile.description !== "" && (
            <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">
              {profile.description}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="gray">
              {profile.dataset.length} data point{profile.dataset.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={onEdit}
            className="px-3 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onDuplicate}
            className="px-3 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
          >
            Duplicate
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

interface DeleteConfirmDialogProps {
  profileName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmDialog({
  profileName,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4">
        <h3 className="text-base font-semibold text-gray-900 mb-2">
          Delete profile?
        </h3>
        <p className="text-sm text-gray-500 mb-5">
          <span className="font-medium text-gray-800">{profileName}</span> will
          be permanently deleted. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ImportOverwriteDialog
// ---------------------------------------------------------------------------

interface ImportOverwriteDialogProps {
  conflictCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function ImportOverwriteDialog({ conflictCount, onConfirm, onCancel }: ImportOverwriteDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4">
        <h3 className="text-base font-semibold text-gray-900 mb-2">
          Overwrite existing profiles?
        </h3>
        <p className="text-sm text-gray-500 mb-5">
          The import file contains{" "}
          <span className="font-medium text-gray-800">{conflictCount} profile{conflictCount !== 1 ? "s" : ""}</span>{" "}
          that already exist in your library. Proceeding will overwrite them with the imported versions.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 transition-colors"
          >
            Overwrite & Import
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// profileToDraft — converts a stored Profile back into a draft for editing
// ---------------------------------------------------------------------------

function profileToDraft(
  profile: Profile,
  columns: StandardPlugin["profileSchema"]["datasetColumns"],
): ProfileDraft {
  const datasetRows = profile.dataset.map((row) => {
    const stringRow: Record<string, string> = {};
    for (const col of columns) {
      stringRow[col.key] = String(row[col.key] ?? "");
    }
    return stringRow;
  });

  return {
    name: profile.name,
    description: profile.description,
    nodeId: profile.nodeId,
    standardId: profile.standardId,
    fields: { ...profile.fields },
    datasetRows,
  };
}
