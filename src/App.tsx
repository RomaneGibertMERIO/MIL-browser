/**
 * Root application component.
 *
 * Responsibilities:
 * 1. Invoke useBootstrap() to seed the database and restore navigation state.
 * 2. Gate rendering behind bootstrapStore.ready.
 * 3. Delegate to assistant or admin layout based on appStore.mode.
 *
 * This file imports ONLY from the new architecture (src/core/, src/features/,
 * src/shared/, src/store/, src/app/). Legacy code under src/components/,
 * src/hooks/, src/lib/, src/types/, src/sources/ is no longer referenced.
 */

import { useState, useEffect } from 'react'; // <-- MODIFIED: Added useEffect import
import { useAppStore, type AdminView } from './store/appStore';
import { useBootstrapStore } from './store/bootstrapStore';
import { useBootstrap } from './shared/hooks/useBootstrap';
import { useStandard } from './shared/hooks/useStandards';
import { AssistantPage } from './features/assistant/AssistantPage';
import { LibraryPage } from './features/library/LibraryPage';
import { StandardsPage } from './features/standards/StandardsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { Sidebar } from './app/Sidebar';
import { LoadingSpinner } from './shared/components/ui/LoadingSpinner';
import { ErrorBanner } from './shared/components/ui/ErrorBanner';

// Interface for typings
/*interface PendingRequest {
  id: string;
  name: string;
  author: string;
  date: string;
  standard: string;
}*/

// Global window declaration for Electron safety
declare global {
  interface Window {
    electronAPI?: {
      getSystemUsername: () => Promise<string>;
    };
  }
}

// ---------------------------------------------------------------------------
// App — root component.
// ---------------------------------------------------------------------------

export default function App() {
  useBootstrap();

  const ready = useBootstrapStore((s) => s.ready);
  const error = useBootstrapStore((s) => s.error);
  const mode  = useAppStore((s) => s.mode);

  if (error !== null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <ErrorBanner message={error} />
        </div>
      </div>
    );
  }

  if (!ready) return <LoadingSpinner />;

  if (mode === 'assistant') return <AssistantPage />;

  return <AdminLayout />;
}

// ---------------------------------------------------------------------------
// AdminLayout — sidebar + content pane
// ---------------------------------------------------------------------------

function AdminLayout() {
  const adminView   = useAppStore((s) => s.adminView);
  const activeStdId = useAppStore((s) => s.activeStandardId);
  const setMode     = useAppStore((s) => s.setMode);

  // <-- MODIFIED: Pull dynamic state from the Zustand appStore
  const gitRepoPath = useAppStore((s) => s.gitRepoPath);
  const systemUsername = useAppStore((s) => s.systemUsername);
  const setSystemUsername = useAppStore((s) => s.setSystemUsername);

  const standard = useStandard(activeStdId ?? '');

  // <-- MODIFIED: Retrieve genuine OS username via IPC Bridge on mount
  useEffect(() => {
    if (window.electronAPI?.getSystemUsername) {
      window.electronAPI
        .getSystemUsername()
        .then((username) => {
          setSystemUsername(username);
        })
        .catch((err) => {
          console.error("Failed to fetch OS username", err);
          setSystemUsername("Error-Session");
        });
    } else {
      setSystemUsername("Browser-Session"); // Fallback for pure React development
    }
  }, [setSystemUsername]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />

      {/* Header + content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex-shrink-0 h-13 bg-white border-b border-gray-200 flex items-center px-6 gap-4">
          <span className="font-bold text-gray-900 text-base tracking-tight">MIL Browser</span>
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-300 rounded-md">
            MANAGEMENT
          </span>
          <span className="text-gray-200 select-none mx-1">|</span>
          <span className="text-sm text-blue-600 font-semibold capitalize">
            {adminView === 'library' ? 'Library'
              : adminView === 'standards' ? 'Standards'
              : adminView === 'settings' ? 'Settings'
              : adminView === 'validations' ? 'Pending Validations'
              : adminView}
          </span>
          
          {/* Dynamic User network info section */}
          <div className="ml-auto flex items-center gap-4">
            <div className="text-right select-none">
              <p className="text-xs font-semibold text-gray-700">👤 Session: {systemUsername}</p>
              <p className="text-[10px] text-gray-400 font-mono">Repo: {gitRepoPath}</p>
            </div>
            
            <button
              onClick={() => setMode('assistant')}
              className="text-sm text-gray-400 hover:text-gray-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100 font-medium"
            >
              Browse Standards ↗
            </button>
          </div>
        </header>

        <main className={adminView === 'library' ? 'flex-1 overflow-hidden' : 'flex-1 overflow-y-auto px-6 py-6'}>
          <ContentPane
            adminView={adminView}
            standard={standard}
          />
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContentPane — routes adminView to the correct feature page
// ---------------------------------------------------------------------------

interface ContentPaneProps {
  adminView: AdminView;
  standard:  ReturnType<typeof useStandard>;
}

function ContentPane({ adminView, standard }: ContentPaneProps) {
  const setMode = useAppStore((s) => s.setMode);

  if (adminView === 'browse') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <p className="text-gray-500 text-sm">The Standards Browser is in full-screen Browse mode.</p>
        <button
          onClick={() => setMode('assistant')}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          Open Standards Browser ↗
        </button>
      </div>
    );
  }

  if (adminView === 'library') {
    if (standard === undefined) {
      return (
        <div className="flex items-center justify-center h-full text-sm text-gray-400">
          Select a standard in the sidebar to manage profiles.
        </div>
      );
    }
    return <LibraryPage standard={standard} />;
  }

  if (adminView === 'standards') return <StandardsPage />;
  if (adminView === 'settings') return <SettingsPage />;
  if (adminView === 'validations') return <AdminValidationsPage />;

  return null;
}

// ---------------------------------------------------------------------------
// AdminValidationsPage — Split screen inspect & diff panel
// ---------------------------------------------------------------------------

export function AdminValidationsPage() {
  const pendingCommits = useAppStore((s) => s.pendingCommits);
  const resolveCommit = useAppStore((s) => s.resolveCommit);

  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(
    pendingCommits.length > 0 ? pendingCommits[0].id : null
  );

  const activeCommit = pendingCommits.find((c) => c.id === selectedCommitId);

  const handleApprove = (id: string) => {
    alert("Approved! The local staged metadata has been successfully merged into the core schema branch.");
    resolveCommit(id);
    setSelectedCommitId(null);
  };

  const handleReject = (id: string) => {
    alert("Rejected. The branch will be dropped and modifications discarded.");
    resolveCommit(id);
    setSelectedCommitId(null);
  };

  return (
    <div className="h-full flex flex-col space-y-4 max-w-6xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Repository Validation Dashboard</h2>
        <p className="text-sm text-gray-500">
          Review, diff-check, and merge user contributions into the official library repository.
        </p>
      </div>

      {pendingCommits.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          🎉 No pending validation requests. Everything is synchronized!
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-6 min-h-[500px]">
          {/* LEFT: Commits Queue */}
          <div className="md:col-span-2 space-y-3 overflow-y-auto pr-1">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Queue</span>
            <div className="space-y-2">
              {pendingCommits.map((commit) => {
                const isActive = commit.id === selectedCommitId;
                return (
                  <div
                    key={commit.id}
                    onClick={() => setSelectedCommitId(commit.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer text-left ${
                      isActive
                        ? "bg-blue-50/50 border-blue-400 shadow-xs ring-1 ring-blue-400"
                        : "bg-white border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-gray-400">👤 {commit.author}</span>
                      <span className="text-xs text-gray-400">{commit.date}</span>
                    </div>
                    <h4 className="font-semibold text-sm text-gray-900 line-clamp-1">{commit.commitMessage}</h4>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {commit.changes.length} change(s)
                      </span>
                      {isActive && <span className="text-xs text-blue-600 font-medium">Viewing details →</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Detail View with Diff Inspector */}
          <div className="md:col-span-3 flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xs">
            {activeCommit ? (
              <div className="flex flex-col h-full divide-y divide-gray-100">
                {/* Header info */}
                <div className="p-5 flex items-start justify-between bg-gray-50/50">
                  <div className="space-y-1">
                    <span className="text-[10px] bg-indigo-100 border border-indigo-200 text-indigo-700 font-semibold px-2 py-0.5 rounded">
                      COMMIT ID: {activeCommit.id}
                    </span>
                    <h3 className="font-bold text-gray-900 text-base">{activeCommit.commitMessage}</h3>
                    <p className="text-xs text-gray-400">
                      Author: <span className="font-medium text-gray-600">{activeCommit.author}</span> · Date: {activeCommit.date}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleReject(activeCommit.id)}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 border border-transparent rounded-lg transition-colors"
                    >
                      Reject ❌
                    </button>
                    <button
                      onClick={() => handleApprove(activeCommit.id)}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
                    >
                      Merge & Commit ✓
                    </button>
                  </div>
                </div>

                {/* Inspecting Staged Items */}
                <div className="p-5 overflow-y-auto space-y-6 flex-1">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Proposed Changes</span>
                  {activeCommit.changes.map((change) => (
                    <div key={change.id} className="border border-gray-100 rounded-lg overflow-hidden">
                      {/* Sub-header of item */}
                      <div className="p-3 bg-gray-50 flex items-center justify-between border-b border-gray-100">
                        <div>
                          <p className="text-xs font-semibold text-gray-800">{change.name}</p>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5">{change.location}</p>
                        </div>
                        <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 font-semibold px-2 py-0.5 rounded capitalize">
                          {change.type} / {change.action}
                        </span>
                      </div>

                      {/* Diff Details Content */}
                      <div className="p-4 space-y-4">
                        {change.action === "Created" && (
                          <div className="bg-green-50/50 text-green-800 text-xs p-3 rounded-lg border border-green-100 space-y-1">
                            <span className="font-bold">✓ Complete Addition Proposal:</span>
                            <pre className="font-mono text-[11px] text-gray-600 overflow-x-auto p-2 bg-white rounded border border-gray-100 mt-2">
                              {JSON.stringify(change.proposedData, null, 2)}
                            </pre>
                          </div>
                        )}

                        {change.action === "Deleted" && (
                          <div className="bg-red-50/50 text-red-800 text-xs p-3 rounded-lg border border-red-100 font-medium">
                            🚨 Request to permanently delete this taxonomy node and all its child components from the core network.
                          </div>
                        )}

                        {change.action === "Modified" && change.originalData && change.proposedData && (
                          <div className="space-y-3">
                            <span className="text-xs text-gray-500 font-semibold">Side-By-Side Property Diff:</span>
                            <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100 text-xs">
                              {/* Headers */}
                              <div className="grid grid-cols-3 bg-gray-50 font-semibold text-gray-600 p-2.5">
                                <div>Property</div>
                                <div>Active Repo (Original)</div>
                                <div>Staged contribution</div>
                              </div>

                              {/* Duration Diff row */}
                              {change.originalData.duration !== change.proposedData.duration && (
                                <div className="grid grid-cols-3 p-2.5 bg-yellow-50/20">
                                  <div className="font-medium text-gray-500">Duration (min)</div>
                                  <div className="line-through text-red-600 font-mono">{change.originalData.duration}</div>
                                  <div className="text-emerald-700 font-semibold font-mono">{change.proposedData.duration}</div>
                                </div>
                              )}

                              {/* rmsVertical row */}
                              {change.originalData.rmsVertical !== change.proposedData.rmsVertical && (
                                <div className="grid grid-cols-3 p-2.5 bg-yellow-50/20">
                                  <div className="font-medium text-gray-500">rmsVertical (g)</div>
                                  <div className="line-through text-red-600 font-mono">{change.originalData.rmsVertical}</div>
                                  <div className="text-emerald-700 font-semibold font-mono">{change.proposedData.rmsVertical}</div>
                                </div>
                              )}

                              {/* Notes row */}
                              {change.originalData.notes !== change.proposedData.notes && (
                                <div className="grid grid-cols-3 p-2.5 bg-yellow-50/20">
                                  <div className="font-medium text-gray-500">Explanatory Notes</div>
                                  <div className="text-red-500/80 italic">{change.originalData.notes}</div>
                                  <div className="text-emerald-700 font-semibold">{change.proposedData.notes}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                Select a submit request from the left list to inspect differences.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
