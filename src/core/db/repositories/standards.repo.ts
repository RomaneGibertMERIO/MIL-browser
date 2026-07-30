import { db, standardSyncSummary } from "../schema";
import { standardWorkspace, type StandardPlugin, type StandardNode } from "../../domain/standard";
import { useAppStore } from "../../../store/appStore";
import { getDeviceId } from "../../utils/deviceId";
import {
  putNodeImagesAndStrip,
  reconcileNodeImages,
  deleteNodeImagesForStandard,
} from "./nodeImages.repo";

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
  // Phase 8 : les images de nœuds partent dans db.nodeImages (non destructif) ;
  // la ligne du standard reste légère. Couvre pull/import/save/create/echo.
  const light = await putNodeImagesAndStrip(standard);

  // Synchro interne (pull/seed/soumission/résolution) : on ne stage rien.
  if (db.isSyncingInternal) {
    await db.standards.put(light);
    await useAppStore.getState().refreshLocalChanges();
    return;
  }

  // Édition/création utilisateur : écriture DÉTERMINISTE de l'objet + de son
  // événement (hook neutralisé), pour qu'il soit visible dès le
  // refreshLocalChanges ci-dessous — voir upsertProfile (sinon le hook différé
  // rendait la modif invisible jusqu'à l'action suivante).
  await db.transaction("rw", [db.standards, db.syncEvents], async () => {
    const before: any = await db.standards.get(light.manifest.id);
    const existingEvent = await db.syncEvents.get(light.manifest.id);
    const isNew = before === undefined;

    db.isSyncingInternal = true;
    try {
      await db.standards.put(light);
    } finally {
      db.isSyncingInternal = false;
    }

    // Built-in d'usine approuvé : pas de staging (cohérent avec les hooks).
    if (light.manifest?.isBuiltin && (light as any).status === "approved") return;

    const resolvedOrigin = ((existingEvent as any)?.origin ?? (isNew ? "create" : "update")) as "create" | "update";
    await db.syncEvents.put({
      id: light.manifest.id,
      deviceId: getDeviceId(),
      timestamp: Date.now(),
      operation: "upsert",
      entity: "standard",
      payload: standardSyncSummary(light),
      // On garde l'état antérieur AUSSI pour un objet "Created" édité après sa
      // création (= version créée), pour montrer ce qui a changé depuis. `previous`
      // ne sert qu'à l'affichage. Un objet fraîchement créé n'a rien avant.
      previous: isNew ? undefined : ((existingEvent as any)?.previous ?? standardSyncSummary(before)),
      origin: resolvedOrigin,
    });
  });

  await useAppStore.getState().refreshLocalChanges();
}

export async function seedBuiltinStandard(standard: StandardPlugin): Promise<void> {
  if (!standard.manifest.isBuiltin) {
    throw new Error(`Standard "${standard.manifest.id}" is not builtin.`);
  }
  const existing = await db.standards.get(standard.manifest.id);

  // Un enregistrement de l'espace "shared" n'est qu'un cache du dépôt central :
  // le réinstaller depuis le socle est sans perte, il sera re-tiré au prochain
  // branchement. Seule une personnalisation faite en mode autonome est protégée.
  const existingIsProtected =
    existing !== undefined &&
    standardWorkspace(existing) === "local" &&
    !existing.manifest.isBuiltin;

  if (existingIsProtected) {
    throw new Error(`Conflict with user standard: ${standard.manifest.id}`);
  }
  // Le socle d'usine appartient toujours à l'espace autonome : il ne doit pas
  // apparaître quand un dépôt central fait autorité.
  await db.standards.put(await putNodeImagesAndStrip({ ...standard, workspace: "local" }));
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
  // Chemin ÉDITEUR : les nœuds sont hydratés (vérité complète) → on réconcilie
  // les suppressions d'images (image retirée ou nœud supprimé).
  await reconcileNodeImages(standardId, nodes);
}

/**
 * Met à jour l'identité (le manifeste) d'un standard SANS toucher à son `id`
 * (clé Dexie + clé étrangère Profile.standardId) ni à ses nœuds/images.
 *
 * Comme toute édition locale, elle marque le standard « local » (brouillon
 * poussable) et le détache du socle d'usine (isBuiltin = false), à l'identique
 * d'updateStandardNodes. `id` et `schemaVersion` (sémantique de migration)
 * restent inchangés.
 */
export async function updateStandardManifest(
  id: string,
  patch: { label: string; organization: string; description: string; version: string },
): Promise<void> {
  const standard = await getStandardById(id);
  if (standard === undefined) throw new Error(`Standard "${id}" not found.`);

  const updated: StandardPlugin = {
    ...standard,
    manifest: {
      ...standard.manifest,
      label: patch.label,
      organization: patch.organization,
      description: patch.description,
      version: patch.version,
      isBuiltin: false,
    },
    status: "local",
  };
  await upsertStandard(updated);
}

export async function createStandard(standard: StandardPlugin): Promise<void> {
  const existing = await getStandardById(standard.manifest.id);
  if (existing !== undefined) throw new Error(`Standard "${standard.manifest.id}" already exists.`);
  
  const newStandard: any = {
    ...standard,
    status: "local",
    // Une création est TOUJOURS un brouillon local, y compris en mode partagé :
    // elle reste visible pour son auteur (badge « Local ») et ne devient
    // « shared » que lorsqu'elle a été poussée puis retirée du dépôt central.
    // La marquer « shared » d'emblée la ferait passer pour une norme officielle
    // avant toute validation.
    workspace: "local",
  };
  await upsertStandard(newStandard);
}

/**
 * Supprime un standard et tous les profils associés.
 */
export async function deleteStandardAndProfiles(id: string): Promise<{ reviewRequested: boolean }> {
  const standard = await getStandardById(id);
  if (!standard) return { reviewRequested: false };
  // Le socle d'usine (builtin) est désormais supprimable comme tout autre : le
  // hook « deleting » n'émet pas de tombstone pour un builtin (suppression
  // purement locale), et le bootstrap ne réinstalle le socle que si l'espace
  // local redevient vide (filet de sécurité).

  // Partagé : un standard OFFICIEL — ou dérivé d'un officiel (édité puis
  // sauvegardé, syncEvent origin "update") — passe par la revue admin (spec §17).
  // On marque seulement le standard en demande de suppression, statut "local"
  // (protégé du pull) ; les profils restent en place et la cascade réelle
  // s'exécute à l'approbation.
  if (useAppStore.getState().repoMode !== "local") {
    const event = await db.syncEvents.get(id);
    const wasOfficial = (standard as any).status === "approved" || (event as any)?.origin === "update";
    if (wasOfficial) {
      // upsertStandard stage l'événement de façon DÉTERMINISTE (payload avec
      // pendingDeletion) et rafraîchit — la demande apparaît dès la 1re action.
      await upsertStandard({ ...standard, status: "local", pendingDeletion: true } as any);
      return { reviewRequested: true };
    }
  }

  const profileKeys = await db.profiles
    .where("standardId")
    .equals(id)
    .primaryKeys();

  const standalone = useAppStore.getState().repoMode === "local";
  // En mode partagé, on lit les profils AVANT la suppression pour écrire des
  // pierres tombales DÉTERMINISTES (au lieu des hooks "deleting" différés qui
  // rataient le refresh immédiat — même bug "à faire deux fois").
  const affectedProfiles = standalone
    ? []
    : await db.profiles.where("standardId").equals(id).toArray();

  // On neutralise TOUJOURS les hooks pendant la cascade (suppression
  // déterministe) et on écrit nous-mêmes les événements ci-dessous.
  const was = db.isSyncingInternal;
  db.isSyncingInternal = true;
  try {
    if (profileKeys.length > 0) {
      await Promise.all(profileKeys.map((key) => db.profiles.delete(key)));
    }
    await db.standards.delete(id);
  } finally {
    db.isSyncingInternal = was;
  }

  if (standalone) {
    // Autonome : aucune propagation, on purge simplement les événements locaux.
    await db.syncEvents.bulkDelete([id, ...profileKeys.map((k) => String(k))]);
  } else {
    // Partagé : pierres tombales déterministes (standard + chacun de ses profils),
    // propagées au prochain push (comportement conservé, mais visible tout de suite).
    const dev = getDeviceId();
    const now = Date.now();
    await db.syncEvents.put({
      id,
      deviceId: dev,
      timestamp: now,
      operation: "delete",
      entity: "standard",
      payload: { id, label: (standard as any).manifest?.label },
    });
    for (const p of affectedProfiles) {
      await db.syncEvents.put({
        id: p.id,
        deviceId: dev,
        timestamp: now,
        operation: "delete",
        entity: "profile",
        payload: { id: p.id, name: p.name, standardId: p.standardId },
      });
    }
  }

  await deleteNodeImagesForStandard(id); // GC des images du standard supprimé
  await useAppStore.getState().refreshLocalChanges();
  return { reviewRequested: false };
}
