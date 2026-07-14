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
interface PendingRequest {
  id: string;
  name: string;
  author: string;
  date: string;
  standard: string;
}

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
// AdminValidationsPage — Dashboard (100% English & Typed)
// ---------------------------------------------------------------------------

function AdminValidationsPage() {
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([
    { id: "1", name: "Turbine M4 Vibration Profile", author: "Dupond", date: "2026-07-13", standard: "MIL-STD-810H" },
    { id: "2", name: "Upper Bearing Pyroshock", author: "Martin", date: "2026-07-12", standard: "MIL-STD-202G" },
  ]);

  const handleAccept = (id: string) => {
    alert(`Approval triggered! The file will be merged into the main branch.`);
    setPendingRequests(pendingRequests.filter((r: PendingRequest) => r.id !== id));
  };

  const handleReject = (id: string) => {
    alert(`Rejected. The corresponding feature branch will be deleted from the network directory.`);
    setPendingRequests(pendingRequests.filter((r: PendingRequest) => r.id !== id));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Pending Validation Requests</h2>
        <p className="text-sm text-gray-500">These profiles were submitted by the team and are waiting to be merged into the official repository.</p>
      </div>

      {pendingRequests.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
          🎉 No pending validation requests. Everything is synchronized!
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden shadow-sm">
          {pendingRequests.map((req: PendingRequest) => (
            <div key={req.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-gray-900">{req.name}</span>
                  <span className="text-[10px] bg-blue-50 text-blue-600 font-medium px-1.5 py-0.5 rounded border border-blue-100">
                    {req.standard}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Submitted by <span className="font-medium text-gray-600">{req.author}</span> on {req.date}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleReject(req.id)}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 border border-transparent rounded-lg transition-colors"
                >
                  Reject ❌
                </button>
                <button
                  onClick={() => handleAccept(req.id)}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
                >
                  Approve & Commit ✓
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
