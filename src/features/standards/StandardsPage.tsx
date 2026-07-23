/**
 * Standards management page (admin mode).
 *
 * Lists all loaded standards.
 * Allows: import from JSON, create new, edit taxonomy, delete (user standards).
 */

import { useRef, useState } from "react";
import type { StandardPlugin, StandardNode } from "../../core/domain/standard";
import { loadStandardFromFile } from "../../core/engine/standardLoader";
import {
  deleteStandardAndProfiles,
  //updateStandardNodes,
  createStandard,
  upsertStandard,
} from "../../core/db/repositories/standards.repo";
import { useStandards } from "../../shared/hooks/useStandards";
import { Badge } from "../../shared/components/ui/Badge";
import { statusStyle } from "../../shared/profileStatus";
import { EmptyState } from "../../shared/components/ui/EmptyState";
import { LoadingSpinner } from "../../shared/components/ui/LoadingSpinner";
import { ErrorBanner } from "../../shared/components/ui/ErrorBanner";
import { TaxonomyEditor } from "./TaxonomyEditor";

type SubView = "list" | "create" | "edit-taxonomy";

export function StandardsPage() {
  const standards = useStandards();
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [subView, setSubView] = useState<SubView>("list");
  const [editingStandard, setEditingStandard] = useState<StandardPlugin | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  if (standards === undefined) return <LoadingSpinner />;

// ── Taxonomy editor ─────────────────────────────────────────────────────
if (subView === "edit-taxonomy" && editingStandard !== null) {
  return (
    <div className="h-full">
      <TaxonomyEditor
        standard={editingStandard}
        onSave={async (nodes: StandardNode[]) => {
          // 1. On prépare l'objet standard complet unifié en une seule écriture
          const updatedStandard = {
            ...editingStandard,
            nodes,
            source: "user",   // Devient une copie locale modifiée
            // "local" et NON "pending" : le passage en attente de validation
            // appartient au push (submitCommit), comme pour les profils.
            // Mettre "pending" ici faisait apparaître l'édition dans la file de
            // validation de son propre auteur, qui pouvait donc s'auto-valider
            // sans avoir jamais rien poussé.
            status: "local",
            // Une édition non poussée est un brouillon local, badgé comme tel.
            workspace: "local",
          } as any;

          // 2. Une unique opération d'écriture atomique en base de données
          await upsertStandard(updatedStandard as StandardPlugin); 

          // 3. Mise à jour de la liste locale
          setSubView("list");
          setEditingStandard(null);
        }}
        onCancel={() => { setSubView("list"); setEditingStandard(null); }}
      />
    </div>
  );
}

  // ── Create new standard ─────────────────────────────────────────────────
  if (subView === "create") {
    return (
      <NewStandardForm
        existingIds={(standards ?? []).map(s => s.manifest.id)}
        onCreated={async (plugin) => {
          await createStandard(plugin);
          setEditingStandard(plugin);
          setSubView("edit-taxonomy");
        }}
        onCancel={() => setSubView("list")}
      />
    );
  }

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
            onClick={() => setSubView("create")}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            + New Standard
          </button>
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
              onEditTaxonomy={() => {
                setEditingStandard(s);
                setSubView("edit-taxonomy");
              }}
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
  onEditTaxonomy: () => void;
}

function StandardCard({ standard, onDelete, onEditTaxonomy }: StandardCardProps) {
  const m = standard.manifest;

  // Built-in factory standards are labelled as such; everything else follows the
  // shared status palette (local = yellow, pending = orange, official = green).
  const status = (standard as any).status as string | undefined;
  const s = statusStyle(status);
  const badge = m.isBuiltin
    ? { label: "Built-in", variant: "gray" as const }
    : { label: s.label, variant: s.variant };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-sm text-gray-900">{m.label}</span>
            <Badge variant={badge.variant}>{badge.label}</Badge>
            <Badge variant="gray">v{m.version}</Badge>
          </div>
          {m.description !== undefined && (
            <p className="text-sm text-gray-500 line-clamp-2 mb-2">{m.description}</p>
          )}
          <div className="flex flex-wrap gap-4 text-xs text-gray-400">
            <span>
              <span className="text-gray-600 font-medium">{standard.nodes.length}</span> nodes
            </span>
            <span>
              <span className="text-gray-600 font-medium">{standard.profileSchema.fields.length}</span> schema fields
            </span>
            {m.organization !== undefined && (
              <span>Org: <span className="text-gray-600 font-medium">{m.organization}</span></span>
            )}
            <span className="font-mono text-[10px] bg-slate-100 px-1 rounded">{m.id}</span>
            
            {/* Affiche le modificateur ou l'auteur si défini */}
            {(standard as any).lastModifiedBy && (
              <span className="italic">par {(standard as any).lastModifiedBy}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={onEditTaxonomy}
            className="px-3 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors"
          >
            Edit Taxonomy
          </button>
          
          {!m.isBuiltin && (
            <button
              onClick={onDelete}
              className="px-3 py-1 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
            >
              Remove
            </button>
          )}
        </div>
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

function StandardDeleteDialog({ standardLabel, onConfirm, onCancel }: StandardDeleteDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4">
        <h3 className="text-base font-semibold text-gray-900 mb-2">Remove standard?</h3>
        <p className="text-sm text-gray-500 mb-5">
          <span className="font-medium text-gray-800">{standardLabel}</span> and all user profiles belonging to it will be permanently deleted.
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

// ---------------------------------------------------------------------------
// NewStandardForm
// ---------------------------------------------------------------------------
interface NewStandardFormProps {
  existingIds: string[];
  onCreated: (plugin: StandardPlugin) => Promise<void>;
  onCancel: () => void;
}

function NewStandardForm({ existingIds, onCreated, onCancel }: NewStandardFormProps) {
  const [label, setLabel] = useState("");
  const [id, setId] = useState("");
  const [organization, setOrg] = useState("");
  const [version, setVersion] = useState("1.0");
  const [description, setDesc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleLabelChange(value: string) {
    setLabel(value);
    setId(value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimId = id.trim();
    if (trimId.length === 0) { setError("ID is required."); return; }
    if (label.trim().length === 0) { setError("Label is required."); return; }
    if (organization.trim().length === 0) { setError("Organization is required."); return; }
    if (existingIds.includes(trimId)) {
      setError(`A standard with ID "${trimId}" already exists.`);
      return;
    }

    const plugin: StandardPlugin = {
      manifest: {
        id: trimId,
        version: version.trim() || "1.0",
        schemaVersion: 1,
        organization: organization.trim(),
        label: label.trim(),
        description: description.trim(),
        isBuiltin: false,
      },
      nodes: [],
      profileSchema: { version: 1, fields: [], datasetColumns: [] },
      migrations: [],
    };

    setSaving(true);
    try {
      await onCreated(plugin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create standard.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500";
  const labelCls = "block text-xs font-medium text-gray-700 mb-1";

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z" />
          </svg>
          Back
        </button>
        <h2 className="text-lg font-semibold text-gray-900">Create New Standard</h2>
      </div>

      <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
        <div>
          <label className={labelCls}>Label <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={label}
            onChange={e => handleLabelChange(e.target.value)}
            placeholder="e.g. Company Environmental Standard 2024"
            className={inputCls}
            autoFocus
          />
        </div>

        <div>
          <label className={labelCls}>ID <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={id}
            onChange={e => setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="e.g. company-env-2024"
            className={`${inputCls} font-mono`}
          />
          <p className="mt-1 text-xs text-gray-400">
            Used as the unique key. Lowercase letters, numbers, and hyphens only. Cannot be changed after creation.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Organization <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={organization}
              onChange={e => setOrg(e.target.value)}
              placeholder="e.g. ACME Corp"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Version</label>
            <input
              type="text"
              value={version}
              onChange={e => setVersion(e.target.value)}
              placeholder="e.g. 1.0"
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Description</label>
          <textarea
            value={description}
            onChange={e => setDesc(e.target.value)}
            rows={3}
            placeholder="Optional description of this standard…"
            className={`${inputCls} resize-none`}
          />
        </div>

        {error !== null && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create & Edit Taxonomy →"}
          </button>
        </div>
      </form>
    </div>
  );
}
