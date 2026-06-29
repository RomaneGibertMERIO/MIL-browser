// ---------------------------------------------------------------------------
// Unified data model — one profile repository, one taxonomy, no split.
// ---------------------------------------------------------------------------

/** Top-level application mode. */
export type AppMode = "assistant" | "admin";

// ---------------------------------------------------------------------------
// Canonical business concepts
// ---------------------------------------------------------------------------

/**
 * Canonical condition type — the business concept of when a test occurs.
 * Each standard may label this differently (MIL: "Operational", AECTP: "Natural").
 * Stored internally as a canonical value; displayed using standard-specific labels.
 */
export type CanonicalCondition = "operational" | "storage";

// ---------------------------------------------------------------------------
// Standards — loaded from /data/standards.json, never hardcoded.
// ---------------------------------------------------------------------------

export interface Standard {
  readonly id: string;
  readonly label: string;
  readonly version: string;
  readonly organization: string;
  readonly description: string;
  /**
   * Maps canonical condition keys to the display label used by this standard.
   * Example — MIL-STD-810H: { operational: "Operational", storage: "Storage" }
   * Example — AECTP-230:    { operational: "Natural",     storage: "Induced"  }
   */
  readonly conditionLabels: Readonly<Record<CanonicalCondition, string>>;
}

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

/** A node in the configurable taxonomy tree, persisted in localStorage. */
export interface TaxonomyNode {
  id: string;
  parentId: string | null;
  label: string;
  /** Sibling sort order; multiples of 10 leave room for future insertions. */
  order: number;
  /**
   * Optional filename for a contextual visual aid image (served from /images/).
   * Administrators set this via the Taxonomy editor; it is shown automatically
   * during the assistant selection step that follows this node.
   */
  imageKey?: string;
  /**
   * Canonical condition this node represents.
   * Drives standard-specific label translation in the assistant.
   */
  canonicalCondition?: CanonicalCondition;
}

/** A TaxonomyNode enriched with resolved children and profile-presence flag. */
export interface TaxonomyNodeItem extends TaxonomyNode {
  children: TaxonomyNodeItem[];
  /** True if at least one profile's taxonomyPath passes through this node. */
  hasProfiles: boolean;
  /** Full label path from root to this node. */
  path: string[];
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/** A single time-stamped data point in an environmental test profile. */
export interface DataPoint {
  time: string; // e.g. "0100", "1200", "2400"
  temp_c: number; // Temperature in °C
  rh_percent: number; // Relative Humidity in %RH
}

/**
 * The unified profile model used for BOTH builtin and user-created profiles.
 * All filtering, storage and searching uses canonical values.
 */
export interface RepoProfile {
  id: string;
  name: string;
  description: string;
  /** Which testing standard this profile belongs to (references Standard.id). */
  standardId: string;
  /** Canonical condition type derived from the taxonomy path. */
  conditionType?: CanonicalCondition;
  /** Ordered label path from root taxonomy node to the profile's leaf node. */
  taxonomyPath: string[];
  dataset: DataPoint[];
  source: "builtin" | "user";
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Draft types — mutable, used only inside forms before validation/persist.
// ---------------------------------------------------------------------------

export interface ProfileDraft {
  name: string;
  description: string;
  /** Standard this profile belongs to. */
  standardId: string;
  /** Derived from the taxonomy path; auto-populated by the form. */
  conditionType?: CanonicalCondition;
  taxonomyPath: string[];
  dataset: DataPointDraft[];
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/** A single time-stamped data point in an environmental test profile. */
export interface DataPoint {
  time: string; // e.g. "0100", "1200", "2400"
  temp_c: number; // Temperature in °C
  rh_percent: number; // Relative Humidity in %RH
}

// ---------------------------------------------------------------------------
// Draft types — mutable, used only inside forms before validation/persist.
// ---------------------------------------------------------------------------

/**
 * A node in the navigation tree of a standard.
 * Nodes form an ordered tree via parentId references.
 * A null parentId means the node is a root-level entry for its standard.
 */
export interface TreeNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly standardId: string;
  readonly label: string;
  /** Used to sort siblings; use multiples of 10 to allow future insertions. */
  readonly order: number;
}

/**
 * Which Y-axis a column is plotted on, or 'x' for the horizontal axis.
 * 'none' means the column appears in the data table but is excluded from the chart.
 */
/**
 * Which axis a column is plotted on.
 * 'none' means table-only data (kept out of the chart).
 */
export type AxisPosition = "x" | "left" | "right" | "none";

/** Underlying data type stored in a data point for this column. */
export type ColumnDataType = "string" | "number";

/**
 * Definition of a single data column within a profile.
 * Column definitions drive both the chart and the data table — no
 * standard-specific display logic is required anywhere in the UI.
 */
export interface ProfileColumn {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly axis: AxisPosition;
  /** Hex color used for chart series; null lets the component pick a default. */
  readonly color: string | null;
  readonly dataType: ColumnDataType;
}

/**
 * A test profile definition (metadata + column schema).
 * Actual data points are stored separately and loaded on demand.
 */
export interface Profile {
  readonly id: string;
  readonly nodeId: string;
  readonly name: string;
  readonly description: string;
  readonly tags: ReadonlyArray<string>;
  readonly columns: ReadonlyArray<ProfileColumn>;
  /** Arbitrary key-value pairs displayed in the metadata panel. */
  readonly metadata: Readonly<Record<string, string>>;
}

/**
 * A single row of profile data.
 * Keys correspond to ProfileColumn.key values for the owning profile.
 */
export type ProfileDataPoint = Record<string, string | number>;

// ---------------------------------------------------------------------------
// Derived / runtime types used by UI components
// ---------------------------------------------------------------------------

/** A TreeNode enriched with its resolved children and profile-presence flag. */
export interface TreeNodeItem extends TreeNode {
  readonly children: ReadonlyArray<TreeNodeItem>;
  /** True if at least one Profile references this node directly. */
  readonly hasProfiles: boolean;
}

/** Top-level application data store loaded at startup. */
export interface DataStore {
  readonly standards: ReadonlyArray<Standard>;
  readonly nodes: ReadonlyArray<TreeNode>;
  readonly profiles: ReadonlyArray<Profile>;
  readonly isLoading: boolean;
  readonly error: string | null;
}

// ---------------------------------------------------------------------------
// Library Management types
// ---------------------------------------------------------------------------

/** Active top-level view in the application. */
export type AppView = "browse" | "library" | "taxonomy";

/**
 * Classification taxonomy for environmental profiles.
 * Loaded from /data/library/classification.json — never hardcoded in components.
 */
export interface ClassificationConfig {
  readonly standards: ReadonlyArray<string>;
  readonly testTypes: ReadonlyArray<string>;
  readonly zones: ReadonlyArray<string>;
  readonly exposureModes: ReadonlyArray<string>;
  readonly environmentSources: ReadonlyArray<string>;
  readonly profileShapes: ReadonlyArray<string>;
}

/** A single data point in a managed environmental profile dataset. */
export interface LibraryDataPoint {
  readonly id: string;
  readonly time: string;
  readonly temp_c: number;
  readonly rh_percent: number;
}

/** A managed environmental profile stored in the local library. */
export interface LibraryProfile {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly standard: string;
  readonly testType: string;
  readonly zone: string;
  readonly exposureMode: string;
  readonly environmentSource: string;
  readonly profileShape: string;
  readonly dataset: ReadonlyArray<LibraryDataPoint>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Mutable draft used in the profile creation / edit form.
 * Numeric dataset fields are kept as strings to support controlled inputs
 * before being parsed and validated on save.
 */
export interface LibraryDataPointDraft {
  id: string;
  time: string;
  temp_c: string;
  rh_percent: string;
}

export interface LibraryProfileDraft {
  name: string;
  description: string;
  standard: string;
  testType: string;
  zone: string;
  exposureMode: string;
  environmentSource: string;
  profileShape: string;
  dataset: LibraryDataPointDraft[];
}

export interface DataPointDraft {
  id: string;
  time: string;
  temp_c: string;
  rh_percent: string;
}
