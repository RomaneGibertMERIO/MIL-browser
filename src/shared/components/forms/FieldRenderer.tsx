/**
 * Schema-driven field renderer.
 *
 * Renders a single form field based on its FieldDefinition. The correct
 * input element is chosen from the definition's type, so no per-standard
 * rendering logic is required anywhere in the application.
 *
 * The component is controlled: the caller owns the value and handles
 * onChange. This keeps state management above the component level and
 * makes the form predictable.
 */

import type { FieldDefinition } from "../../core/domain/standard";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FieldRendererProps {
  definition: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// FieldRenderer
// ---------------------------------------------------------------------------

export function FieldRenderer({
  definition,
  value,
  onChange,
  error,
  disabled = false,
}: FieldRendererProps) {
  const baseInputClass =
    "w-full px-3 py-2 text-sm border rounded-md bg-white " +
    "focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 " +
    (error !== undefined ? "border-red-400" : "border-gray-300");

  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-700">
        {definition.label}
        {definition.required && (
          <span className="ml-0.5 text-red-500" aria-hidden="true">
            *
          </span>
        )}
        {definition.unit !== undefined && (
          <span className="ml-1 font-normal text-gray-400">({definition.unit})</span>
        )}
      </label>

      {renderInput(definition, value, onChange, baseInputClass, disabled)}

      {error !== undefined && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal helpers — one function per field type
// ---------------------------------------------------------------------------

function renderInput(
  def: FieldDefinition,
  value: unknown,
  onChange: (value: unknown) => void,
  className: string,
  disabled: boolean,
): ReactNode {
  switch (def.type) {
    case "text":
    case "duration":
      return (
        <input
          type="text"
          value={typeof value === "string" ? value : String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={className}
        />
      );

    case "number":
      return (
        <input
          type="number"
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : parseFloat(e.target.value))
          }
          disabled={disabled}
          className={className}
        />
      );

    case "multiline":
      return (
        <textarea
          rows={3}
          value={typeof value === "string" ? value : String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`${className} resize-none`}
        />
      );

    case "boolean":
      return (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="w-4 h-4 text-blue-600 border-gray-300 rounded"
        />
      );

    case "date":
      return (
        <input
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={className}
        />
      );

    case "enum":
      return (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
          disabled={disabled}
          className={className}
        >
          <option value="">— Select —</option>
          {(def.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
  }
}
