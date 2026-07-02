/**
 * Domain model for test profiles.
 *
 * A Profile is the user-facing record of a specific environmental test
 * configuration. It is decoupled from the taxonomy by referencing
 * StandardNode.id (a stable UUID or slug) rather than any display label.
 *
 * Design decisions:
 * - Profile.fields is Record<string, unknown> at the storage layer.
 *   The shape is defined by ProfileSchema.fields and validated at write time
 *   by the profile engine. This lets profiles of different standards coexist
 *   in the same IndexedDB store without a union type explosion.
 * - Profile.dataset rows are also generic records keyed by ColumnDefinition.key.
 *   The chart and table renderers are driven by ColumnDefinition[], not by
 *   hardcoded field names like "temp_c".
 * - schemaVersion is stored on every profile so the migration engine can find
 *   stale records without fetching the parent standard first.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Profile source
// ---------------------------------------------------------------------------

export const ProfileSourceSchema = z.enum(["builtin", "user"]);

export type ProfileSource = z.infer<typeof ProfileSourceSchema>;

// ---------------------------------------------------------------------------
// DataPoint — one row of a profile's time-series dataset
// ---------------------------------------------------------------------------

/**
 * A single row in the dataset of a profile.
 * Keys correspond to ColumnDefinition.key values of the owning standard's schema.
 */
export const DataPointSchema = z.record(z.union([z.string(), z.number()]));

export type DataPoint = z.infer<typeof DataPointSchema>;

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * A complete test profile record.
 * nodeId and standardId form the stable taxonomy reference — neither is a
 * display label, so renaming nodes never orphans profiles.
 */
export const ProfileSchema = z.object({
  /** Client-generated UUID. Never changes after creation. */
  id: z.string().min(1),
  /** References StandardNode.id. Stable across renames. */
  nodeId: z.string().min(1),
  /** References StandardManifest.id. Redundant but required for efficient queries. */
  standardId: z.string().min(1),
  /**
   * The ProfileSchema.version at the time this profile was created or last
   * migrated. Used by the migration engine to detect stale records.
   */
  schemaVersion: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string(),
  source: ProfileSourceSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /**
   * Metadata fields whose shape is defined by the owning standard's ProfileSchema.
   * Validated by profileEngine.validateProfile before any write.
   */
  fields: z.record(z.unknown()),
  /**
   * Time-series dataset. Each row is a Record<ColumnDefinition.key, value>.
   * The column schema is stored in the standard plugin, not here.
   */
  dataset: z.array(DataPointSchema),
});

export type Profile = z.infer<typeof ProfileSchema>;

// ---------------------------------------------------------------------------
// ProfileDraft — mutable working copy used only inside forms
// ---------------------------------------------------------------------------

/**
 * Mutable draft of a profile used exclusively by the profile creation and
 * edit forms. Dataset values are kept as strings to support controlled inputs
 * before validation and type-coercion at save time.
 */
export interface ProfileDraft {
  name: string;
  description: string;
  nodeId: string;
  standardId: string;
  /** Field values as entered by the user. May be incomplete. */
  fields: Record<string, unknown>;
  /** Dataset rows with all values as raw strings from the input elements. */
  datasetRows: Array<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// ValidationResult
// ---------------------------------------------------------------------------

/** A single field-level validation error. */
export interface ValidationError {
  /** The FieldDefinition.key or ColumnDefinition.key that failed. */
  field: string;
  message: string;
}

/** The outcome of validating a ProfileDraft against a ProfileSchema. */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
