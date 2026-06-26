import type { RepoProfile, DataPoint } from "../../types";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";

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

interface RepoProfileViewProps {
  profile: RepoProfile;
}

export function RepoProfileView({ profile }: RepoProfileViewProps) {
  return (
    <div className="space-y-5">
      {/* ── Metadata ──────────────────────────────────────────────── */}
      <Card>
        <div className="mb-3">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h2 className="text-base font-semibold text-gray-900 leading-snug">
              {profile.name}
            </h2>
            <Badge variant={profile.source === "builtin" ? "blue" : "gray"}>
              {profile.source === "builtin" ? "Built-in" : "User"}
            </Badge>
          </div>
          {profile.description && (
            <p className="mt-0.5 text-sm text-gray-500 leading-relaxed">
              {profile.description}
            </p>
          )}
        </div>

        {profile.taxonomyPath.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-400 mr-1">Path</span>
            {profile.taxonomyPath.map((label, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-300 select-none">›</span>}
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                  {label}
                </span>
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* ── Chart ─────────────────────────────────────────────────── */}
      <Card title="Chart">
        {profile.dataset.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            No chart data available.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart
              data={profile.dataset as unknown as Record<string, unknown>[]}
              margin={{ top: 8, right: 64, left: 24, bottom: 36 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#f3f4f6"
                vertical={false}
              />

              <XAxis
                dataKey="time"
                tick={{ fontSize: 11, fill: "#6b7280" }}
                tickLine={{ stroke: "#e5e7eb" }}
                axisLine={{ stroke: "#e5e7eb" }}
                label={{
                  value: "Time (hhmm)",
                  position: "insideBottom",
                  offset: -20,
                  style: { fontSize: 11, fill: "#9ca3af" },
                }}
              />

              <YAxis
                yAxisId="left"
                orientation="left"
                tick={{ fontSize: 11, fill: "#6b7280" }}
                tickLine={{ stroke: "#e5e7eb" }}
                axisLine={{ stroke: "#e5e7eb" }}
                label={{
                  value: "Temperature (°C)",
                  angle: -90,
                  position: "insideLeft",
                  offset: -8,
                  style: { fontSize: 11, fill: "#9ca3af" },
                }}
              />

              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: "#6b7280" }}
                tickLine={{ stroke: "#e5e7eb" }}
                axisLine={{ stroke: "#e5e7eb" }}
                label={{
                  value: "Relative Humidity (%RH)",
                  angle: 90,
                  position: "insideRight",
                  offset: -8,
                  style: { fontSize: 11, fill: "#9ca3af" },
                }}
              />

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

              <Line
                yAxisId="left"
                type="monotone"
                dataKey="temp_c"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 2.5, fill: "#ef4444", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                name="Temperature (°C)"
              />

              <Line
                yAxisId="right"
                type="monotone"
                dataKey="rh_percent"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 2.5, fill: "#3b82f6", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                name="Relative Humidity (%RH)"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* ── Data Table ────────────────────────────────────────────── */}
      <Card title={`Data Points — ${profile.dataset.length} rows`}>
        {profile.dataset.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            No data points available.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Time{" "}
                    <span className="font-normal normal-case text-gray-300">
                      (hhmm)
                    </span>
                  </th>
                  <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Temperature{" "}
                    <span className="font-normal normal-case text-gray-300">
                      (°C)
                    </span>
                  </th>
                  <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Relative Humidity{" "}
                    <span className="font-normal normal-case text-gray-300">
                      (%RH)
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {profile.dataset.map((point: DataPoint, rowIndex: number) => (
                  <tr
                    key={rowIndex}
                    className={
                      rowIndex % 2 === 0 ? "bg-white" : "bg-gray-50/60"
                    }
                  >
                    <td className="px-5 py-2 text-gray-700 font-mono whitespace-nowrap tabular-nums">
                      {point.time}
                    </td>
                    <td className="px-5 py-2 text-gray-700 font-mono whitespace-nowrap tabular-nums">
                      {point.temp_c}
                    </td>
                    <td className="px-5 py-2 text-gray-700 font-mono whitespace-nowrap tabular-nums">
                      {point.rh_percent}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
