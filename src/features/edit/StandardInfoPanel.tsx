/**
 * Standard information panel (Edit database — Taxonomy mode).
 *
 * Shown in the editor pane when a standard is selected but no node is, so that
 * clicking a standard lets the user read AND edit its identity (name,
 * organization, version, description) and delete it. See docs/UI-UX-SPEC.md
 * §15.2.
 *
 * Persistence reuses the repositories unchanged (non-regression §27):
 *  - Save   → updateStandardManifest (id + schemaVersion are immutable).
 *  - Delete → deleteStandardAndProfiles, which tombstones through the existing
 *             sync hooks. In shared mode that tombstone is the proposal the
 *             admin reviews on the next push — no new sync code.
 *
 * The parent mounts this with `key={standard.manifest.id}` so switching
 * standards remounts it with fresh field state (no stale-edit carry-over).
 */
import { useEffect, useState, type ReactNode } from "react";
import type { StandardPlugin } from "../../core/domain/standard";
import {
  updateStandardManifest,
  deleteStandardAndProfiles,
} from "../../core/db/repositories/standards.repo";
import { useAppStore } from "../../store/appStore";
import { useConfirm } from "../../shared/components/ui/ConfirmDialog";
import { Icon } from "../../shared/components/ui/Icon";
import { Badge } from "../../shared/components/ui/Badge";
import { StatusBadge } from "../../shared/components/ui/StatusBadge";
import { toast } from "../../shared/toast/toastStore";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500";

export function StandardInfoPanel({
  standard,
  onDeleted,
  onDirtyChange,
}: {
  standard: StandardPlugin;
  onDeleted?: () => void;
  /** Reports unsaved-edit state to the parent so its navigation guard can
   *  protect these fields (the panel unmounts as soon as a node is selected). */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const repoMode = useAppStore((s) => s.repoMode);
  const { confirm, dialog } = useConfirm();

  const m = standard.manifest;
  const isBuiltin = m.isBuiltin;

  const [label, setLabel] = useState(m.label);
  const [organization, setOrganization] = useState(m.organization);
  const [version, setVersion] = useState(m.version);
  const [description, setDescription] = useState(m.description);
  const [saving, setSaving] = useState(false);

  const dirty =
    label !== m.label ||
    organization !== m.organization ||
    version !== m.version ||
    description !== m.description;

  const canSave =
    dirty && label.trim() !== "" && organization.trim() !== "" && version.trim() !== "";

  // Signale l'état « non sauvegardé » au parent (garde de navigation) et le
  // remet à zéro au démontage — le panneau disparaît dès qu'un nœud est choisi.
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  async function handleSave() {
    if (!canSave) return;
    // On persiste des valeurs élaguées ET on aligne l'état local dessus, sinon un
    // espace en trop laisserait `dirty` vrai (bouton actif + écriture redondante)
    // après une sauvegarde réussie.
    const trimmed = {
      label: label.trim(),
      organization: organization.trim(),
      version: version.trim(),
      description,
    };
    setSaving(true);
    try {
      await updateStandardManifest(m.id, trimmed);
      setLabel(trimmed.label);
      setOrganization(trimmed.organization);
      setVersion(trimmed.version);
      toast.success("Standard information saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save standard information.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const shared = repoMode === "shared";
    const ok = await confirm({
      title: "Delete standard",
      message: shared
        ? `Delete "${m.label}" and all its profiles? It is removed here and its removal is proposed to the admin on the next sync.`
        : isBuiltin
          ? `Delete built-in standard "${m.label}" and all its profiles? It is restored only if you later remove all standards.`
          : `Permanently delete "${m.label}" and all its profiles? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      const { reviewRequested } = await deleteStandardAndProfiles(m.id);
      if (reviewRequested) {
        toast.info(`Deletion request for "${m.label}" added — send it to the admin from Synchronization.`);
      } else {
        toast.success(`"${m.label}" deleted.`);
      }
      onDeleted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete standard.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      {dialog}

      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Standard information
          </p>
          <h2 className="truncate text-lg font-semibold text-gray-900">{m.label}</h2>
        </div>
        <span className="flex-shrink-0">
          {isBuiltin ? <Badge variant="gray">Built-in</Badge> : <StatusBadge status={standard.status} />}
        </span>
      </header>

      <div className="space-y-4">
        <Field label="Name">
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Organization">
          <input
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Version">
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={inputClass}
          />
        </Field>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs">
        <Meta term="Identifier">
          <span className="font-mono">{m.id}</span>
        </Meta>
        <Meta term="Provenance">{isBuiltin ? "Built-in (ships with the app)" : "User standard"}</Meta>
        <Meta term="Schema version">
          <span className="font-mono">v{m.schemaVersion}</span>
        </Meta>
        <Meta term="Nodes">{standard.nodes.length}</Meta>
      </dl>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={() => void handleDelete()}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
        >
          <Icon name="delete" size={14} /> Delete standard
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave || saving}
          className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save info"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Meta({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-gray-400">{term}</dt>
      <dd className="mt-0.5 font-medium text-gray-700">{children}</dd>
    </div>
  );
}
