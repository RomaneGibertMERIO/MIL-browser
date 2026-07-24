/**
 * Stockage séparé des images de nœuds (phase 8).
 *
 * Les images base64 (`data:` URIs) sont retirées des lignes de db.standards et
 * rangées dans db.nodeImages (clé [standardId+nodeId]) pour que la live-query de
 * la liste des normes cesse de désérialiser des Mo à chaque écriture (cause du
 * gel). Elles sont ré-attachées UNIQUEMENT à l'affichage et aux points de sortie
 * (push / export). gitService reste inchangé : le JSON du partage porte toujours
 * les images (ré-attachées au moment du push).
 *
 * Règle d'or : le STRIP à l'écriture est NON DESTRUCTIF (on n'écrit que les
 * images présentes, on ne supprime jamais une image parce qu'un nœud arrive déjà
 * allégé — sinon un ré-enregistrement pull/approve effacerait les images). Les
 * suppressions réelles passent par reconcileNodeImages (éditeur, nœuds hydratés)
 * et deleteNodeImagesForStandard (suppression de norme).
 *
 * Prédicat : seules les URIs `data:` sont déplacées. Les builtin utilisent des
 * chemins de fichiers ('./images/…'), légers, laissés en place.
 */
import { db, type NodeImage } from "../schema";
import type { StandardPlugin, StandardNode } from "../../domain/standard";

function isInlineImage(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("data:");
}

/** Copie allégée du standard (imageData `data:` retiré) + images extraites. Pur. */
export function stripNodeImages(standard: StandardPlugin): { light: StandardPlugin; images: NodeImage[] } {
  const images: NodeImage[] = [];
  const nodes = standard.nodes.map((n) => {
    if (!isInlineImage(n.imageData)) return n;
    images.push({ standardId: standard.manifest.id, nodeId: n.id, data: n.imageData });
    const copy: StandardNode = { ...n };
    delete copy.imageData;
    return copy;
  });
  return { light: { ...standard, nodes }, images };
}

/**
 * Non destructif : écrit les images présentes dans db.nodeImages puis renvoie le
 * standard ALLÉGÉ à persister dans db.standards. À appeler juste avant tout
 * db.standards.put.
 */
export async function putNodeImagesAndStrip(standard: StandardPlugin): Promise<StandardPlugin> {
  const { light, images } = stripNodeImages(standard);
  if (images.length > 0) await db.nodeImages.bulkPut(images);
  return light;
}

/** Ré-attache les images de db.nodeImages sur les nœuds (affichage / export / push). */
export async function attachNodeImages(standard: StandardPlugin): Promise<StandardPlugin> {
  const rows = await db.nodeImages.where("standardId").equals(standard.manifest.id).toArray();
  if (rows.length === 0) return standard;
  const byNode = new Map(rows.map((r) => [r.nodeId, r.data]));
  const nodes = standard.nodes.map((n) => {
    const data = byNode.get(n.id);
    return data !== undefined ? { ...n, imageData: data } : n;
  });
  return { ...standard, nodes };
}

/** Charge une image de nœud à la demande (affichage). */
export async function getNodeImage(standardId: string, nodeId: string): Promise<string | null> {
  const row = await db.nodeImages.get([standardId, nodeId]);
  return row?.data ?? null;
}

/** GC : supprime toutes les images d'un standard (suppression de norme). */
export async function deleteNodeImagesForStandard(standardId: string): Promise<void> {
  await db.nodeImages.where("standardId").equals(standardId).delete();
}

/**
 * Réconciliation depuis l'éditeur (nœuds HYDRATÉS = vérité complète du standard) :
 * ne garde que les images des nœuds encore présents ET porteurs d'une image ;
 * supprime les autres (images retirées + nœuds supprimés). NE PAS appeler avec
 * des nœuds allégés (pull/approve) — cela effacerait les images.
 */
export async function reconcileNodeImages(standardId: string, hydratedNodes: StandardNode[]): Promise<void> {
  const keep = new Set(hydratedNodes.filter((n) => isInlineImage(n.imageData)).map((n) => n.id));
  const existing = await db.nodeImages.where("standardId").equals(standardId).primaryKeys();
  const toDelete = existing.filter(([, nodeId]) => !keep.has(nodeId));
  if (toDelete.length > 0) await db.nodeImages.bulkDelete(toDelete);
}

/**
 * Migration unique (bootstrap) : draine les images base64 inline déjà présentes
 * dans db.standards vers db.nodeImages et allège les lignes. Idempotent (une
 * ligne déjà allégée n'a plus d'`imageData` en `data:`). Les hooks de synchro
 * sont neutralisés pour ne pas générer d'événements pour cette réécriture.
 */
export async function extractStandardImages(): Promise<void> {
  const all = await db.standards.toArray();
  const wasSyncing = db.isSyncingInternal;
  db.isSyncingInternal = true;
  try {
    for (const std of all) {
      const { light, images } = stripNodeImages(std);
      if (images.length === 0) continue; // déjà allégé
      await db.nodeImages.bulkPut(images);
      await db.standards.put(light);
    }
  } finally {
    db.isSyncingInternal = wasSyncing;
  }
}
