import { useState, useEffect, useCallback } from "react";
import type { TaxonomyNode, CanonicalCondition } from "../types";
import {
  loadStoredTaxonomy,
  loadDefaultTaxonomy,
  saveTaxonomy,
  replaceTaxonomy,
} from "../lib/taxonomyStorage";

function generateId(): string {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Fields that can be changed when editing a node */
export interface TaxonomyNodeUpdate {
  label: string;
  parentId: string | null;
  imageKey?: string;
  canonicalCondition?: CanonicalCondition;
}

export interface UseTaxonomyResult {
  readonly nodes: ReadonlyArray<TaxonomyNode>;
  readonly isLoading: boolean;
  readonly error: string | null;

  addNode: (parentId: string | null, label: string) => TaxonomyNode;
  updateNode: (id: string, updates: TaxonomyNodeUpdate) => void;
  deleteNode: (id: string) => void;

  getSubtreeIds: (id: string) => string[];

  importTaxonomy: (nodes: TaxonomyNode[]) => void;
  replaceAllNodes: (nodes: TaxonomyNode[]) => void;
}

export function useTaxonomy(): UseTaxonomyResult {
  const [nodes, setNodes] = useState<TaxonomyNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const replaceAllNodes = useCallback((nodes: TaxonomyNode[]) => {
    replaceTaxonomy(nodes);
    setNodes(nodes);
  }, []);

  useEffect(() => {
    const stored = loadStoredTaxonomy();

    if (stored !== null) {
      setNodes(stored);
      setIsLoading(false);
    } else {
      loadDefaultTaxonomy()
        .then((defaultNodes) => {
          saveTaxonomy(defaultNodes);
          setNodes(defaultNodes);
          setIsLoading(false);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err));
          setIsLoading(false);
        });
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === "mil_browser_taxonomy_v2") {
        const updated = loadStoredTaxonomy();
        if (updated) setNodes(updated);
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const persist = useCallback((updated: TaxonomyNode[]) => {
    saveTaxonomy(updated);
    setNodes(updated);
  }, []);

  const importTaxonomy = useCallback((nodes: TaxonomyNode[]) => {
    replaceTaxonomy(nodes);
    setNodes(nodes);
  }, []);

  const addNode = useCallback(
    (parentId: string | null, label: string): TaxonomyNode => {
      const siblings = nodes.filter((n) => n.parentId === parentId);
      const maxOrder = siblings.reduce((max, n) => Math.max(max, n.order), 0);

      const node: TaxonomyNode = {
        id: generateId(),
        parentId,
        label: label.trim(),
        order: maxOrder + 10,
      };

      persist([...nodes, node]);
      return node;
    },
    [nodes, persist]
  );

  const updateNode = useCallback(
    (id: string, updates: TaxonomyNodeUpdate) => {
      persist(
        nodes.map((n) =>
          n.id === id
            ? {
                ...n,
                label: updates.label.trim(),
                parentId: updates.parentId,
                imageKey: updates.imageKey,
                canonicalCondition: updates.canonicalCondition,
              }
            : n
        )
      );
    },
    [nodes, persist]
  );

  const getSubtreeIds = useCallback(
    (id: string): string[] => {
      const result: string[] = [id];
      const children = nodes.filter((n) => n.parentId === id);

      for (const child of children) {
        result.push(...getSubtreeIds(child.id));
      }
      return result;
    },
    [nodes]
  );

  const deleteNode = useCallback(
    (id: string) => {
      const subtree = new Set(getSubtreeIds(id));
      persist(nodes.filter((n) => !subtree.has(n.id)));
    },
    [nodes, persist, getSubtreeIds]
  );

  return {
    nodes,
    isLoading,
    error,
    addNode,
    updateNode,
    deleteNode,
    getSubtreeIds,
    importTaxonomy,
    replaceAllNodes,
  };
}
