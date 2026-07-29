/**
 * Browse feature page.
 *
 * Displays a filterable list of profiles for the selected taxonomy node.
 * Profiles are fetched live from IndexedDB and filtered client-side.
 *
 * The selected node is resolved from the store (standardId + nodeId).
 * Profile detail is shown inline by toggling a selectedProfile state.
 *
 * Design: all profile filtering uses nodeId (stable) not labels.
 * The node label is displayed in the UI but never used for filtering.
 */

import { useState, useMemo } from "react";
import type { Profile } from "../../core/domain/profile";
import type { StandardPlugin } from "../../core/domain/standard";
import type { TaxonomyNodeItem } from "../../core/domain/tree";
import { getProfilesForNode } from "../../core/engine/treeBuilder";
import { buildTree } from "../../core/engine/treeBuilder";
import { useProfilesByStandard } from "../../shared/hooks/useProfiles";
import { Badge } from "../../shared/components/ui/Badge";
import { EmptyState } from "../../shared/components/ui/EmptyState";
import { ProfileDetail } from "../profile/ProfileDetail";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BrowsePageProps {
  standard: StandardPlugin;
  activeNodeId: string | null;
  onNodeSelect: (nodeId: string) => void;
}

// ---------------------------------------------------------------------------
// BrowsePage
// ---------------------------------------------------------------------------

export function BrowsePage({ standard, activeNodeId, onNodeSelect }: BrowsePageProps) {
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const allProfiles = useProfilesByStandard(standard.manifest.id);

  // Build the tree with profile presence flags.
  const tree = useMemo(
    () => buildTree(standard.nodes, allProfiles ?? []),
    [standard.nodes, allProfiles],
  );

  // Find the active node in the tree.
  const activeNode = useMemo(
    () => (activeNodeId !== null ? findNode(tree, activeNodeId) : null),
    [tree, activeNodeId],
  );

  if (selectedProfile !== null) {
    return (
      <ProfileDetail
        profile={selectedProfile}
        schema={standard.profileSchema}
        onBack={() => setSelectedProfile(null)}
        backLabel="Back to list"
      />
    );
  }

  if (activeNode === null) {
    return (
      <EmptyState
        title="Select a category"
        message="Navigate the taxonomy tree on the left to browse test profiles."
      />
    );
  }

  const nodeProfiles = getProfilesForNode(activeNode, allProfiles ?? []);

  const filtered =
    searchQuery.trim() === ""
      ? nodeProfiles
      : nodeProfiles.filter(
          (p) =>
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.description.toLowerCase().includes(searchQuery.toLowerCase()),
        );

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-sm mb-5">
        {activeNode.path.map((label, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-300 select-none">›</span>}
            <span
              className={
                i === activeNode.path.length - 1
                  ? "font-semibold text-gray-900"
                  : "text-gray-400"
              }
            >
              {label}
            </span>
          </span>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.099zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search profiles…"
          className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <p className="text-xs text-gray-400 mb-4">
        {filtered.length} profile{filtered.length !== 1 ? "s" : ""}
        {searchQuery.trim() !== "" && ` matching "${searchQuery}"`}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title="No profiles found"
          message={
            nodeProfiles.length === 0
              ? "This category has no profiles yet. Use the Library tab to create profiles."
              : "No profiles match your search query."
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((profile) => (
            <ProfileListItem
              key={profile.id}
              profile={profile}
              onSelect={setSelectedProfile}
            />
          ))}
        </div>
      )}
    </div>
  );

  // onNodeSelect is passed to TaxonomyTree in the parent layout — unused here
  void onNodeSelect;
}

// ---------------------------------------------------------------------------
// ProfileListItem
// ---------------------------------------------------------------------------

interface ProfileListItemProps {
  profile: Profile;
  onSelect: (profile: Profile) => void;
}

function ProfileListItem({ profile, onSelect }: ProfileListItemProps) {
  let badgeLabel = "Local";
  let badgeColor: "blue" | "gray" = "gray";

  // 1. On vérifie d'abord si le profil est officiellement approuvé
  if (profile.status === "approved") {
    badgeLabel = "Official";
    badgeColor = "blue";
  } 
  // 2. On vérifie ensuite s'il est en attente de validation
  else if (profile.status === "pending") {
    badgeLabel = "Pending";
    badgeColor = "gray";
  } 
  // 3. S'il s'agit d'un profil intégré d'origine (builtin)
  else if (profile.source === "builtin") {
    badgeLabel = "Built-in";
    badgeColor = "gray";
  } 
  // 4. Par défaut, le profil est considéré comme "Local"
  else {
    badgeLabel = "Local";
    badgeColor = "gray";
  }

  return (
    <button
      onClick={() => onSelect(profile)}
      className="w-full text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-sm text-gray-900 group-hover:text-blue-700 transition-colors">
              {profile.name}
            </span>
            <Badge variant={badgeColor}>
              {badgeLabel}
            </Badge>
            {profile.author && (
              <span className="text-xs text-gray-400">
                par {profile.author}
              </span>
            )}
          </div>
          {profile.description !== "" && (
            <p className="text-sm text-gray-500 line-clamp-1">
              {profile.description}
            </p>
          )}
        </div>
        <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full flex-shrink-0">
          {profile.dataset?.length || 0} pts
        </span>
      </div>
    </button>
  );
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findNode(
  tree: TaxonomyNodeItem[],
  nodeId: string,
): TaxonomyNodeItem | null {
  for (const node of tree) {
    if (node.id === nodeId) return node;
    const found = findNode(node.children, nodeId);
    if (found !== null) return found;
  }
  return null;
}
