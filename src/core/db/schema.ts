import Dexie, { type Table } from "dexie";
import type { Profile } from "../domain/profile";
import type { StandardPlugin } from "../domain/standard";
import type { SyncEvent, AppSettings } from "../domain/sync";

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem("mil_browser_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("mil_browser_device_id", id);
  }
  return id;
}

/**
 * Résumé léger d'un standard pour le journal de synchronisation.
 *
 * On exclut délibérément `nodes` : leurs images base64 pouvaient peser ~16 Mo,
 * et le journal est rechargé entièrement (refreshLocalChanges) à chaque
 * modification locale. On ne conserve que ce dont l'affichage a besoin
 * (nom/organisation) ; la version complète est relue depuis db.standards au
 * moment du push.
 */
export function standardSyncSummary(std: any): any {
  return {
    id: std?.manifest?.id,
    manifest: std?.manifest,
    status: std?.status,
    source: std?.source,
    lastModifiedBy: std?.lastModifiedBy,
  };
}

/**
 * Image de nœud stockée HORS de la ligne du standard (phase 8).
 *
 * Les images (`data:` URIs base64) vivaient inline dans StandardNode.imageData,
 * ce qui rendait chaque ligne de db.standards lourde (jusqu'à ~16 Mo) et gelait
 * la live-query de la liste des normes à chaque écriture. Elles sont désormais
 * dans cette table séparée, clé composite [standardId+nodeId]. Les lignes de
 * db.standards restent légères ; les images sont ré-attachées à l'affichage et
 * aux points de sortie (push/export) uniquement.
 */
export interface NodeImage {
  standardId: string;
  nodeId: string;
  data: string; // data: URI (base64)
}

export class AppDatabase extends Dexie {
  profiles!: Table<Profile, string>;
  standards!: Table<StandardPlugin, string>;
  syncEvents!: Table<SyncEvent, string>;
  settings!: Table<AppSettings, string>;
  nodeImages!: Table<NodeImage, [string, string]>;

  public isSyncingInternal = false;

  constructor() {
    super("mil_browser_v1");

    this.version(1).stores({
      profiles: "id, nodeId, standardId, updatedAt, source, status, [standardId+nodeId]",
      standards: "manifest.id, manifest.organization, manifest.isBuiltin, status, source",
      syncEvents: "id, timestamp, entity",
      settings: "key",
    });

    // v2 (phase 8) : table séparée pour les images de nœuds (voir NodeImage).
    this.version(2).stores({
      nodeImages: "[standardId+nodeId], standardId",
    });

    // ── HOOK PROFILES ──
    this.profiles.hook("creating", (primKey, obj) => {
      if (this.isSyncingInternal) return;
      
      const profile = obj as Profile;
      if (profile.source === "builtin") return;
      
      setTimeout(() => {
        this.syncEvents.put({
          id: String(primKey),
          deviceId: getOrCreateDeviceId(),
          timestamp: Date.now(),
          operation: "upsert",
          entity: "profile",
          payload: obj,
          origin: "create",
        }).catch(err => console.error("Event error (Profile Create):", err));
      }, 0);
    });

    this.profiles.hook("updating", (mods, primKey, obj) => {
      if (this.isSyncingInternal) return;

      const profile = obj as Profile;
      const updatedMods = mods as Partial<Profile>;

      if (profile.source === "builtin" && updatedMods.source !== "user") return;
      
      const preImage = { ...(obj as Profile) }; // état AVANT cette modification
      setTimeout(() => {
        // On relit l'objet RÉEL post-écriture. Reconstruire le nouvel objet via
        // { ...obj, ...mods } casse les changements imbriqués : Dexie représente
        // une modif de champ imbriqué en clé pointée ("fields.temperature"), donc
        // le spread garderait l'ancien objet `fields` et le diff ne verrait rien.
        void Promise.all([
          this.profiles.get(String(primKey)),
          this.syncEvents.get(String(primKey)),
        ])
          .then(([fresh, existing]) => {
            if (!fresh) return;
            return this.syncEvents.put({
              id: String(primKey),
              deviceId: getOrCreateDeviceId(),
              timestamp: Date.now(),
              operation: "upsert",
              entity: "profile",
              payload: fresh,
              // Référence du diff : la version d'avant la 1re modif non
              // synchronisée, conservée à travers les éditions suivantes.
              previous: existing?.previous ?? preImage,
              // Un objet créé localement reste "Created" même après édition.
              origin: existing?.origin ?? "update",
            });
          })
          .catch((err) => console.error("Event error (Profile Update):", err));
      }, 0);
    });

    this.profiles.hook("deleting", (primKey, obj) => {
      if (this.isSyncingInternal) return;

      const profile = obj as Profile;
      if (profile.source === "builtin") return;

      setTimeout(() => {
        this.syncEvents.put({
          id: String(primKey),
          deviceId: getOrCreateDeviceId(),
          timestamp: Date.now(),
          operation: "delete",
          entity: "profile",
          payload: { id: primKey, name: profile.name, standardId: profile.standardId }
        }).catch(err => console.error("Event error (Profile Delete):", err));
      }, 0);
    });

    // ── HOOK STANDARDS ──
    this.standards.hook("creating", (primKey, obj) => {
      if (this.isSyncingInternal) return;

      const standard = obj as any;
      if (standard.manifest?.isBuiltin && standard.status === "approved") return;

      setTimeout(() => {
        this.syncEvents.put({
          id: String(primKey),
          deviceId: getOrCreateDeviceId(),
          timestamp: Date.now(),
          operation: "upsert",
          entity: "standard",
          // Résumé léger, PAS le standard complet : les noeuds portent des
          // images base64 (jusqu'à ~16 Mo). Les stocker ici gonflait chaque
          // événement et gelait refreshLocalChanges à la moindre modification.
          // submitCommit relit la version complète depuis db.standards au push.
          payload: standardSyncSummary(obj),
          origin: "create",
        }).catch(err => console.error("Event error (Standard Create):", err));
      }, 0);
    });

    this.standards.hook("updating", (mods, primKey, obj) => {
      if (this.isSyncingInternal) return;

      const standard = obj as any;
      const updatedMods = mods as any;
      
      // Si c'est un pur builtin d'usine non modifié (et qu'on ne cherche pas à le passer en local / pending)
      if (standard.manifest?.isBuiltin && updatedMods.status !== "pending" && updatedMods.status !== "local") {
        return;
      }

      const preImage = standardSyncSummary(obj); // résumé léger d'AVANT la modif
      setTimeout(() => {
        // On relit l'objet RÉEL post-écriture (voir le hook profil "updating") :
        // { ...obj, ...mods } casse les changements imbriqués du manifeste.
        void Promise.all([
          this.standards.get(String(primKey)),
          this.syncEvents.get(String(primKey)),
        ])
          .then(([fresh, existing]) => {
            if (!fresh) return;
            return this.syncEvents.put({
              id: String(primKey),
              deviceId: getOrCreateDeviceId(),
              timestamp: Date.now(),
              operation: "upsert",
              entity: "standard",
              // Résumé léger (voir le hook "creating" ci-dessus).
              payload: standardSyncSummary(fresh),
              // Référence du diff, conservée à travers les éditions successives.
              previous: existing?.previous ?? preImage,
              // Un standard créé localement reste "Created" même après édition.
              origin: existing?.origin ?? "update",
            });
          })
          .catch((err) => console.error("Event error (Standard Update):", err));
      }, 0);
    });

    // AJOUT : Hook deleting pour les standards
    this.standards.hook("deleting", (primKey, obj) => {
      if (this.isSyncingInternal) return;

      const standard = obj as any;
      if (standard.manifest?.isBuiltin) return;

      setTimeout(() => {
        this.syncEvents.put({
          id: String(primKey),
          deviceId: getOrCreateDeviceId(),
          timestamp: Date.now(),
          operation: "delete",
          entity: "standard",
          payload: { id: primKey, label: standard.manifest?.label }
        }).catch(err => console.error("Event error (Standard Delete):", err));
      }, 0);
    });
  }
}

export const db = new AppDatabase();
