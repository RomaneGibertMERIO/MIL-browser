import { db } from "../schema";
import type { StandardPlugin, StandardNode } from "../../domain/standard";

export async function getAllStandards(): Promise<StandardPlugin[]> {
  return db.standards.toArray();
}

export async function getStandardById(id: string): Promise<StandardPlugin | undefined> {
  return db.standards.get(id);
}

export async function getBuiltinStandards(): Promise<StandardPlugin[]> {
  return db.standards.where("manifest.isBuiltin").equals(1).toArray();
}

export async function upsertStandard(standard: StandardPlugin): Promise<void> {
  await db.transaction("rw", [db.standards, db.syncEvents], async () => {
    await db.standards.put(standard);
  });
}

export async function seedBuiltinStandard(standard: StandardPlugin): Promise<void> {
  if (!standard.manifest.isBuiltin) {
    throw new Error(`Standard "${standard.manifest.id}" is not builtin.`);
  }
  const existing = await db.standards.get(standard.manifest.id);
  if (existing !== undefined && !existing.manifest.isBuiltin) {
    throw new Error(`Conflict with user standard: ${standard.manifest.id}`);
  }
  await db.standards.put(standard);
}

export async function updateStandardNodes(standardId: string, nodes: StandardNode[]): Promise<void> {
  const standard = await getStandardById(standardId);
  if (standard === undefined) throw new Error(`Standard "${standardId}" not found.`);

  const updatedStandard: StandardPlugin = {
    ...standard,
    manifest: { ...standard.manifest, isBuiltin: false },
    nodes,
  };
  await upsertStandard(updatedStandard);
}

export async function createStandard(standard: StandardPlugin): Promise<void> {
  const existing = await getStandardById(standard.manifest.id);
  if (existing !== undefined) throw new Error(`Standard "${standard.manifest.id}" already exists.`);
  await upsertStandard(standard);
}
