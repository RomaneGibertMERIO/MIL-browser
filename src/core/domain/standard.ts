/**
 * Domain model for environmental testing standards.
 *
 * A StandardPlugin is the complete self-contained definition of one standard
 * (e.g. MIL-STD-810H). It ships as a static JSON file in public/standards/ and
 * is loaded once into IndexedDB on first launch. No standard-specific logic lives
 * anywhere else in the codebase.
 *
 * Design decisions:
 * - Zod schemas are the single source of truth; TypeScript types are derived from
 *   them so validation and types can never diverge.
 * - All node IDs are stable strings chosen by the standard author. Renaming a
 *   node's label never changes its id.
 * - ProfileSchema is embedded in the plugin so importing a single JSON file gives
 *   the application everything it needs to create and validate profiles.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitive enumerations
// ---------------------------------------------------------------------------

export const NodeTypeSchema = z.enum([
  "method",
  "procedure",
  "category",
  "zone",
  "condition",
  "section",
  "custom",
]);

export type NodeType = z.infer<typeof NodeTypeSchema>;

export const FieldGroupSchema = z.enum([
  "identification",
  "conditions",
  "procedures",
  "acceptance",
  "references",
  "notes",
  "custom",
]);

export type FieldGroup = z.infer<typeof FieldGroupSchema>;

export const FieldTypeSchema = z.enum([
  "text",
  "number",
  "enum",
  "boolean",
  "multiline",
  "date",
  "duration",
]);

export type FieldType = z.infer<typeof FieldTypeSchema>;

export const AxisPositionSchema = z.enum(["x", "left", "right", "none"]);

export type AxisPosition = z.infer<typeof AxisPositionSchema>;

// ---------------------------------------------------------------------------
// Field and column schema definitions (shared by StandardNode and ProfileSchema)
// ---------------------------------------------------------------------------

/** Selectable value for enum-type fields. */
export const FieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

export type FieldOption = z.infer<typeof FieldOptionSchema>;

/** Validation rule applied to a single field value. */
export const ValidationRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("min"), value: z.number(), message: z.string() }),
  z.object({ type: z.literal("max"), value: z.number(), message: z.string() }),
  z.object({ type: z.literal("pattern"), value: z.string(), message: z.string() }),
  z.object({ type: z.literal("required"), message: z.string() }),
]);

export type ValidationRule = z.infer<typeof ValidationRuleSchema>;

/**
 * Definition of a single metadata field that appears in every profile
 * created under this standard. The key is stable; the label is display-only.
 */
export const FieldDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  group: FieldGroupSchema,
  type: FieldTypeSchema,
  /** Only meaningful when type === "enum". */
  options: z.array(FieldOptionSchema).optional(),
  required: z.boolean(),
  defaultValue: z.unknown().optional(),
  unit: z.string().optional(),
  validation: z.array(ValidationRuleSchema).default([]),
});

export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>;

/**
 * Definition of a single column in the time-series dataset of a profile.
 * Drives both the chart renderer and the data table — no hardcoded column
 * names exist anywhere in the UI layer.
 */
export const ColumnDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  unit: z.string(),
  /** Underlying data type stored in each dataset row for this column. */
  type: z.enum(["number", "string"]),
  axis: AxisPositionSchema,
  /** Hex color for the chart series. Null means auto-assigned. */
  color: z.string().nullable().default(null),
  required: z.boolean(),
  defaultValue: z.unknown().optional(),
});

export type ColumnDefinition = z.infer<typeof ColumnDefinitionSchema>;

/**
 * Optional per-node schema override. When present on a StandardNode, the
 * profile form and validation engine use these fields/columns instead of the
 * standard-level profileSchema. An empty array means "fall back to standard".
 */
export const NodeSchemaDefinitionSchema = z.object({
  fields: z.array(FieldDefinitionSchema).default([]),
  datasetColumns: z.array(ColumnDefinitionSchema).default([]),
});

export type NodeSchemaDefinition = z.infer<typeof NodeSchemaDefinitionSchema>;

// ---------------------------------------------------------------------------
// StandardNode
// ---------------------------------------------------------------------------

/**
 * A node in the hierarchical classification tree of a standard.
 * Nodes form a tree via parentId references. The id is the stable key used by
 * Profile.nodeId — it must never change after the plugin is published.
 */
export const StandardNodeSchema = z.object({
  /** Stable identifier. Never renamed after first publication. */
  id: z.string().min(1),
  /** Parent node id, or null for root-level nodes. */
  parentId: z.string().nullable(),
  /** Back-reference to the owning standard. Redundant but aids queries. */
  standardId: z.string().min(1),
  /**
   * Semantic type of this node (method, procedure, zone, …).
   * Used by the UI to decide how to label and present the node.
   */
  type: NodeTypeSchema,
  /** Short code displayed in breadcrumbs (e.g. "507", "Ia", "B3"). */
  code: z.string().min(1),
  /** Human-readable display label. May be updated freely — IDs are stable. */
  label: z.string().min(1),
  /** Sort order among siblings. Use multiples of 10 to allow later insertions. */
  order: z.number().int().nonnegative(),
  /**
   * Semantic tags for cross-standard filtering (e.g. "humid", "operational").
   * These are purely informational and not used for profile resolution.
   */
  tags: z.array(z.string()),
  /** Standard-specific extra data. Ignored by generic code. */
  metadata: z.record(z.unknown()).default({}),
  /** Optional free-text description shown in the browser and editor. */
  description: z.string().optional(),
  /** Optional base64 data-URI image for decision support in the browser. */
  imageData: z.string().optional(),
  /** Optional per-node schema override. When set, takes precedence over standard.profileSchema. */
  nodeSchema: NodeSchemaDefinitionSchema.optional(),
});

export type StandardNode = z.infer<typeof StandardNodeSchema>;

// ---------------------------------------------------------------------------
// ProfileSchema — defines what a profile for this standard must contain
// ---------------------------------------------------------------------------

/**
 * The complete schema describing what a profile created under a specific
 * standard must contain. Versioned so the migration engine can upgrade
 * existing profiles when the standard is updated.
 */
export const ProfileSchemaSchema = z.object({
  version: z.number().int().positive(),
  fields: z.array(FieldDefinitionSchema),
  datasetColumns: z.array(ColumnDefinitionSchema),
});

export type ProfileDefinition = z.infer<typeof ProfileSchemaSchema>;

// ---------------------------------------------------------------------------
// SchemaMigration
// ---------------------------------------------------------------------------

/**
 * Declarative migration instruction applied when ProfileSchema.version
 * increments. Migrations are pure transformations — no side effects.
 */
export const SchemaMigrationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("rename_field"),
    fromVersion: z.number().int(),
    toVersion: z.number().int(),
    description: z.string(),
    from: z.string(),
    to: z.string(),
  }),
  z.object({
    type: z.literal("remove_field"),
    fromVersion: z.number().int(),
    toVersion: z.number().int(),
    description: z.string(),
    key: z.string(),
  }),
  z.object({
    type: z.literal("add_field"),
    fromVersion: z.number().int(),
    toVersion: z.number().int(),
    description: z.string(),
    key: z.string(),
    defaultValue: z.unknown(),
  }),
]);

export type SchemaMigration = z.infer<typeof SchemaMigrationSchema>;

// ---------------------------------------------------------------------------
// StandardManifest & StandardPlugin
// ---------------------------------------------------------------------------

/** Identity and version information for a standard. */
export const StandardManifestSchema = z.object({
  /** Stable slug used as the foreign key in Profile.standardId. */
  id: z.string().min(1),
  version: z.string().min(1),
  /** Integer incremented on any breaking schema change. */
  schemaVersion: z.number().int().positive(),
  organization: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  /** True when this plugin ships with the application binary. */
  isBuiltin: z.boolean(),
});

export type StandardManifest = z.infer<typeof StandardManifestSchema>;

/**
 * The complete self-contained definition of one testing standard.
 * Loaded from public/standards/<id>.json and stored in IndexedDB.
 * No code changes are required to add a new standard — only a new JSON file.
 */
/**
 * Statut de validation collaborative d'un standard.
 * Aligné sur ProfileStatusSchema (core/domain/profile.ts).
 */
export const StandardStatusSchema = z.enum(["local", "pending", "approved"]);

export type StandardStatus = z.infer<typeof StandardStatusSchema>;

export const StandardSourceSchema = z.enum(["builtin", "user"]);

export type StandardSource = z.infer<typeof StandardSourceSchema>;

export const StandardPluginSchema = z.object({
  manifest: StandardManifestSchema,
  nodes: z.array(StandardNodeSchema),
  profileSchema: ProfileSchemaSchema,
  migrations: z.array(SchemaMigrationSchema).default([]),

  // ── Champs de synchronisation collaborative ──
  // Ils DOIVENT être déclarés ici : `.parse()` supprime les clés inconnues, donc
  // leur absence du schéma faisait perdre le statut à chaque import, seed ou
  // synchronisation Git — alors même que le schéma Dexie les indexe.
  // Optionnels (et non `.default()`) pour ne pas rendre obligatoire leur
  // présence sur les littéraux StandardPlugin construits dans l'UI.
  status: StandardStatusSchema.optional(),
  source: StandardSourceSchema.optional(),
  /** Dernier auteur ayant soumis une modification de ce standard. */
  lastModifiedBy: z.string().optional(),
  /** ISO-8601, positionné lors des soumissions/validations Git. */
  updatedAt: z.string().optional(),

  // ── Retour de validation (voir ProfileSchema pour la sémantique) ──
  rejectedBy: z.string().optional(),
  rejectedAt: z.string().optional(),
  rejectionReason: z.string().optional(),

  /**
   * Espace de travail auquel appartient cet enregistrement.
   *
   * - "local"  : socle d'usine (database.json) ou création faite sans dépôt
   *              central configuré. Mode autonome, hors réseau.
   * - "shared" : provient du dépôt central, qui fait alors autorité.
   *
   * L'interface n'affiche que l'espace correspondant au mode courant. Absent
   * = "local", pour que les bases déjà installées restent lisibles.
   */
  workspace: z.enum(["local", "shared"]).optional(),
});

/** Espace de travail d'un standard, avec la valeur de repli historique. */
export function standardWorkspace(standard: { workspace?: "local" | "shared" }): "local" | "shared" {
  return standard.workspace ?? "local";
}

export type StandardPlugin = z.infer<typeof StandardPluginSchema>;
