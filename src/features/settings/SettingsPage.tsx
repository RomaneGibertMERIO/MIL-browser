/**
 * Settings page.
 *
 * Allows the user to configure application-level preferences:
 * - Active standard (which standard is selected in the sidebar)
 * - Git Repository Configuration (local network path for shared synchronization)
 * - Data management (import/export full database)
 *
 * All writes go through the settings repository (IndexedDB) and AppStore.
 */

import { useState, type FormEvent, useRef, useEffect } from "react";
import { useAppStore } from "../../store/appStore";
import type { AppSettings } from "../../core/domain/sync";
import { getSettings } from "../../core/db/repositories/settings.repo";
import {
  exportDatabase,
  importDatabase,
  type ImportResult,
} from "../../core/engine/importExportEngine";
import { useStandards } from "../../shared/hooks/useStandards";
import { Card } from "../../shared/components/ui/Card";
import { LoadingSpinner } from "../../shared/components/ui/LoadingSpinner";

import { saveGitRepoPath } from "../../core/db/repositories/settings.repo";

// ---------------------------------------------------------------------------
// SettingsPage
// ---------------------------------------------------------------------------
export function SettingsPage() {
  const standards = useStandards();

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // AppStore interactions for Git Repository Path
  const gitRepoPath = useAppStore((s) => s.gitRepoPath);
  const setGitRepoPath = useAppStore((s) => s.setGitRepoPath);
  const repoMode = useAppStore((s) => s.repoMode);
  const role = useAppStore((s) => s.role);
  const systemUsername = useAppStore((s) => s.systemUsername);
  const [localPathInput, setLocalPathInput] = useState(gitRepoPath);
  const [pathSaveSuccess, setPathSaveSuccess] = useState(false);

  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((s) => { if (!cancelled) setSettings(s); })
      .catch((err) => console.error("Lecture des reglages impossible :", err));
    return () => { cancelled = true; };
  }, []);

  if (settings === null || standards === undefined) return <LoadingSpinner />;

// Handler for saving the repository path
  function handlePathSave(e: FormEvent) {
    e.preventDefault();
    const cleanPath = localPathInput.trim();
    
    // 1. Mettre à jour l'état local dans le store Zustand
    setGitRepoPath(cleanPath);
    
    // 2. Persister définitivement le chemin dans IndexedDB
    void saveGitRepoPath(cleanPath).then(() => {
      setPathSaveSuccess(true);
      setTimeout(() => setPathSaveSuccess(false), 3000);
    });
  }

  async function handleExport() {
    await exportDatabase();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file === undefined) return;
    setImporting(true);

    const result = await importDatabase(file);
    setImportResult(result);
    setImporting(false);
    e.target.value = "";

    if (result.profilesImported > 0) {
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Settings</h2>

      {/* ── Git Central Repository Location Configuration ────────── */}
      <Card title="Git Network Repository Location">
        <form onSubmit={handlePathSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Central Repository Network Path (Absolute path, shareable across lab workstations)
            </label>
            <input
              type="text"
              value={localPathInput}
              onChange={(e) => setLocalPathInput(e.target.value)}
              placeholder="e.g., Z:/mil-browser-repo.git or /volumes/network/repo.git"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-gray-400">
              Modifying this path points your database synchronization actions to a relocated network drive folder.
            </p>
          </div>

          {pathSaveSuccess && (
            <p className="text-sm text-green-600 font-medium">
              Repository path updated successfully.
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
            >
              Update Path
            </button>
          </div>
        </form>
      </Card>

      {/* ── Rôle & accès ───────────────────────────────────────────────── */}
      {repoMode === "shared" && (
        <Card title="Your access">
          <div className="space-y-2 text-sm">
            <p className="text-gray-600">
              Connected as{" "}
              <span className="font-mono font-semibold text-gray-900">{systemUsername}</span> —{" "}
              role{" "}
              <span className="font-semibold text-indigo-700">{role}</span>
            </p>
            <p className="text-xs text-gray-400">
              {role === "admin"
                ? "You manage accounts and approve proposals (the “Accounts & Roles” tab)."
                : role === "testing"
                ? "You can create and push proposals. Approval is handled by administrators."
                : "Read-only access: you can only check the repository path. An administrator can broaden your permissions."}
            </p>
          </div>
        </Card>
      )}

      {/* ── Data Management ───────────────────────────────────────────── */}
      <Card title="Data Management">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">Export Database</p>
              <p className="text-xs text-gray-500">
                Download all user profiles and standards as a JSON backup.
              </p>
            </div>
            <button
              onClick={() => { void handleExport(); }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              Export
            </button>
          </div>

          <hr className="border-gray-100" />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">Import Database</p>
              <p className="text-xs text-gray-500">
                Restore from a previously exported JSON backup.
              </p>
            </div>
            <div>
              <input
                ref={importInputRef}
                type="file"
                accept=".json"
                onChange={(e) => { void handleImportFile(e); }}
                className="hidden"
              />
              <button
                onClick={() => importInputRef.current?.click()}
                disabled={importing}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                {importing ? "Importing…" : "Import"}
              </button>
            </div>
          </div>

          {importResult !== null && (
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
              Imported {importResult.profilesImported} profiles.
              {importResult.errors.length > 0 && (
                <span className="text-amber-700">
                  {" "}
                  {importResult.errors.length} error(s) — check console for details.
                </span>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* ── About ─────────────────────────────────────────────────────── */}
      <Card title="About">
        <div className="space-y-2 text-sm text-gray-500">
          <p>
            <span className="font-medium text-gray-700">Application</span>{" "}
            MIL-Browser — Environmental Testing Knowledge Base
          </p>
          <p>
            <span className="font-medium text-gray-700">Version</span>{" "}
            {__APP_VERSION__}
          </p>
          <p>
            <span className="font-medium text-gray-700">Standards loaded</span>{" "}
            {standards.length}
          </p>
          <p>
            <span className="font-medium text-gray-700">Architecture</span>{" "}
            IndexedDB · Zod · Zustand · Recharts
          </p>
        </div>
      </Card>
    </div>
  );
}
