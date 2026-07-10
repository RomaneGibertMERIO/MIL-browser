import type { Profile } from "../domain/profile";
import type { StandardPlugin } from "../domain/standard";
import { getEffectiveSchema, validateProfile } from "./profileEngine";

/** Validates relationships and uniqueness that structural schemas cannot express. */
export function assertValidStandard(standard: StandardPlugin): void {
  const standardId = standard.manifest.id;
  const ids = new Set<string>();

  for (const node of standard.nodes) {
    if (node.standardId !== standardId) {
      throw new Error(`Node "${node.id}" belongs to "${node.standardId}", expected "${standardId}".`);
    }
    if (ids.has(node.id)) throw new Error(`Duplicate node id "${node.id}".`);
    ids.add(node.id);
  }

  for (const node of standard.nodes) {
    if (node.parentId !== null && !ids.has(node.parentId)) {
      throw new Error(`Node "${node.id}" references missing parent "${node.parentId}".`);
    }
  }

  const byId = new Map(standard.nodes.map((node) => [node.id, node]));
  for (const node of standard.nodes) {
    const visited = new Set<string>();
    let current = node;
    while (current.parentId !== null) {
      if (visited.has(current.id)) throw new Error(`Taxonomy cycle detected at node "${current.id}".`);
      visited.add(current.id);
      const parent = byId.get(current.parentId);
      if (parent === undefined) break;
      current = parent;
    }
  }

  assertUniqueKeys(standard.profileSchema.fields.map((field) => field.key), "profile field");
  assertUniqueKeys(standard.profileSchema.datasetColumns.map((column) => column.key), "dataset column");
  for (const node of standard.nodes) {
    if (node.nodeSchema === undefined) continue;
    assertUniqueKeys(node.nodeSchema.fields.map((field) => field.key), `field on node "${node.id}"`);
    assertUniqueKeys(
      node.nodeSchema.datasetColumns.map((column) => column.key),
      `dataset column on node "${node.id}"`,
    );
  }
}

/** Ensures a profile belongs to and conforms to the supplied standard. */
export function getProfileIntegrityErrors(profile: Profile, standard: StandardPlugin): string[] {
  if (profile.standardId !== standard.manifest.id) {
    return [`standardId is "${profile.standardId}", expected "${standard.manifest.id}"`];
  }
  if (!standard.nodes.some((node) => node.id === profile.nodeId)) {
    return [`nodeId "${profile.nodeId}" does not exist in standard "${profile.standardId}"`];
  }
  if (profile.schemaVersion !== standard.profileSchema.version) {
    return [`schemaVersion is ${profile.schemaVersion}, expected ${standard.profileSchema.version}`];
  }
  const result = validateProfile(profile, getEffectiveSchema(standard, profile.nodeId));
  return result.errors.map((error) => `${error.field}: ${error.message}`);
}

function assertUniqueKeys(keys: string[], label: string): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) throw new Error(`Duplicate ${label} key "${key}".`);
    seen.add(key);
  }
}
