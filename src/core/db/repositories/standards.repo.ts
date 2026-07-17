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

/**
 * Insère ou met à jour un standard.
 */
export async function upsertStandard(standard: StandardPlugin): Promise<void> {
  await db.standards.put(standard);
}

export async function seedBuiltinStandard(standard: StandardPlugin): Promise<void> {
  if (!standard.manifest.isBuiltin) {
    throw new Error(`Standard "${standard.manifest.id}" is not builtin.`);
  }
  const existing = await db.standards.get(standard.manifest.id);
  // On ne laisse pas le seed écraser une version utilisateur ou modifiée
  if (existing !== undefined && !existing.manifest.isBuiltin) {
    throw new Error(`Conflict with user standard: ${standard.manifest.id}`);
  }
  await db.standards.put(standard);
}

/**
 * Met à jour la liste des nœuds de taxonomie d'un standard.
 * Marque automatiquement le standard en tant que "local" (modifié localement à pousser).
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
    status: "local", // 👈 Crucial : le standard passe en modification locale à pousser !
    nodes,
  };
  
  await upsertStandard(updatedStandard);
}

export async function createStandard(standard: StandardPlugin): Promise<void> {
  const existing = await getStandardById(standard.manifest.id);
  if (existing !== undefined) throw new Error(`Standard "${standard.manifest.id}" already exists.`);
  
  const newStandard: any = {
    ...standard,
    status: "local" // Nouveau standard créé localement
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

  // 1. Récupère toutes les clés des profils associés à ce standard
  const profileKeys = await db.profiles
    .where("standardId")
    .equals(id)
    .primaryKeys();

  // 2. Supprime les profils un par un pour déclencher le hook de synchro "deleting"
  if (profileKeys.length > 0) {
    await Promise.all(profileKeys.map(key => db.profiles.delete(key)));
  }

  // 3. Supprime le standard (déclenche le hook "deleting" sur la table standards)
  await db.standards.delete(id);
}
