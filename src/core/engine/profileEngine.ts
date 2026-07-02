/**
 * Profile engine.
 *
 * Contains all business logic for creating, validating, and converting
 * profiles. This module has no React imports and no database calls —
 * it is pure TypeScript and can be tested in isolation.
 *
 * Key invariants:
 * - A profile created by buildEmptyProfile is always schema-valid for
 *   fields with no "required" constraint, and invalid only for required
 *   fields (which are empty by design — the user must fill them in).
 * - validateProfile is called before every write; callers must check
 *   ValidationResult.valid before persisting.
 * - buildProfileFromDraft coerces dataset string values to the correct
 *   column type. Coercion failures produce NaN which fails validation.
 */

import type { Profile, ProfileDraft, ValidationResult, ValidationError } from "../domain/profile";
import type { ProfileDefinition, ColumnDefinition, StandardPlugin } from "../domain/standard";

// ---------------------------------------------------------------------------
// buildEmptyProfile
// ---------------------------------------------------------------------------

/**
 * Creates an empty profile draft shell for a given node and standard.
 * All required fields are set to null; optional fields use their defaultValue.
 * The caller must populate fields and dataset before calling validateProfile.
 */
export function buildEmptyProfile(
  nodeId: string,
  standardId: string,
  schema: ProfileDefinition,
): Profile {
  const fields: Record<string, unknown> = {};
  for (const field of schema.fields) {
    fields[field.key] = field.defaultValue ?? null;
  }

  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    nodeId,
    standardId,
    schemaVersion: schema.version,
    name: "",
    description: "",
    source: "user",
    createdAt: now,
    updatedAt: now,
    fields,
    dataset: [],
  };
}

// ---------------------------------------------------------------------------
// validateProfile
// ---------------------------------------------------------------------------

/**
 * Validates a profile against its standard's schema.
 * Returns a ValidationResult with all errors found (not just the first).
 *
 * Validates:
 * - All required fields must be non-null and non-empty string.
 * - Enum fields with a value must have a value that exists in options.
 * - All required dataset columns must be present in every dataset row.
 * - Number columns must contain finite numbers (NaN fails).
 */
export function validateProfile(profile: Profile, schema: ProfileDefinition): ValidationResult {
  const errors: ValidationError[] = [];

  // ── Field validation ─────────────────────────────────────────────────────
  for (const def of schema.fields) {
    const value = profile.fields[def.key];

    if (def.required && (value === null || value === undefined || value === "")) {
      errors.push({ field: def.key, message: `${def.label} is required.` });
      continue;
    }

    if (value !== null && value !== undefined && def.type === "enum" && def.options) {
      const valid = def.options.some((opt) => opt.value === value);
      if (!valid) {
        errors.push({
          field: def.key,
          message: `${def.label} must be one of: ${def.options.map((o) => o.label).join(", ")}.`,
        });
      }
    }

    for (const rule of def.validation) {
      const fieldError = applyValidationRule(def.key, value, rule);
      if (fieldError !== null) errors.push(fieldError);
    }
  }

  // ── Dataset column validation ─────────────────────────────────────────────
  const requiredColumns = schema.datasetColumns.filter((c) => c.required);
  for (let rowIdx = 0; rowIdx < profile.dataset.length; rowIdx++) {
    const row = profile.dataset[rowIdx];
    for (const col of requiredColumns) {
      const cellValue = row[col.key];
      if (cellValue === undefined || cellValue === "") {
        errors.push({
          field: col.key,
          message: `Column "${col.label}" is required (row ${rowIdx + 1}).`,
        });
      } else if (col.type === "number" && !Number.isFinite(Number(cellValue))) {
        errors.push({
          field: col.key,
          message: `Column "${col.label}" must be a number (row ${rowIdx + 1}).`,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// buildProfileFromDraft
// ---------------------------------------------------------------------------

/**
 * Converts a ProfileDraft (which contains raw form strings) into a Profile
 * ready for validation and persistence.
 *
 * Dataset row string values are coerced to their target column type:
 * - "number" columns → parseFloat (NaN is preserved, not zeroed)
 * - "string" columns → trimmed string
 *
 * The caller must run validateProfile on the returned profile before saving.
 */
export function buildProfileFromDraft(
  draft: ProfileDraft,
  schema: ProfileDefinition,
  existingId?: string,
  existingCreatedAt?: string,
): Profile {
  const now = new Date().toISOString();

  const dataset = draft.datasetRows.map((row) => {
    const coerced: Record<string, string | number> = {};
    for (const col of schema.datasetColumns) {
      const raw = row[col.key] ?? "";
      coerced[col.key] = coerceColumnValue(raw, col);
    }
    return coerced;
  });

  return {
    id: existingId ?? crypto.randomUUID(),
    nodeId: draft.nodeId,
    standardId: draft.standardId,
    schemaVersion: schema.version,
    name: draft.name.trim(),
    description: draft.description.trim(),
    source: "user",
    createdAt: existingCreatedAt ?? now,
    updatedAt: now,
    fields: { ...draft.fields },
    dataset,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function coerceColumnValue(
  raw: string,
  col: ColumnDefinition,
): string | number {
  if (col.type === "number") {
    return parseFloat(raw);
  }
  return raw.trim();
}

/**
 * Applies a single validation rule to a field value.
 * Returns a ValidationError if the rule fails, or null if it passes.
 */
function applyValidationRule(
  key: string,
  value: unknown,
  rule: { type: string; message: string; value?: number | string },
): ValidationError | null {
  if (rule.type === "min" && typeof rule.value === "number") {
    if (typeof value === "number" && value < rule.value) {
      return { field: key, message: rule.message };
    }
  }
  if (rule.type === "max" && typeof rule.value === "number") {
    if (typeof value === "number" && value > rule.value) {
      return { field: key, message: rule.message };
    }
  }
  if (rule.type === "pattern" && typeof rule.value === "string") {
    const re = new RegExp(rule.value);
    if (typeof value === "string" && !re.test(value)) {
      return { field: key, message: rule.message };
    }
  }
  if (rule.type === "required") {
    if (value === null || value === undefined || value === "") {
      return { field: key, message: rule.message };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// getEffectiveSchema
// ---------------------------------------------------------------------------

/**
 * Returns the effective ProfileDefinition for a given node.
 * If the node carries its own nodeSchema, those fields/columns override
 * the standard-level profileSchema. An empty array means "use standard".
 */
export function getEffectiveSchema(
  standard: StandardPlugin,
  nodeId: string,
): ProfileDefinition {
  const node = standard.nodes.find(n => n.id === nodeId);
  const ns = node?.nodeSchema;
  if (ns === undefined) return standard.profileSchema;
  return {
    version: standard.profileSchema.version,
    fields: ns.fields.length > 0 ? ns.fields : standard.profileSchema.fields,
    datasetColumns: ns.datasetColumns.length > 0
      ? ns.datasetColumns
      : standard.profileSchema.datasetColumns,
  };
}
