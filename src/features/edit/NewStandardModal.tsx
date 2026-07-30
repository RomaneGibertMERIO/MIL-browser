/**
 * NewStandardModal — creates an empty local standard. Extracted from
 * EditTaxonomyPage so both the (legacy) taxonomy page and the unified
 * EditDatabasePage can reuse it without duplication. Behaviour is unchanged.
 */
import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { StandardPlugin } from "../../core/domain/standard";

export function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function NewStandardModal({ existingIds, onCancel, onCreate }: {
  existingIds: string[];
  onCancel: () => void;
  onCreate: (plugin: StandardPlugin) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [organization, setOrganization] = useState("");
  const [version, setVersion] = useState("1.0");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const id = slugify(label);
    if (label.trim() === "") { setError("Label is required."); return; }
    if (organization.trim() === "") { setError("Organization is required."); return; }
    if (id === "") { setError("Label must contain letters or digits."); return; }
    if (existingIds.includes(id)) { setError(`A standard with id "${id}" already exists.`); return; }

    const plugin: StandardPlugin = {
      manifest: {
        id,
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
      await onCreate(plugin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create standard.");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={onCancel}>
      <form
        onSubmit={handleSubmit}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white shadow-xl border border-gray-200"
      >
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">New standard</h3>
          <p className="text-xs text-gray-500 mt-0.5">Creates an empty local standard you can then populate.</p>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Label</label>
            <input
              autoFocus
              value={label}
              onChange={(e) => { setLabel(e.target.value); setError(null); }}
              placeholder="e.g. MIL-STD-810H"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {label.trim() !== "" && (
              <p className="mt-1 text-xs text-gray-400">id: <span className="font-mono">{slugify(label) || "—"}</span></p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Organization</label>
            <input
              value={organization}
              onChange={(e) => { setOrganization(e.target.value); setError(null); }}
              placeholder="e.g. US DoD"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Version</label>
            <input
              value={version}
              onChange={(e) => { setVersion(e.target.value); setError(null); }}
              placeholder="e.g. 1.0"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); setError(null); }}
              rows={3}
              placeholder="What this standard covers…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error !== null && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-gray-100">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors">
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
