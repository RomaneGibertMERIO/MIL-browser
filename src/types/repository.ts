import type { RepoProfile, TaxonomyNode } from "./index";

export interface RepositorySnapshot {
  version: number;
  exportedAt: string;

  taxonomy: TaxonomyNode[];

  profiles: RepoProfile[];
}
