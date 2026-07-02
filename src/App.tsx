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
  const adminView   = useAppStore((s) => s.adminView);
  const activeStdId = useAppStore((s) => s.activeStandardId);
  const setMode     = useAppStore((s) => s.setMode);

  const standard = useStandard(activeStdId ?? '');

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
              : adminView}
          </span>
          <span className="ml-auto">
            <button
              onClick={() => setMode('assistant')}
              className="text-sm text-gray-400 hover:text-gray-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100 font-medium"
            >
              Browse Standards ↗
            </button>
          </span>
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

  return null;
}
