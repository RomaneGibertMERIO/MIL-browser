/**
 * StandardCard — read-only rendering of a standard's identity, matching the
 * layout of the editor's StandardInfoPanel (name / organization / version /
 * description + metadata grid), but WITHOUT the edit inputs or Save/Delete
 * actions. Used by the change-tracking views (Synchronization / Admin Review)
 * so a standard change reads with the same layout as the editor.
 *
 * Diff mode uses the CHANGE-TYPE palette (blues, changeStyle.ts): a created
 * standard shows all its fields as additions (light blue); a modified one shows
 * changed manifest fields in medium blue with the old value struck.
 */
import type { ReactNode } from "react";
import { FIELD_ADDED, FIELD_MODIFIED, OLD_VALUE } from "../changeStyle";

type Mode = "none" | "created" | "modified";

export function StandardCard({
  proposed,
  diff,
}: {
  /** Full standard OR its lightweight sync summary — both carry `manifest`. */
  proposed: any;
  diff?: { action: "Created" | "Modified"; previous?: any };
}) {
  const m = proposed?.manifest ?? proposed ?? {};
  const mode: Mode = diff ? (diff.action === "Created" ? "created" : "modified") : "none";
  const pm = mode === "modified" ? (diff?.previous?.manifest ?? diff?.previous ?? null) : null;
  const nodeCount = Array.isArray(proposed?.nodes) ? proposed.nodes.length : undefined;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Standard information
        </p>
        <h2 className="text-lg font-semibold leading-snug">
          {renderValue(m.label, pm?.label, mode)}
        </h2>
      </header>

      <div className="space-y-4">
        <FieldRow label="Name">{renderValue(m.label, pm?.label, mode)}</FieldRow>
        <FieldRow label="Organization">{renderValue(m.organization, pm?.organization, mode)}</FieldRow>
        <FieldRow label="Version">{renderValue(m.version, pm?.version, mode, true)}</FieldRow>
        <FieldRow label="Description">{renderValue(m.description, pm?.description, mode)}</FieldRow>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs">
        <Meta term="Identifier">
          <span className="font-mono">{m.id ?? "—"}</span>
        </Meta>
        <Meta term="Schema version">
          <span className="font-mono">{m.schemaVersion !== undefined ? `v${m.schemaVersion}` : "—"}</span>
        </Meta>
        <Meta term="Nodes">{nodeCount ?? "—"}</Meta>
        <Meta term="Provenance">User standard</Meta>
      </dl>
    </div>
  );
}

/** Read-only field row styled like StandardInfoPanel's inputs (static box). */
function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900">
        {children}
      </div>
    </div>
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

/** A manifest value, coloured by change type (blues). */
function renderValue(
  current: unknown,
  previous: unknown,
  mode: Mode,
  mono = false,
): ReactNode {
  const cur = current === null || current === undefined || current === "" ? "" : String(current);
  const monoCls = mono ? "font-mono" : "";
  if (mode === "none") return <span className={`${monoCls} text-gray-900`}>{cur || "—"}</span>;

  if (mode === "created") {
    return cur === "" ? (
      <span className="text-gray-300">—</span>
    ) : (
      <span className={`${monoCls} ${FIELD_ADDED}`}>{cur}</span>
    );
  }

  // modified
  const prev = previous === null || previous === undefined || previous === "" ? "" : String(previous);
  if (cur !== prev) {
    return (
      <span className={`${monoCls} ${FIELD_MODIFIED}`}>
        {cur || "—"} {prev ? <span className={OLD_VALUE}>{prev}</span> : null}
      </span>
    );
  }
  return <span className={`${monoCls} text-gray-900`}>{cur || "—"}</span>;
}
