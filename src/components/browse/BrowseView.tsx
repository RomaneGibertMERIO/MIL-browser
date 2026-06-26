import { useState } from 'react';
import type { RepoProfile } from '../../types';
import { getProfilesForNode } from '../../lib/treeBuilder';
import { RepoProfileView } from '../profile/RepoProfileView';
import { EmptyState } from '../ui/EmptyState';
import { Badge } from '../ui/Badge';

interface BrowseViewProps {
  allProfiles: ReadonlyArray<RepoProfile>;
  selectedNodePath: string[] | null;
}

export function BrowseView({ allProfiles, selectedNodePath }: BrowseViewProps) {
  const [selectedProfile, setSelectedProfile] = useState<RepoProfile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // ── No node selected ────────────────────────────────────────────────────
  if (selectedNodePath === null) {
    return (
      <EmptyState
        title="Select a category"
        message="Navigate the taxonomy tree on the left to browse test profiles."
        icon={
          <svg className="w-12 h-12" fill="none" viewBox="0 0 48 48" stroke="currentColor" strokeWidth={1}>
            <circle cx="12" cy="12" r="4" />
            <circle cx="36" cy="24" r="4" />
            <circle cx="12" cy="36" r="4" />
            <path d="M16 12h12M16 36h8M16 12v12" strokeLinecap="round" />
          </svg>
        }
      />
    );
  }

  // ── Profile detail view ──────────────────────────────────────────────────
  if (selectedProfile !== null) {
    return (
      <div>
        <button
          onClick={() => setSelectedProfile(null)}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium mb-5 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z" />
          </svg>
          Back to list
        </button>
        <RepoProfileView profile={selectedProfile} />
      </div>
    );
  }

  // ── Profile list ─────────────────────────────────────────────────────────
  const nodeProfiles = getProfilesForNode(selectedNodePath, allProfiles);
  const filtered =
    searchQuery.trim() === ''
      ? nodeProfiles
      : nodeProfiles.filter(
          (p) =>
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.taxonomyPath.some((l) => l.toLowerCase().includes(searchQuery.toLowerCase())),
        );

  return (
    <div>
      {/* ── Breadcrumb ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1 text-sm mb-5">
        {selectedNodePath.map((label, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-300 select-none">›</span>}
            <span
              className={
                i === selectedNodePath.length - 1
                  ? 'font-semibold text-gray-900'
                  : 'text-gray-400'
              }
            >
              {label}
            </span>
          </span>
        ))}
      </div>

      {/* ── Search ──────────────────────────────────────────────────── */}
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

      {/* ── Count ───────────────────────────────────────────────────── */}
      <p className="text-xs text-gray-400 mb-4">
        {filtered.length} profile{filtered.length !== 1 ? 's' : ''}
        {searchQuery.trim() !== '' && ` matching "${searchQuery}"`}
      </p>

      {/* ── Results ─────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No profiles found"
          message={
            nodeProfiles.length === 0
              ? 'This category has no profiles yet. Use the Library tab to create profiles.'
              : 'No profiles match your search query.'
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((profile) => (
            <button
              key={profile.id}
              onClick={() => setSelectedProfile(profile)}
              className="w-full text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-sm text-gray-900 group-hover:text-blue-700 transition-colors">
                      {profile.name}
                    </span>
                    <Badge variant={profile.source === 'builtin' ? 'blue' : 'gray'}>
                      {profile.source === 'builtin' ? 'Built-in' : 'User'}
                    </Badge>
                  </div>

                  {profile.description && (
                    <p className="text-sm text-gray-500 line-clamp-1 mb-2">
                      {profile.description}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-1">
                    {profile.taxonomyPath.map((label, i) => (
                      <span key={i} className="flex items-center gap-1">
                        {i > 0 && <span className="text-gray-300 text-xs select-none">›</span>}
                        <span className="text-xs text-gray-500">{label}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex-shrink-0 flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">
                    {profile.dataset.length} pts
                  </span>
                  <svg
                    className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z" />
                  </svg>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
