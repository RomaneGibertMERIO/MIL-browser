/**
 * Profile detail view — used by both the Browse and Assistant features.
 *
 * Renders the full profile: metadata fields (grouped by FieldGroup),
 * a schema-driven time-series chart, and the raw data table.
 *
 * All rendering is driven by the standard's ColumnDefinition and
 * FieldDefinition arrays — no hardcoded field names.
 */

import { useState } from "react";
import type { Profile } from "../../core/domain/profile";
import type { ProfileDefinition } from "../../core/domain/standard";
import { Card } from "../../shared/components/ui/Card";
import { Badge } from "../../shared/components/ui/Badge";
import { TimeSeriesChart } from "../../shared/components/charts/TimeSeriesChart";
import type { FieldGroup } from "../../core/domain/standard";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProfileDetailProps {
  profile: Profile;
  schema: ProfileDefinition;
  onBack: () => void;
  backLabel?: string;
}

// ---------------------------------------------------------------------------
// ProfileDetail
// ---------------------------------------------------------------------------

/** The groups to display and their labels. */
const GROUPS: { key: FieldGroup; label: string }[] = [
  { key: "identification", label: "Identification" },
  { key: "conditions",     label: "Test Conditions" },
  { key: "procedures",     label: "Procedures" },
  { key: "acceptance",     label: "Acceptance Criteria" },
  { key: "references",     label: "References" },
  { key: "notes",          label: "Notes" },
  { key: "custom",         label: "Custom Fields" },
];

export function ProfileDetail({ profile, schema, onBack, backLabel = "Back" }: ProfileDetailProps) {
  const [dataView, setDataView] = useState<"chart" | "table" | "both">("both");

  const btnBase = "px-3 py-1 text-xs font-medium rounded border transition-colors";
  const btnActive = "bg-blue-600 text-white border-blue-600";
  const btnInactive = "text-gray-600 border-gray-200 bg-white hover:bg-gray-50";
  return (
    <div className="space-y-5">
      {/* ── Back button ─────────────────────────────────────────────── */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z" />
        </svg>
        {backLabel}
      </button>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <Card>
        <div className="flex items-start gap-2 flex-wrap mb-1">
          <h2 className="text-base font-semibold text-gray-900 leading-snug">
            {profile.name}
          </h2>
          <Badge variant={profile.source === "builtin" ? "blue" : "gray"}>
            {profile.source === "builtin" ? "Built-in" : "User"}
          </Badge>
        </div>
        {profile.description !== "" && (
          <p className="mt-0.5 text-sm text-gray-500 leading-relaxed">
            {profile.description}
          </p>
        )}
      </Card>

      {/* ── Field groups ────────────────────────────────────────────── */}
      {GROUPS.map(({ key, label }) => {
        const groupFields = schema.fields.filter(
          (f) => f.group === key && profile.fields[f.key] !== null && profile.fields[f.key] !== "",
        );
        if (groupFields.length === 0) return null;

        return (
          <Card key={key} title={label}>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {groupFields.map((field) => (
                <div key={field.key}>
                  <dt className="text-xs font-medium text-gray-400">
                    {field.label}
                    {field.unit !== undefined && (
                      <span className="ml-1 font-normal">({field.unit})</span>
                    )}
                  </dt>
                  <dd className="mt-0.5 text-sm text-gray-900">
                    {formatFieldValue(profile.fields[field.key])}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        );
      })}

      {/* ── Data view toggle + chart + table ────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 font-medium">Show:</span>
        <button className={`${btnBase} ${dataView === "both" ? btnActive : btnInactive}`} onClick={() => setDataView("both")}>Both</button>
        <button className={`${btnBase} ${dataView === "chart" ? btnActive : btnInactive}`} onClick={() => setDataView("chart")}>Chart</button>
        <button className={`${btnBase} ${dataView === "table" ? btnActive : btnInactive}`} onClick={() => setDataView("table")}>Table</button>
      </div>

      {/* ── Chart ───────────────────────────────────────────────────── */}
      {dataView !== "table" && (
      <Card title="Chart">
        <TimeSeriesChart
          columns={schema.datasetColumns}
          data={profile.dataset}
        />
      </Card>
      )}

      {/* ── Data table ──────────────────────────────────────────────── */}
      {dataView !== "chart" && (
      <Card title={`Dataset — ${profile.dataset.length} rows`}>
        {profile.dataset.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            No data points available.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {schema.datasetColumns
                    .filter((c) => c.axis !== "none")
                    .map((col) => (
                      <th
                        key={col.key}
                        className="px-5 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider"
                      >
                        {col.label}
                        <span className="ml-1 font-normal normal-case text-gray-300">
                          ({col.unit})
                        </span>
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {profile.dataset.map((row, idx) => (
                  <tr
                    key={idx}
                    className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/60"}
                  >
                    {schema.datasetColumns
                      .filter((c) => c.axis !== "none")
                      .map((col) => (
                        <td
                          key={col.key}
                          className="px-5 py-2 text-gray-700 font-mono whitespace-nowrap tabular-nums"
                        >
                          {String(row[col.key] ?? "")}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
