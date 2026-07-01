/**
 * Standards management page (admin mode).
 *
 * Lists all loaded standards. Allows importing a new standard plugin from a
 * JSON file via loadStandardFromFile. Builtin standards cannot be deleted;
 * user-imported standards can be removed via deleteStandardAndProfiles.
 *
 * Import and delete are the only write operations here.
 */

import { useRef, useState } from "react";
import type { StandardPlugin } from "../../core/domain/standard";
import { loadStandardFromFile } from "../../core/engine/standardLoader";
import { deleteStandardAndProfiles } from "../../core/db/repositories/standards.repo";
import { useStandards } from "../../shared/hooks/useStandards";
import { Badge } from "../../shared/components/ui/Badge";
import { EmptyState } from "../../shared/components/ui/EmptyState";
import { LoadingSpinner } from "../../shared/components/ui/LoadingSpinner";
import { ErrorBanner } from "../../shared/components/ui/ErrorBanner";

// ---------------------------------------------------------------------------
// StandardsPage
// ---------------------------------------------------------------------------

export function StandardsPage() {
  const standards = useStandards();
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  if (standards === undefined) return <LoadingSpinner />;

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file === undefined) return;
    setImporting(true);
    setImportError(null);
    try {
      await loadStandardFromFile(file);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Failed to import standard.",
      );
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  async function handleDeleteConfirm() {
    if (deletingId === null) return;
    try {
      await deleteStandardAndProfiles(deletingId);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Failed to delete standard.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {deletingId !== null && (
        <StandardDeleteDialog
          standardLabel={
            standards.find((s) => s.manifest.id === deletingId)?.manifest.label ?? ""
          }
          onConfirm={() => { void handleDeleteConfirm(); }}
          onCancel={() => setDeletingId(null)}
        />
      )}

      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Standards</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {standards.length} standard{standards.length !== 1 ? "s" : ""} loaded
          </p>
        </div>
        <div className="flex items-center gap-2">
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
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {importing ? "Importing…" : "Import Standard"}
          </button>
        </div>
      </div>

      {importError !== null && (
        <ErrorBanner message={importError} onDismiss={() => setImportError(null)} />
      )}

      {standards.length === 0 ? (
        <EmptyState
          title="No standards"
          message="Import a standard JSON file to get started."
        />
      ) : (
        <div className="space-y-3">
          {standards.map((s) => (
            <StandardCard
              key={s.manifest.id}
              standard={s}
              onDelete={() => setDeletingId(s.manifest.id)}
            />
          ))}
        </div>
      )}

      <div className="mt-8 p-4 rounded-lg bg-blue-50 border border-blue-200">
        <h3 className="text-sm font-semibold text-blue-800 mb-1">
          Standard Plugin Format
        </h3>
        <p className="text-xs text-blue-700 leading-relaxed">
          Standards are loaded from JSON plugin files. Each plugin defines the
          standard manifest, taxonomy nodes, profile schema (fields and chart
          columns), and optional schema migration rules. Builtin standards are
          seeded from <code className="font-mono">public/standards/</code>.
        </p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// StandardCard
// ---------------------------------------------------------------------------

interface StandardCardProps {
  standard: StandardPlugin;
  onDelete: () => void;
}

function StandardCard({ standard, onDelete }: StandardCardProps) {
  const m = standard.manifest;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-sm text-gray-900">{m.label}</span>
            {m.isBuiltin && <Badge variant="blue">Built-in</Badge>}
            <Badge variant="gray">v{m.version}</Badge>
          </div>
          {m.description !== undefined && (
            <p className="text-sm text-gray-500 line-clamp-2 mb-2">{m.description}</p>
          )}
          <div className="flex flex-wrap gap-4 text-xs text-gray-400">
            <span>
              <span className="text-gray-600 font-medium">{standard.nodes.length}</span>{" "}
              nodes
            </span>
            <span>
              <span className="text-gray-600 font-medium">
                {standard.profileSchema.fields.length}
              </span>{" "}
              schema fields
            </span>
            {m.organization !== undefined && (
              <span>
                Org:{" "}
                <span className="text-gray-600 font-medium">{m.organization}</span>
              </span>
            )}
            <span className="font-mono">{m.id}</span>
          </div>
        </div>
        {!m.isBuiltin && (
          <button
            onClick={onDelete}
            className="flex-shrink-0 px-3 py-1 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StandardDeleteDialog
// ---------------------------------------------------------------------------

interface StandardDeleteDialogProps {
  standardLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function StandardDeleteDialog({
  standardLabel,
  onConfirm,
  onCancel,
}: StandardDeleteDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4">
        <h3 className="text-base font-semibold text-gray-900 mb-2">
          Remove standard?
        </h3>
        <p className="text-sm text-gray-500 mb-5">
          <span className="font-medium text-gray-800">{standardLabel}</span> and
          all user profiles belonging to it will be permanently deleted.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
