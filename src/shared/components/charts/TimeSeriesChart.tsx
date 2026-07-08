/**
 * Schema-driven time-series chart.
 *
 * Renders a dual-axis line chart for any profile's dataset. The chart
 * configuration — axes, colors, series — is derived entirely from the
 * standard's ColumnDefinition array. No hardcoded field names (e.g.
 * "temp_c" or "rh_percent") exist in this component.
 *
 * Recharts ComposedChart is used so that future column types (bar, area)
 * can be added without changing this component's interface.
 */

import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ColumnDefinition } from "../../../core/domain/standard";
import type { DataPoint } from "../../../core/domain/profile";

// ---------------------------------------------------------------------------
// Color palette for auto-assigned series colors
// ---------------------------------------------------------------------------

const AUTO_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TimeSeriesChartProps {
  /** All column definitions from the standard's profile schema. */
  columns: ColumnDefinition[];
  /** Dataset rows — Record<column.key, value>. */
  data: DataPoint[];
}

// ---------------------------------------------------------------------------
// TimeSeriesChart
// ---------------------------------------------------------------------------

/**
 * Renders a schema-driven time-series chart.
 * Columns with axis === "x" are used as the X axis.
 * Columns with axis === "none" are excluded from the chart.
 * All other columns become Line series on the appropriate Y axis.
 */
export function TimeSeriesChart({ columns, data }: TimeSeriesChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        No chart data available.
      </p>
    );
  }

  const xColumn = columns.find((c) => c.axis === "x");
  const xKey = xColumn?.key ?? "time";

  const seriesColumns = columns.filter(
    (c) => c.axis === "left" || c.axis === "right",
  );

  const hasLeftAxis = seriesColumns.some((c) => c.axis === "left");
  const hasRightAxis = seriesColumns.some((c) => c.axis === "right");

  // -------------------------------------------------------------------------
  // ÉTAPE A : Préparation et conversion numérique des données pour Recharts
  // -------------------------------------------------------------------------
  const chartData = data
    .map((row) => {
      const newRow: Record<string, unknown> = {};
      
      // 1. Conversion impérative de l'axe X en nombre
      const xRaw = row[xKey];
      const xValue = xRaw !== undefined && xRaw !== null && xRaw !== "" ? Number(xRaw) : NaN;
      
      if (isNaN(xValue)) return null; // Ligne invalide ignorée
      newRow[xKey] = xValue;

      // 2. Conversion des autres axes (Y) en nombres (ou conservation du undefined si vide)
      seriesColumns.forEach((col) => {
        const yRaw = row[col.key];
        if (yRaw !== undefined && yRaw !== null && yRaw !== "") {
          const yValue = Number(yRaw);
          if (!isNaN(yValue)) {
            newRow[col.key] = yValue;
          }
        }
        // Si la case est vide, on ne l'ajoute pas à newRow.
        // Recharts détectera l'absence de clé et appliquera le connectNulls.
      });

      return newRow;
    })
    .filter((row): row is Record<string, unknown> => row !== null)
    // Tri indispensable par ordre croissant de X pour éviter les lignes de graphique qui s'emmêlent
    .sort((a, b) => (a[xKey] as number) - (b[xKey] as number));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart
        data={chartData}
        margin={{ top: 8, right: hasRightAxis ? 64 : 24, left: 24, bottom: 36 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#f3f4f6"
          vertical={false}
        />

        {/* ----------------------------------------------------------------- */}
        {/* ÉTAPE B : Configuration de l'axe X en mode Numérique             */}
        {/* ----------------------------------------------------------------- */}
        <XAxis
          dataKey={xKey}
          type="number"
          domain={["dataMin", "dataMax"]}
          tick={{ fontSize: 11, fill: "#6b7280" }}
          tickLine={{ stroke: "#e5e7eb" }}
          axisLine={{ stroke: "#e5e7eb" }}
          label={{
            value: xColumn ? `${xColumn.label} (${xColumn.unit})` : "",
            position: "insideBottom",
            offset: -20,
            style: { fontSize: 11, fill: "#9ca3af" },
          }}
        />

        {hasLeftAxis && (
          <YAxis
            yAxisId="left"
            orientation="left"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={{ stroke: "#e5e7eb" }}
            axisLine={{ stroke: "#e5e7eb" }}
            label={{
              value: buildAxisLabel(seriesColumns, "left"),
              angle: -90,
              position: "insideLeft",
              offset: -8,
              style: { fontSize: 11, fill: "#9ca3af" },
            }}
          />
        )}

        {hasRightAxis && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={{ stroke: "#e5e7eb" }}
            axisLine={{ stroke: "#e5e7eb" }}
            label={{
              value: buildAxisLabel(seriesColumns, "right"),
              angle: 90,
              position: "insideRight",
              offset: -8,
              style: { fontSize: 11, fill: "#9ca3af" },
            }}
          />
        )}

        <Tooltip
          contentStyle={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "6px",
            fontSize: "12px",
            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.07)",
          }}
          labelStyle={{ fontWeight: 600, marginBottom: 4 }}
        />

        <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />

        {seriesColumns.map((col, idx) => (
          <Line
            key={col.key}
            yAxisId={col.axis as "left" | "right"}
            type="linear" // "linear" est plus rigoureux pour les pentes brutes MIL-STD que "monotone"
            dataKey={col.key}
            connectNulls={true} // <-- RACCORDE NATIVEMENT LES TROUX DANS LA GRILLE
            stroke={col.color ?? AUTO_COLORS[idx % AUTO_COLORS.length] ?? "#6b7280"}
            strokeWidth={2}
            dot={{ r: 2.5, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            name={`${col.label} (${col.unit})`}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAxisLabel(
  columns: ColumnDefinition[],
  axis: "left" | "right",
): string {
  const axisColumns = columns.filter((c) => c.axis === axis);
  if (axisColumns.length === 0) return "";
  return axisColumns
    .map((c) => `${c.label} (${c.unit})`)
    .join(" / ");
}
