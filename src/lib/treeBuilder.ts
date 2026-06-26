import type { TaxonomyNode, TaxonomyNodeItem, RepoProfile } from '../types';

/** Resolve the full label path from root to a node using a pre-built ID→node map. */
function resolveNodePath(nodeId: string, nodeMap: Map<string, TaxonomyNode>): string[] {
  const node = nodeMap.get(nodeId);
  if (!node) return [];
  if (node.parentId === null) return [node.label];
  return [...resolveNodePath(node.parentId, nodeMap), node.label];
}

/**
 * Builds a recursive TaxonomyNodeItem tree from a flat array of TaxonomyNodes.
 * Each node is annotated with:
 *   - children  – ordered subtree
 *   - path      – full label path from root to this node
 *   - hasProfiles – true when at least one profile's taxonomyPath starts with this node's path
 */
export function buildTaxonomyTree(
  nodes: ReadonlyArray<TaxonomyNode>,
  profiles: ReadonlyArray<RepoProfile>,
): TaxonomyNodeItem[] {
  const sorted = [...nodes].sort((a, b) => a.order - b.order);
  const nodeMap = new Map<string, TaxonomyNode>(sorted.map((n) => [n.id, n]));

  // Pre-compute full paths for every node (avoids repeated tree traversals)
  const pathCache = new Map<string, string[]>();
  for (const node of sorted) {
    pathCache.set(node.id, resolveNodePath(node.id, nodeMap));
  }

  function nodeHasProfiles(nodePath: string[]): boolean {
    return profiles.some(
      (p) =>
        nodePath.length <= p.taxonomyPath.length &&
        nodePath.every((label, i) => p.taxonomyPath[i] === label),
    );
  }

  function buildChildren(parentId: string | null): TaxonomyNodeItem[] {
    return sorted
      .filter((n) => n.parentId === parentId)
      .map((n) => {
        const path = pathCache.get(n.id) ?? [n.label];
        return {
          ...n,
          path,
          children: buildChildren(n.id),
          hasProfiles: nodeHasProfiles(path),
        };
      });
  }

  return buildChildren(null);
}

/**
 * Navigates a pre-built taxonomy tree by label path and returns the node at the
 * deepest label, or null if any segment is not found.
 */
export function navigateToPath(
  tree: TaxonomyNodeItem[],
  path: string[],
): TaxonomyNodeItem | null {
  if (path.length === 0) return null;
  let nodes: TaxonomyNodeItem[] = tree;
  let found: TaxonomyNodeItem | null = null;
  for (const label of path) {
    found = nodes.find((n) => n.label === label) ?? null;
    if (!found) return null;
    nodes = found.children;
  }
  return found;
}

/**
 * Returns all profiles whose taxonomyPath begins with the given node's full path.
 * Selecting "Humidity" returns all humidity profiles; selecting "B3" returns only B3 ones.
 */
export function getProfilesForNode(
  nodePath: string[],
  profiles: ReadonlyArray<RepoProfile>,
): RepoProfile[] {
  if (nodePath.length === 0) return [];
  return profiles.filter(
    (p) =>
      nodePath.length <= p.taxonomyPath.length &&
      nodePath.every((label, i) => p.taxonomyPath[i] === label),
  );
}
