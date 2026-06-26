import { useState } from "react";
import type { DataPointDraft } from "../../types";

interface DatasetEditorProps {
  rows: DataPointDraft[];
  onChange: (rows: DataPointDraft[]) => void;
}

function newRowId(): string {
  return `row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Detect separator: tab first, then comma, then whitespace fallback. */
function detectSeparator(line: string): RegExp {
  if (line.includes("\t")) return /\t/;
  if (line.includes(",")) return /,/;
  return /\s+/;
}

interface ParseResult {
  rows: DataPointDraft[];
  errorLines: number[];
}

function parsePastedText(text: string): ParseResult {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { rows: [], errorLines: [] };

  const sep = detectSeparator(lines[0]);
  const rows: DataPointDraft[] = [];
  const errorLines: number[] = [];

  lines.forEach((line, i) => {
    const parts = line
      .split(sep)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (parts.length < 2) {
      errorLines.push(i + 1);
    } else {
      rows.push({
        id: newRowId(),
        time: parts[0] ?? "",
        temp_c: parts[1] ?? "",
        rh_percent: parts[2] ?? "",
      });
    }
  });

  return { rows, errorLines };
}

export function DatasetEditor({ rows, onChange }: DatasetEditorProps) {
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(rows.length === 0);

  function addRow() {
    onChange([
      ...rows,
      { id: newRowId(), time: "", temp_c: "", rh_percent: "" },
    ]);
  }

  function updateRow(
    index: number,
    field: keyof Omit<DataPointDraft, "id">,
    value: string
  ) {
    onChange(rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function deleteRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  function handleParse() {
    const { rows: parsed, errorLines } = parsePastedText(pasteText);

    if (parsed.length === 0 && errorLines.length === 0) {
      setPasteError("No data found in the pasted text.");
      return;
    }

    if (parsed.length > 0) {
      onChange([...rows, ...parsed]);
      setPasteText("");
      if (!showPaste) return;
    }

    if (errorLines.length > 0) {
      setPasteError(
        `${errorLines.length} line${
          errorLines.length > 1 ? "s" : ""
        } skipped (line ${errorLines.slice(0, 5).join(", ")}${
          errorLines.length > 5 ? "…" : ""
        } — expected at least 2 columns).`
      );
    } else {
      setPasteError(null);
      setShowPaste(false);
    }
  }

  function handleClearAll() {
    onChange([]);
    setShowPaste(true);
    setPasteText("");
    setPasteError(null);
  }

  return (
    <div className="space-y-4">
      {/* ── Paste Dataset ──────────────────────────────────────────── */}
      {showPaste && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Paste Dataset
            </label>
            {rows.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPaste(false)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Hide
              </button>
            )}
          </div>

          <p className="text-xs text-gray-500 mb-1 leading-relaxed">
            Paste directly from Excel or any text source. Accepted separators:
            comma, tab, or space. Columns:{" "}
            <span className="font-mono text-gray-700">
              Time · Temp (°C) · RH (%RH)
            </span>
          </p>

          <p className="text-xs font-mono text-gray-400 mb-2 leading-relaxed">
            e.g.&nbsp;
            <span className="text-gray-600">0100,30,95</span>
            &nbsp;&nbsp;
            <span className="text-gray-600">0200,40,88</span>
          </p>

          <textarea
            value={pasteText}
            onChange={(e) => {
              setPasteText(e.target.value);
              setPasteError(null);
            }}
            rows={6}
            placeholder={"0100,30,95\n0200,40,88\n0300,60,80"}
            className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-y"
          />

          {pasteError && (
            <p className="mt-1 text-xs text-amber-600">{pasteError}</p>
          )}

          <div className="flex justify-end mt-2">
            <button
              type="button"
              onClick={handleParse}
              disabled={pasteText.trim() === ""}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Parse &amp; Add Rows
            </button>
          </div>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────── */}
      <div className="overflow-auto rounded border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">
                Time
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">
                Temp (°C)
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">
                RH (%RH)
              </th>
              <th className="w-10" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-sm text-gray-400"
                >
                  No data points. Paste data above or click "Add Row".
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row.id}
                  className="border-b border-gray-100 last:border-0"
                >
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={row.time}
                      onChange={(e) => updateRow(i, "time", e.target.value)}
                      placeholder="0000"
                      className="w-full px-2 py-1 text-sm font-mono border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      value={row.temp_c}
                      onChange={(e) => updateRow(i, "temp_c", e.target.value)}
                      placeholder="0"
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      value={row.rh_percent}
                      onChange={(e) =>
                        updateRow(i, "rh_percent", e.target.value)
                      }
                      placeholder="0"
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => deleteRow(i)}
                      className="text-gray-400 hover:text-red-600 transition-colors"
                      aria-label="Delete row"
                    >
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66H14.5a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0H11Z" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer actions ────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2Z" />
          </svg>
          Add Row
        </button>

        {!showPaste && (
          <button
            type="button"
            onClick={() => setShowPaste(true)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 font-medium transition-colors"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z" />
              <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5H3.5A1.5 1.5 0 0 0 2 3h12a1.5 1.5 0 0 0-1.5-1.5H11A1.5 1.5 0 0 0 9.5 0h-3z" />
            </svg>
            Paste Data
          </button>
        )}

        {rows.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="ml-auto text-sm text-red-400 hover:text-red-600 transition-colors"
          >
            Clear All
          </button>
        )}
      </div>
    </div>
  );
}
