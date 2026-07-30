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
import { sourceStatusStyle } from "../../shared/profileStatus";
import { FIELD_ADDED, FIELD_MODIFIED, FIELD_REMOVED, OLD_VALUE } from "../../shared/changeStyle";
import { TimeSeriesChart } from "../../shared/components/charts/TimeSeriesChart";
import type { FieldGroup } from "../../core/domain/standard";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProfileDetailProps {
  profile: Profile;
  schema: ProfileDefinition;
  /** Optionnel : sans lui, aucun bouton retour (ex. carte de comparaison épinglée). */
  onBack?: () => void;
  backLabel?: string;
  /**
   * Mode diff (Sync/Review, spec §13) — palette « type de changement » (bleus,
   * cf. changeStyle.ts), distincte de la palette de statut :
   *  - action "Created" : tout champ renseigné = ajout → bleu clair.
   *  - action "Modified" : comparaison à `previous` — ajouté (bleu clair),
   *    modifié (bleu moyen + ancienne valeur barrée), supprimé (bleu foncé barré).
   * Absent = affichage normal (Browser/Éditeur).
   */
  diff?: { action: "Created" | "Modified"; previous?: Profile | null };
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

export function ProfileDetail({ profile, schema, onBack, backLabel = "Back", diff }: ProfileDetailProps) {
  // Mode de diff : "none" (affichage normal), "created" (tout est neuf → ajout),
  // "modified" (comparaison champ par champ avec la version précédente).
  const mode: "none" | "created" | "modified" = diff
    ? diff.action === "Created"
      ? "created"
      : "modified"
    : "none";
  const prev = mode === "modified" ? (diff?.previous ?? null) : null;
  const previousFields = mode === "modified" ? (prev?.fields ?? {}) : null;
  // Un profil dont le schéma ne définit AUCUNE colonne dataset ne doit pas
  // afficher de zone graphe/table (vide et trompeuse) — cohérent avec l'éditeur
  // (8.3) et corrige la carte de comparaison « seulement un dataset vide » (11.4).
  const hasDataset = (schema.datasetColumns?.length ?? 0) > 0;
  const [dataView, setDataView] = useState<"chart" | "table" | "both">("both");

  const btnBase = "px-3 py-1 text-xs font-medium rounded border transition-colors";
  const btnActive = "bg-blue-600 text-white border-blue-600";
  const btnInactive = "text-gray-600 border-gray-200 bg-white hover:bg-gray-50";
  return (
    <div className="space-y-5">
      {/* ── Back button (masqué quand aucun onBack n'est fourni) ─────── */}
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z" />
          </svg>
          {backLabel}
        </button>
      )}

      {/* ── Header ──────────────────────────────────────────────────── */}
      <Card>
        <div className="flex items-start gap-2 flex-wrap mb-1">
          <h2 className="text-base font-semibold leading-snug">
            {mode === "created" ? (
              <span className={FIELD_ADDED}>{profile.name}</span>
            ) : prev && prev.name !== profile.name ? (
              <span className={FIELD_MODIFIED}>
                {profile.name} <span className={`text-xs ${OLD_VALUE}`}>{prev.name}</span>
              </span>
            ) : (
              <span className="text-gray-900">{profile.name}</span>
            )}
          </h2>
          {(() => {
            const s = sourceStatusStyle(profile.source, profile.status);
            return <Badge variant={s.variant}>{s.label}</Badge>;
          })()}
        </div>
        {(profile.description !== "" || (prev != null && prev.description !== profile.description)) && (
          <p className="mt-0.5 text-sm leading-relaxed">
            {mode === "created" ? (
              <span className={FIELD_ADDED}>{profile.description}</span>
            ) : prev && prev.description !== profile.description ? (
              <span className={FIELD_MODIFIED}>
                {profile.description || "—"}
                {prev.description ? (
                  <span className={`ml-1 text-xs ${OLD_VALUE}`}>{prev.description}</span>
                ) : null}
              </span>
            ) : (
              <span className="text-gray-500">{profile.description}</span>
            )}
          </p>
        )}
        {profile.author && profile.author !== "unknown" && (
          <p className="mt-1.5 text-xs text-gray-400">
            Last modified by <span className="font-medium text-gray-600">{profile.author}</span>
            {profile.updatedAt ? ` · ${new Date(profile.updatedAt).toLocaleDateString()}` : ""}
          </p>
        )}
        {profile.rejectionReason && (
          <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            <span className="font-semibold">
              Rejected{profile.rejectedBy ? ` by ${profile.rejectedBy}` : ""}:
            </span>{" "}
            {profile.rejectionReason}
          </div>
        )}
      </Card>

      {/* ── Field groups ────────────────────────────────────────────── */}
      {GROUPS.map(({ key, label }) => {
        const nonEmpty = (v: unknown) => v !== null && v !== undefined && v !== "";
        const groupFields = schema.fields.filter((f) => {
          if (f.group !== key) return false;
          if (nonEmpty(profile.fields[f.key])) return true;
          // En mode diff, on montre aussi les champs vidés (supprimés).
          return previousFields ? nonEmpty(previousFields[f.key]) : false;
        });
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
                  <dd className="mt-0.5 text-sm">
                    <FieldValue
                      current={profile.fields[field.key]}
                      previous={previousFields ? previousFields[field.key] : undefined}
                      mode={mode}
                    />
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        );
      })}

      {/* ── Data view toggle + chart + table (masqué si pas de dataset) ─ */}
      {hasDataset && (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 font-medium">Show:</span>
        <button className={`${btnBase} ${dataView === "both" ? btnActive : btnInactive}`} onClick={() => setDataView("both")}>Both</button>
        <button className={`${btnBase} ${dataView === "chart" ? btnActive : btnInactive}`} onClick={() => setDataView("chart")}>Chart</button>
        <button className={`${btnBase} ${dataView === "table" ? btnActive : btnInactive}`} onClick={() => setDataView("table")}>Table</button>
      </div>
      )}

      {/* ── Chart ───────────────────────────────────────────────────── */}
      {hasDataset && dataView !== "table" && (
      <Card title="Chart">
      <TimeSeriesChart
        columns={schema.datasetColumns}
        data={profile.dataset}
        fields={profile.fields} // <-- ON COUPLERA LES OPTIONS LOG ICI
      />
      </Card>
      )}

      {/* ── Data table ──────────────────────────────────────────────── */}
      {hasDataset && dataView !== "chart" && (
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

/**
 * Valeur d'un champ, colorée selon le TYPE DE CHANGEMENT (palette bleue) :
 *  - created : tout champ renseigné = ajout (bleu clair).
 *  - modified : ajout (bleu clair) / modifié (bleu moyen + ancienne valeur
 *    barrée) / supprimé (bleu foncé barré) / inchangé (neutre).
 */
function FieldValue({
  current,
  previous,
  mode,
}: {
  current: unknown;
  previous: unknown;
  mode: "none" | "created" | "modified";
}) {
  const cur = formatFieldValue(current);
  const curEmpty = current === null || current === undefined || current === "";

  if (mode === "none") return <span className="text-gray-900">{cur}</span>;

  if (mode === "created") {
    return curEmpty ? (
      <span className="text-gray-300">—</span>
    ) : (
      <span className={FIELD_ADDED}>{cur}</span>
    );
  }

  // mode "modified" : comparaison à la version précédente.
  const prev = formatFieldValue(previous);
  const prevEmpty = previous === null || previous === undefined || previous === "";

  if (!curEmpty && prevEmpty) return <span className={FIELD_ADDED}>{cur}</span>;
  if (curEmpty && !prevEmpty) return <span className={FIELD_REMOVED}>{prev}</span>;
  if (cur !== prev) {
    return (
      <span className={FIELD_MODIFIED}>
        {cur} <span className={OLD_VALUE}>{prev}</span>
      </span>
    );
  }
  return <span className="text-gray-900">{cur}</span>;
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
