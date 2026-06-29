import type { RepositorySnapshot } from "../types/repository";
import type { RepoProfile, TaxonomyNode } from "../types";

export function exportRepository(
  profiles: ReadonlyArray<RepoProfile>,
  taxonomy: ReadonlyArray<TaxonomyNode>
): void {
  const snapshot: RepositorySnapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    taxonomy: [...taxonomy],
    profiles: [...profiles],
  };

  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "repository.json";
  a.click();

  URL.revokeObjectURL(url);
}


export async function readRepositoryFile(
    file: File
  ): Promise<RepositorySnapshot> {
    const text = await file.text();
  
    const parsed: unknown = JSON.parse(text);
  
    if (
      typeof parsed !== "object" ||
      parsed === null
    ) {
      throw new Error("Invalid repository file");
    }
  
    const snapshot = parsed as RepositorySnapshot;
  
    if (!Array.isArray(snapshot.taxonomy)) {
      throw new Error("Invalid taxonomy");
    }
  
    if (!Array.isArray(snapshot.profiles)) {
      throw new Error("Invalid profiles");
    }
  
    return snapshot;
  }