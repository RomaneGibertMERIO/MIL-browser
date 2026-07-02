/**
 * Schema-driven dataset editor.
 *
 * Renders an editable table where each row corresponds to a DataPoint.
 * Column headers and input types are derived from the standard's
 * ColumnDefinition array — no hardcoded field names.
 *
 * Supports paste-from-spreadsheet import (tab, comma, or space-delimited).
 */

import { useState } from "react";
import type { ColumnDefinition } from "../../core/domain/standard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single editable row in the dataset — all values are raw strings. */
export type DatasetRow = Record<string, string>;

interface DatasetEditorProps {
  columns: ColumnDefinition[];
  rows: DatasetRow[];
  onChange: (rows: DatasetRow[]) => void;
}

// ---------------------------------------------------------------------------
// DatasetEditor
// ---------------------------------------------------------------------------

export function DatasetEditor({ columns, rows, onChange }: DatasetEditorProps) {
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(rows.length === 0);

  const visibleColumns = columns.filter((c) => c.axis !== "none");

  function addRow() {
    const empty: DatasetRow = {};
    for (const col of visibleColumns) {
      empty[col.key] = String(col.defaultValue ?? "");
    }
    onChange([...rows, empty]);
  }

  function updateCell(rowIdx: number, colKey: string, value: string) {
    onChange(
      rows.map((r, i) => (i === rowIdx ? { ...r, [colKey]: value } : r)),
    );
  }

  function deleteRow(rowIdx: number) {
    onChange(rows.filter((_, i) => i !== rowIdx));
  }

  function handleClearAll() {
    onChange([]);
    setShowPaste(true);
    setPasteText("");
    setPasteError(null);
  }

  function handleParse() {
    const { rows: parsed, errorLines } = parsePaste(pasteText, visibleColumns);
    if (parsed.length === 0 && errorLines.length === 0) {
      setPasteError("No data found in the pasted text.");
      return;
    }
    if (parsed.length > 0) {
      onChange([...rows, ...parsed]);
      setPasteText("");
    }
    if (errorLines.length > 0) {
      const sample = errorLines.slice(0, 5).join(", ");
      setPasteError(
        `${errorLines.length} line${errorLines.length !== 1 ? "s" : ""} skipped` +
          ` (line ${sample}${errorLines.length > 5 ? "…" : ""} — expected ≥2 columns).`,
      );
    } else {
      setPasteError(null);
      setShowPaste(false);
    }
  }

  return (
    <div className="space-y-4">
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
          <p className="text-xs text-gray-500 mb-1">
            Paste from Excel or any text source. Separator: comma, tab, or space.
            Columns:{" "}
            <span className="font-mono text-gray-700">
              {visibleColumns.map((c) => c.label).join(" · ")}
            </span>
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => {
              setPasteText(e.target.value);
              setPasteError(null);
            }}
            rows={6}
            className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
          />
          {pasteError !== null && (
            <p className="mt-1 text-xs text-amber-600">{pasteError}</p>
          )}
          <div className="flex justify-end mt-2">
            <button
              type="button"
              onClick={handleParse}
              disabled={pasteText.trim() === ""}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Parse & Add Rows
            </button>
          </div>
        </div>
      )}

      <div className="overflow-auto rounded border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                >
                  {col.label}
                  {col.required && (
                    <span className="ml-0.5 text-red-400" aria-hidden="true">
                      *
                    </span>
                  )}
                </th>
              ))}
              <th className="w-10" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + 1}
                  className="px-3 py-6 text-center text-sm text-gray-400"
                >
                  No data points. Paste data above or click "Add Row".
                </td>
              </tr>
            ) : (
              rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b border-gray-100 last:border-0">
                  {visibleColumns.map((col) => (
                    <td key={col.key} className="px-2 py-1.5">
                      <input
                        type={col.type === "number" ? "number" : "text"}
                        value={row[col.key] ?? ""}
                        onChange={(e) => updateCell(rowIdx, col.key, e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => deleteRow(rowIdx)}
                      className="text-gray-400 hover:text-red-600 transition-colors"
                      aria-label="Delete row"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          + Add Row
        </button>
        {!showPaste && (
          <button
            type="button"
            onClick={() => setShowPaste(true)}
            className="text-sm text-gray-500 hover:text-gray-800 font-medium transition-colors"
          >
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

// ---------------------------------------------------------------------------
// Paste parser
// ---------------------------------------------------------------------------

interface ParseResult {
  rows: DatasetRow[];
  errorLines: number[];
}

function parsePaste(text: string, columns: ColumnDefinition[]): ParseResult {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { rows: [], errorLines: [] };

  const sep = detectSeparator(lines[0] ?? "");
  const rows: DatasetRow[] = [];
  const errorLines: number[] = [];

  lines.forEach((line, i) => {
    const parts = line
      .split(sep)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (parts.length < 2) {
      errorLines.push(i + 1);
      return;
    }

    const row: DatasetRow = {};
    columns.forEach((col, colIdx) => {
      row[col.key] = parts[colIdx] ?? "";
    });
    rows.push(row);
  });

  return { rows, errorLines };
}

function detectSeparator(line: string): RegExp {
  if (line.includes("\t")) return /\t/;
  if (line.includes(",")) return /,/;
  return /\s+/;
}
