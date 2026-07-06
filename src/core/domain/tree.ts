/**
 * Runtime tree types derived from StandardNode.
 *
 * StandardNode is the flat storage form. TaxonomyNodeItem is the
 * tree-resolved form used exclusively by the UI tree components and
 * the assistant wizard. It is never persisted.
 *
 * These types live in domain/ (not in a UI file) because they represent
 * a business concept — the resolved classification hierarchy — not a
 * UI implementation detail.
 */

import type { StandardNode } from "./standard";

// ---------------------------------------------------------------------------
// TaxonomyNodeItem
// ---------------------------------------------------------------------------

/**
 * A StandardNode enriched at render time with its resolved children,
 * the full label path from root to this node, and a flag indicating
 * whether any profiles reference this node or one of its descendants.
 *
 * Construction is performed by treeBuilder.buildTree() — never manually.
 */
export interface TaxonomyNodeItem extends StandardNode {
  /** Resolved children, sorted by StandardNode.order. */
  children: TaxonomyNodeItem[];
  /** Full label path from root to this node, e.g. ["Method 507", "Ia", "B3"]. */
  path: string[];
  /** True when at least one Profile.nodeId points at this node or a descendant. */
  hasProfiles: boolean;
}

// ---------------------------------------------------------------------------
// ExportEnvelope
// ---------------------------------------------------------------------------

/**
 * The top-level wrapper written to export files and read on import.
 * The meta block allows the import engine to detect version mismatches
 * and run the appropriate migrations before inserting data.
 */
export interface ExportEnvelopeMeta {
  appVersion: string;
  dbVersion: number;
  exportedAt: string;
  standards: Array<{ id: string; schemaVersion: number }>;
}

import type { StandardPlugin } from "./standard";

export interface ExportEnvelope {
  exportMeta: ExportEnvelopeMeta;

  standards: StandardPlugin[];

  profiles: unknown[];

  customFieldExtensions: unknown[];
}
