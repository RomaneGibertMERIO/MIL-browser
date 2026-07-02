/**
 * Taxonomy tree builder.
 *
 * Converts the flat StandardNode array stored in a StandardPlugin into the
 * nested TaxonomyNodeItem tree consumed by the sidebar, the assistant wizard,
 * and the Browse view.
 *
 * This module is pure: it takes data, returns data, has no side effects, and
 * never touches the database. It can be called in any context.
 *
 * Performance note: buildTree() pre-computes all node paths in a single pass
 * to avoid O(depth²) recursion cost on deep trees.
 */

import type { StandardNode } from "../domain/standard";
import type { TaxonomyNodeItem } from "../domain/tree";
import type { Profile } from "../domain/profile";

// ---------------------------------------------------------------------------
// buildTree
// ---------------------------------------------------------------------------

/**
 * Builds a recursive TaxonomyNodeItem tree from a flat array of StandardNodes.
 *
 * Each node is annotated with:
 * - children  — ordered subtree
 * - path      — full label path from root to this node
 * - hasProfiles — true when at least one profile's nodeId is in this subtree
 *
 * @param nodes    Flat array of StandardNode from a StandardPlugin.
 * @param profiles Profiles to evaluate for the hasProfiles flag.
 *                 Pass an empty array if the flag is not needed.
 */
export function buildTree(
  nodes: ReadonlyArray<StandardNode>,
  profiles: ReadonlyArray<Profile>,
): TaxonomyNodeItem[] {
  // Sort once by order so all subsequent operations work on a stable array.
  const sorted = [...nodes].sort((a, b) => a.order - b.order);

  // Build an id → node map for O(1) parent lookups during path resolution.
  const nodeMap = new Map<string, StandardNode>(sorted.map((n) => [n.id, n]));

  // Pre-compute full label paths for every node.
  const pathCache = new Map<string, string[]>();
  for (const node of sorted) {
    pathCache.set(node.id, resolvePath(node.id, nodeMap));
  }

  // Build a set of nodeIds that have at least one profile, for O(1) lookup.
  const profileNodeIds = new Set<string>(profiles.map((p) => p.nodeId));

  // Recursively builds children for a given parentId.
  function buildChildren(parentId: string | null): TaxonomyNodeItem[] {
    return sorted
      .filter((n) => n.parentId === parentId)
      .map((n): TaxonomyNodeItem => {
        const path = pathCache.get(n.id) ?? [n.label];
        const children = buildChildren(n.id);

        // A node hasProfiles if it directly has one, or any descendant does.
        const hasProfiles =
          profileNodeIds.has(n.id) ||
          children.some((c) => c.hasProfiles);

        return { ...n, path, children, hasProfiles };
      });
  }

  return buildChildren(null);
}

// ---------------------------------------------------------------------------
// navigateToNode
// ---------------------------------------------------------------------------

/**
 * Traverses a pre-built tree by an array of node ids and returns the node
 * at the deepest id, or null if any id is not found.
 *
 * The path is a sequence of ids from root to the target node. The function
 * visits each level in order and descends through children.
 */
export function navigateToNode(
  tree: TaxonomyNodeItem[],
  nodeIds: string[],
): TaxonomyNodeItem | null {
  if (nodeIds.length === 0) return null;

  let current: TaxonomyNodeItem[] = tree;
  let found: TaxonomyNodeItem | null = null;

  for (const id of nodeIds) {
    found = current.find((n) => n.id === id) ?? null;
    if (found === null) return null;
    current = found.children;
  }

  return found;
}

// ---------------------------------------------------------------------------
// getProfilesForNode
// ---------------------------------------------------------------------------

/**
 * Returns all profiles whose nodeId is exactly the given node, or belongs
 * to one of its descendants (transitively).
 *
 * This is the correct semantic for the Browse view: selecting "Method 507"
 * shows all humidity profiles, selecting "Zone B3" shows only B3 profiles.
 *
 * @param node     The root of the subtree to match.
 * @param profiles All profiles to filter (typically for one standard).
 */
export function getProfilesForNode(
  node: TaxonomyNodeItem,
  profiles: ReadonlyArray<Profile>,
): Profile[] {
  const subtreeIds = collectSubtreeIds(node);
  return profiles.filter((p) => subtreeIds.has(p.nodeId));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolves the full label path from root to a node using the id→node map. */
function resolvePath(nodeId: string, nodeMap: Map<string, StandardNode>): string[] {
  const node = nodeMap.get(nodeId);
  if (node === undefined) return [];
  if (node.parentId === null) return [node.label];
  return [...resolvePath(node.parentId, nodeMap), node.label];
}

/** Returns the set of all node ids in the subtree rooted at the given node. */
function collectSubtreeIds(node: TaxonomyNodeItem): Set<string> {
  const ids = new Set<string>([node.id]);
  for (const child of node.children) {
    for (const id of collectSubtreeIds(child)) {
      ids.add(id);
    }
  }
  return ids;
}
