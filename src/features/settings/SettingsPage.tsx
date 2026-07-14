/**
 * Settings page.
 *
 * Allows the user to configure application-level preferences:
 * - Active standard (which standard is selected in the sidebar)
 * - Sync configuration (endpoint, token, enable/disable)
 * - Data management (import/export full database, clear user data)
 *
 * All writes go through the settings repository (IndexedDB).
 * The sync token is never logged or displayed after it's set.
 */

import { useState, type FormEvent } from "react";
import { useAppStore } from "../../store/appStore";
import type { AppSettings } from "../../core/domain/sync";
import { getSettings, saveSyncSettings } from "../../core/db/repositories/settings.repo";
import {
  exportDatabase,
  importDatabase,
  type ImportResult,
} from "../../core/engine/importExportEngine";
import { useStandards } from "../../shared/hooks/useStandards";
import { Card } from "../../shared/components/ui/Card";
import { ErrorBanner } from "../../shared/components/ui/ErrorBanner";
import { LoadingSpinner } from "../../shared/components/ui/LoadingSpinner";
import { useRef, useEffect } from "react";



// ---------------------------------------------------------------------------
// SettingsPage
// ---------------------------------------------------------------------------
export function SettingsPage() {
  const standards = useStandards();

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // <-- AppStore interactions for Git Repository Path
  const gitRepoPath = useAppStore((s) => s.gitRepoPath);
  const setGitRepoPath = useAppStore((s) => s.setGitRepoPath);
  const [localPathInput, setLocalPathInput] = useState(gitRepoPath);
  const [pathSaveSuccess, setPathSaveSuccess] = useState(false);

  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getSettings().then((s) => {
      setSettings(s);
      setSyncEnabled(s.sync.enabled);
      setEndpoint(s.sync.endpoint ?? "");
    });
  }, []);

  if (settings === null || standards === undefined) return <LoadingSpinner />;

  // Handler for saving the repository path
  function handlePathSave(e: FormEvent) {
    e.preventDefault();
    setGitRepoPath(localPathInput.trim());
    setPathSaveSuccess(true);
    setTimeout(() => setPathSaveSuccess(false), 3000);
  }

  async function handleSyncSave(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await saveSyncSettings({
        enabled: syncEnabled,
        endpoint: endpoint.trim() !== "" ? endpoint.trim() : undefined,
        token: tokenInput.trim() !== "" ? tokenInput.trim() : undefined,
        lastSyncAt: settings?.sync.lastSyncAt ?? null,
        cursor:     settings?.sync.cursor ?? null,
      });
      setSaveSuccess(true);
      setTokenInput("");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save settings.");
    }
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

  const lastSyncLabel =
    settings.sync.lastSyncAt !== null
      ? new Date(settings.sync.lastSyncAt).toLocaleString()
      : "Never";

  return (
    <div className="max-w-3xl space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Settings</h2>

      {/* ── NEW: Git Central Repository Location Configuration ────────── */}
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

      {/* ── Sync ──────────────────────────────────────────────────────── */}
      <Card title="Sync Configuration">
        <form onSubmit={(e) => { void handleSyncSave(e); }} className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">Enable Sync</p>
              <p className="text-xs text-gray-500">
                Push profile changes to a remote endpoint.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={syncEnabled}
              onClick={() => setSyncEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                syncEnabled ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  syncEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {syncEnabled && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Endpoint URL
                </label>
                <input
                  type="url"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="https://sync.example.com/api"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Bearer Token
                </label>
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Leave blank to keep existing token"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoComplete="new-password"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Token is stored encrypted and never displayed.
                </p>
              </div>
              <p className="text-xs text-gray-400">
                Last sync: <span className="text-gray-600">{lastSyncLabel}</span>
              </p>
            </>
          )}

          {saveError !== null && (
            <ErrorBanner message={saveError} onDismiss={() => setSaveError(null)} />
          )}
          {saveSuccess && (
            <p className="text-sm text-green-600 font-medium">
              Settings saved.
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
            >
              Save Sync Settings
            </button>
          </div>
        </form>
      </Card>

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
            2.0.0
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
