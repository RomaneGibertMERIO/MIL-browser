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
 * Updated: Accepts null values to support empty fields without triggering NaN errors.
 */
export const DataPointSchema = z.record(z.union([z.string(), z.number(), z.null()]));

export type DataPoint = z.infer<typeof DataPointSchema>;

// ---------------------------------------------------------------------------
// Profile status (Pour la synchronisation collective)
// ---------------------------------------------------------------------------

export const ProfileStatusSchema = z.enum(["local", "pending", "approved"]);
export type ProfileStatus = z.infer<typeof ProfileStatusSchema>;

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const ProfileSchema = z.object({
  id: z.string().min(1),
  nodeId: z.string(),
  standardId: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string(),
  source: ProfileSourceSchema,
  
  // Nouveaux champs pour le suivi réseau
  status: ProfileStatusSchema.default("local"),
  author: z.string().default("unknown"),

  // ── Retour de validation ──
  // Renseignés quand un administrateur refuse la proposition. Le profil
  // repasse alors en "local" chez son auteur, qui conserve son travail et
  // peut lire le motif du refus avant de resoumettre.
  rejectedBy: z.string().optional(),
  rejectedAt: z.string().optional(),
  rejectionReason: z.string().optional(),

  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  fields: z.record(z.unknown()),
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
  author: string; // <-- Ajouté ici
  fields: Record<string, unknown>;
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
