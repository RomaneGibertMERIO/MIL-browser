import type { RepoProfile } from "../../types";
import { EmptyState } from "../ui/EmptyState";

interface ProfileListProps {
  profiles: ReadonlyArray<RepoProfile>;
  onEdit: (profile: RepoProfile) => void;
  onDelete: (profile: RepoProfile) => void;
}

export function ProfileList({ profiles, onEdit, onDelete }: ProfileListProps) {
  if (profiles.length === 0) {
    return (
      <EmptyState
        title="No profiles yet"
        message="Create your first profile using the 'New Profile' button above."
      />
    );
  }

  return (
    <div className="space-y-3">
      {profiles.map((profile) => (
        <div
          key={profile.id}
          className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
        >
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                {profile.name}
              </h3>

              {profile.description && (
                <p className="text-sm text-gray-500 line-clamp-1 mb-2">
                  {profile.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-1 mb-2">
                {profile.taxonomyPath.map((label, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && (
                      <span className="text-gray-300 text-xs select-none">
                        ›
                      </span>
                    )}
                    <span className="text-xs text-gray-500">{label}</span>
                  </span>
                ))}
              </div>

              <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">
                {profile.dataset.length} data point
                {profile.dataset.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => onEdit(profile)}
                className="px-3 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => onDelete(profile)}
                className="px-3 py-1 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
