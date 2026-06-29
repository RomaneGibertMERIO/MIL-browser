import type { TaxonomyNode } from "../types";

const STORAGE_KEY = "mil_browser_taxonomy_v2";

/** Fetch the default taxonomy seed shipped with the application. */
export async function loadDefaultTaxonomy(): Promise<TaxonomyNode[]> {
  const response = await fetch("/data/taxonomy.json");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<TaxonomyNode[]>;
}

/**
 * Load taxonomy from localStorage.
 * Returns null when nothing is stored yet (triggers default seed on first run).
 */
export function loadStoredTaxonomy(): TaxonomyNode[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as TaxonomyNode[];
  } catch {
    return null;
  }
}

export function saveTaxonomy(nodes: ReadonlyArray<TaxonomyNode>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nodes));
}

//Ajout de fonction pour separer la taxonomy builtin et celle creee par l'utilisateur
export function exportTaxonomy(nodes: ReadonlyArray<TaxonomyNode>): void {
  console.log("EXPORT START");

  const blob = new Blob([JSON.stringify(nodes, null, 2)], {
    type: "application/json",
  });

  console.log("BLOB", blob.size);

  const url = URL.createObjectURL(blob);

  console.log("URL", url);

  const a = document.createElement("a");
  a.href = url;
  a.download = "taxonomy.json";

  console.log("CLICK");

  a.click();

  URL.revokeObjectURL(url);

  console.log("DONE");
}

export async function importTaxonomy(file: File): Promise<TaxonomyNode[]> {
  const text = await file.text();

  const parsed: unknown = JSON.parse(text);

  if (!Array.isArray(parsed)) {
    throw new Error("Invalid taxonomy file");
  }

  return parsed as TaxonomyNode[];
}

export function replaceTaxonomy(nodes: TaxonomyNode[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nodes));
}
