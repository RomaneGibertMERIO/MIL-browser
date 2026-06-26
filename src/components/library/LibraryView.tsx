import { useState } from "react";
import type {
  RepoProfile,
  ProfileDraft,
  TaxonomyNode,
  DataPointDraft,
  Standard,
} from "../../types";
import type { UseRepositoryResult } from "../../hooks/useRepository";
import { ProfileList } from "./ProfileList";
import { ProfileForm } from "./ProfileForm";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { exportProfiles } from "../../lib/repositoryStorage";

type SubView = "list" | "create" | "edit";

interface LibraryViewProps {
  repository: UseRepositoryResult;
  taxonomyNodes: ReadonlyArray<TaxonomyNode>;
  standards: ReadonlyArray<Standard>;
}

function profileToDraft(profile: RepoProfile): ProfileDraft {
  return {
    name: profile.name,
    description: profile.description,
    standardId: profile.standardId,
    conditionType: profile.conditionType,
    taxonomyPath: [...profile.taxonomyPath],
    dataset: profile.dataset.map(
      (dp, i): DataPointDraft => ({
        id: `row_${i}`,
        time: dp.time,
        temp_c: String(dp.temp_c),
        rh_percent: String(dp.rh_percent),
      })
    ),
  };
}

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
        <svg
          className="w-4 h-4"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z" />
        </svg>
        Back
      </button>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
    </div>
  );
}

export function LibraryView({
  repository,
  taxonomyNodes,
  standards,
}: LibraryViewProps) {
  const [subView, setSubView] = useState<SubView>("list");
  const [editingProfile, setEditingProfile] = useState<RepoProfile | null>(
    null
  );
  const [deletingProfile, setDeletingProfile] = useState<RepoProfile | null>(
    null
  );
  const [search, setSearch] = useState("");

  const { userProfiles } = repository;

  const filteredProfiles =
    search.trim() === ""
      ? userProfiles
      : userProfiles.filter(
          (p) =>
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.description.toLowerCase().includes(search.toLowerCase()) ||
            p.taxonomyPath.some((l) =>
              l.toLowerCase().includes(search.toLowerCase())
            )
        );

  // ── Create ──────────────────────────────────────────────────────────────
  if (subView === "create") {
    return (
      <div className="max-w-3xl">
        <SubViewHeader title="New Profile" onBack={() => setSubView("list")} />
        <ProfileForm
          taxonomyNodes={taxonomyNodes}
          standards={standards}
          initialDraft={null}
          submitLabel="Create Profile"
          onSubmit={(draft) => {
            repository.createProfile(draft);
            setSubView("list");
          }}
          onCancel={() => setSubView("list")}
        />
      </div>
    );
  }

  // ── Edit ─────────────────────────────────────────────────────────────────
  if (subView === "edit" && editingProfile !== null) {
    return (
      <div className="max-w-3xl">
        <SubViewHeader
          title="Edit Profile"
          onBack={() => {
            setSubView("list");
            setEditingProfile(null);
          }}
        />
        <ProfileForm
          taxonomyNodes={taxonomyNodes}
          standards={standards}
          initialDraft={profileToDraft(editingProfile)}
          submitLabel="Save Changes"
          onSubmit={(draft) => {
            repository.updateProfile(editingProfile.id, draft);
            setSubView("list");
            setEditingProfile(null);
          }}
          onCancel={() => {
            setSubView("list");
            setEditingProfile(null);
          }}
        />
      </div>
    );
  }

  // ── List ─────────────────────────────────────────────────────────────────
  return (
    <>
      {deletingProfile !== null && (
        <DeleteConfirmDialog
          profileName={deletingProfile.name}
          onConfirm={() => {
            repository.deleteProfile(deletingProfile.id);
            setDeletingProfile(null);
          }}
          onCancel={() => setDeletingProfile(null)}
        />
      )}

      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Profile Library
          </h2>

          <p className="text-sm text-gray-400 mt-0.5">
            {userProfiles.length} user profile
            {userProfiles.length !== 1 ? "s" : ""}
            {" · "}
            Visible in Browse immediately after creation
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => exportProfiles(userProfiles)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            Export Profiles
          </button>

          <button
            onClick={() => setSubView("create")}
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
            New Profile
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.099zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, description or taxonomy…"
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <ProfileList
        profiles={filteredProfiles}
        onEdit={(profile) => {
          setEditingProfile(profile);
          setSubView("edit");
        }}
        onDelete={setDeletingProfile}
      />
    </>
  );
}
