import { useState } from 'react';
import type { AppView, AppMode } from './types';
import { useRepository } from './hooks/useRepository';
import { useTaxonomy } from './hooks/useTaxonomy';
import { useStandards } from './hooks/useStandards';
import { Sidebar } from './components/layout/Sidebar';
import { BrowseView } from './components/browse/BrowseView';
import { LibraryView } from './components/library/LibraryView';
import { TaxonomyManager } from './components/taxonomy/TaxonomyManager';
import { TestAssistant } from './components/assistant/TestAssistant';
import { LoadingSpinner } from './components/ui/LoadingSpinner';

// ---------------------------------------------------------------------------
// App — root component.
//
// Two modes:
//  • assistant (default) — guided wizard, no sidebar, full-screen.
//  • admin               — existing sidebar + content area for power users.
// ---------------------------------------------------------------------------

export default function App() {
  const repository = useRepository();
  const taxonomy = useTaxonomy();
  const { standards, isLoading: standardsLoading, error: standardsError } = useStandards();
  const [activeView, setActiveView] = useState<AppView>('browse');
  const [mode, setMode] = useState<AppMode>('assistant');
  const [selectedNodePath, setSelectedNodePath] = useState<string[] | null>(null);

  const isLoading = repository.isLoading || taxonomy.isLoading || standardsLoading;
  const error = repository.error ?? taxonomy.error ?? standardsError;

  function handleNodeSelect(path: string[]) {
    setSelectedNodePath(path);
    if (activeView !== 'browse') setActiveView('browse');
  }

  // ── Assistant mode ────────────────────────────────────────────────────────
  if (mode === 'assistant') {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-gray-50">
        <header className="flex-shrink-0 h-12 bg-white border-b border-gray-200 flex items-center px-5 gap-3">
          <svg className="w-5 h-5 text-blue-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
          </svg>
          <span className="font-semibold text-gray-900 text-sm tracking-tight">MIL Browser</span>
          <span className="ml-auto">
            <button
              onClick={() => setMode('admin')}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors px-2 py-1 rounded hover:bg-gray-100"
            >
              Administration ›
            </button>
          </span>
        </header>

        <main className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <LoadingSpinner />
            </div>
          ) : error ? (
            <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <strong>Error:</strong> {error}
            </div>
          ) : (
            <TestAssistant
              standards={standards}
              taxonomy={taxonomy}
              allProfiles={repository.allProfiles}
            />
          )}
        </main>
      </div>
    );
  }

  // ── Admin mode ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      <header className="flex-shrink-0 h-12 bg-white border-b border-gray-200 flex items-center px-5 gap-3">
        <svg className="w-5 h-5 text-blue-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
        </svg>
        <span className="font-semibold text-gray-900 text-sm tracking-tight">MIL Browser</span>
        <span className="text-gray-200 select-none">|</span>
        <span className="text-sm text-blue-600 font-medium">Administration</span>

        {activeView === 'browse' && selectedNodePath !== null && (
          <div className="ml-4 flex items-center gap-1 text-xs text-gray-400 min-w-0 overflow-hidden">
            {selectedNodePath.map((label, i) => (
              <span key={i} className="flex items-center gap-1 min-w-0">
                {i > 0 && <span className="flex-shrink-0">/</span>}
                <span className={`truncate ${i === selectedNodePath.length - 1 ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                  {label}
                </span>
              </span>
            ))}
          </div>
        )}

        <span className="ml-auto">
          <button
            onClick={() => setMode('assistant')}
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors px-2 py-1 rounded hover:bg-gray-100"
          >
            ‹ Back to Assistant
          </button>
        </span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {!isLoading && !error && (
          <Sidebar
            repository={repository}
            taxonomy={taxonomy}
            selectedNodePath={selectedNodePath}
            activeView={activeView}
            onNodeSelect={handleNodeSelect}
            onViewChange={setActiveView}
          />
        )}

        <main className="flex-1 overflow-y-auto px-6 py-6">
          {isLoading ? (
            <LoadingSpinner />
          ) : error ? (
            <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <strong>Error:</strong> {error}
            </div>
          ) : activeView === 'browse' ? (
            <BrowseView
              key={selectedNodePath?.join('/') ?? ''}
              allProfiles={repository.allProfiles}
              selectedNodePath={selectedNodePath}
            />
          ) : activeView === 'library' ? (
            <LibraryView
              repository={repository}
              taxonomyNodes={taxonomy.nodes}
              standards={standards}
            />
          ) : (
            <TaxonomyManager taxonomy={taxonomy} allProfiles={repository.allProfiles} />
          )}
        </main>
      </div>
    </div>
  );
}
