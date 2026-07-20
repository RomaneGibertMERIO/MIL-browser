import { db } from "../schema";
import type { StandardPlugin, StandardNode } from "../../domain/standard";
import { useAppStore } from "../../store/appStore";

export async function getAllStandards(): Promise<StandardPlugin[]> {
  return db.standards.toArray();
}

export async function getStandardById(id: string): Promise<StandardPlugin | undefined> {
  return db.standards.get(id);
}

export async function getBuiltinStandards(): Promise<StandardPlugin[]> {
  return db.standards.where("manifest.isBuiltin").equals(1).toArray();
}

/**
 * Insère ou met à jour un standard.
 */
export async function upsertStandard(standard: StandardPlugin): Promise<void> {
  await db.standards.put(standard);
  await useAppStore.getState().refreshLocalChanges();
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

/**
 * Met à jour la liste des nœuds de taxonomie d'un standard.
 */
export async function updateStandardNodes(standardId: string, nodes: StandardNode[]): Promise<void> {
  const standard = await getStandardById(standardId);
  if (standard === undefined) throw new Error(`Standard "${standardId}" not found.`);

  const updatedStandard: any = {
    ...standard,
    manifest: { 
      ...standard.manifest, 
      isBuiltin: false 
    },
    status: "local",
    nodes,
  };
  
  await upsertStandard(updatedStandard);
}

export async function createStandard(standard: StandardPlugin): Promise<void> {
  const existing = await getStandardById(standard.manifest.id);
  if (existing !== undefined) throw new Error(`Standard "${standard.manifest.id}" already exists.`);
  
  const newStandard: any = {
    ...standard,
    status: "local"
  };
  await upsertStandard(newStandard);
}

/**
 * Supprime un standard et tous les profils associés.
 */
export async function deleteStandardAndProfiles(id: string): Promise<void> {
  const standard = await getStandardById(id);
  if (!standard) return;
  if (standard.manifest.isBuiltin) {
    throw new Error(`Cannot delete builtin standard "${id}".`);
  }

  const profileKeys = await db.profiles
    .where("standardId")
    .equals(id)
    .primaryKeys();

  if (profileKeys.length > 0) {
    await Promise.all(profileKeys.map(key => db.profiles.delete(key)));
  }

  await db.standards.delete(id);
  await useAppStore.getState().refreshLocalChanges();
}
