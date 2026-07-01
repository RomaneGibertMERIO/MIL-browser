/**
 * Root application component.
 *
 * Responsibilities:
 *  1. Invoke useBootstrap() to seed the database and restore navigation state.
 *  2. Gate rendering behind bootstrapStore.ready.
 *  3. Delegate to assistant or admin layout based on appStore.mode.
 *
 * This file imports ONLY from the new architecture (src/core/, src/features/,
 * src/shared/, src/store/, src/app/). Legacy code under src/components/,
 * src/hooks/, src/lib/, src/types/, src/sources/ is no longer referenced.
 */

import { useAppStore, type AdminView } from './store/appStore';
import { useBootstrapStore } from './store/bootstrapStore';
import { useBootstrap } from './shared/hooks/useBootstrap';
import { useStandard } from './shared/hooks/useStandards';
import { AssistantPage } from './features/assistant/AssistantPage';
import { BrowsePage } from './features/browse/BrowsePage';
import { LibraryPage } from './features/library/LibraryPage';
import { StandardsPage } from './features/standards/StandardsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { Sidebar } from './app/Sidebar';
import { LoadingSpinner } from './shared/components/ui/LoadingSpinner';
import { ErrorBanner } from './shared/components/ui/ErrorBanner';

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
  const adminView     = useAppStore((s) => s.adminView);
  const activeStdId   = useAppStore((s) => s.activeStandardId);
  const activeNode    = useAppStore((s) => s.activeNode);
  const setMode       = useAppStore((s) => s.setMode);
  const setActiveNode = useAppStore((s) => s.setActiveNode);

  const standard = useStandard(activeStdId ?? '');

  function handleNodeSelect(nodeId: string) {
    if (activeStdId === null) return;
    setActiveNode({ standardId: activeStdId, nodeId });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />

      {/* Header + content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Slim topbar */}
        <header className="flex-shrink-0 h-11 bg-white border-b border-gray-200 flex items-center px-5 gap-3">
          <span className="font-semibold text-gray-900 text-sm">MIL Browser</span>
          <span className="text-gray-200 select-none mx-1">|</span>
          <span className="text-sm text-blue-600 font-medium capitalize">
            {adminView}
          </span>
          <span className="ml-auto">
            <button
              onClick={() => setMode('assistant')}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors px-2 py-1 rounded hover:bg-gray-100"
            >
              ‹ Assistant
            </button>
          </span>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6">
          <ContentPane
            adminView={adminView}
            standard={standard}
            activeNodeId={activeNode?.nodeId ?? null}
            onNodeSelect={handleNodeSelect}
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
  adminView:    AdminView;
  standard:     ReturnType<typeof useStandard>;
  activeNodeId: string | null;
  onNodeSelect: (nodeId: string) => void;
}

function ContentPane({
  adminView,
  standard,
  activeNodeId,
  onNodeSelect,
}: ContentPaneProps) {
  if (adminView === 'browse') {
    if (standard === undefined) {
      return (
        <div className="flex items-center justify-center h-48 text-sm text-gray-400">
          Select a standard in the sidebar to start browsing.
        </div>
      );
    }
    return (
      <BrowsePage
        standard={standard}
        activeNodeId={activeNodeId}
        onNodeSelect={onNodeSelect}
      />
    );
  }

  if (adminView === 'library') {
    if (standard === undefined) {
      return (
        <div className="flex items-center justify-center h-48 text-sm text-gray-400">
          Select a standard in the sidebar to manage profiles.
        </div>
      );
    }
    return <LibraryPage standard={standard} />;
  }

  if (adminView === 'standards') return <StandardsPage />;
  if (adminView === 'settings') return <SettingsPage />;

  return null;
}
