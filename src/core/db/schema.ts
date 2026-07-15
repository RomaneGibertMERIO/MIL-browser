import Dexie, { type Table } from "dexie";
import type { Profile } from "../domain/profile";
import type { StandardPlugin } from "../domain/standard";
import type { SyncEvent, AppSettings } from "../domain/sync";

// Helper pour générer un ID de périphérique stable en localStorage
function getOrCreateDeviceId(): string {
  let id = localStorage.getItem("mil_browser_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("mil_browser_device_id", id);
  }
  return id;
}

export class AppDatabase extends Dexie {
  profiles!: Table<Profile, string>;
  standards!: Table<StandardPlugin, string>;
  syncEvents!: Table<SyncEvent, string>;
  settings!: Table<AppSettings, string>;
  
  // DRAPEAU : Permet de désactiver temporairement les hooks d'écriture
  // lors d'une synchronisation pour éviter de créer des boucles infinies.
  public isSyncingInternal = false;

  constructor() {
    super("mil_browser_v1");

    this.version(1).stores({
      profiles:
        "id" +
        ", nodeId" +
        ", standardId" +
        ", updatedAt" +
        ", source" +
        ", [standardId+nodeId]",

      standards: "manifest.id, manifest.organization, manifest.isBuiltin",

      syncEvents:
        "id" +
        ", timestamp" +
        ", entity" +
        ", [deviceId+timestamp]",

      settings: "key",
    });

    // ── Enregistrement des Hooks Dexie optimisés (Évite les lignes en double) ──

    this.profiles.hook("creating", (primKey, obj) => {
      if (this.isSyncingInternal || obj.source === "builtin") return;
      
      // L'ID du SyncEvent devient l'ID du profil lui-même ! 
      // S'il existe déjà, .put() va simplement le mettre à jour au lieu de dupliquer la ligne.
      this.syncEvents.put({
        id: String(primKey), 
        deviceId: getOrCreateDeviceId(),
        timestamp: Date.now(),
        operation: "upsert",
        entity: "profile",
        payload: obj
      }).catch(err => console.error("Failed to track local change (Create):", err));
    });

    this.profiles.hook("updating", (mods, primKey, obj) => {
      if (this.isSyncingInternal || obj.source === "builtin") return;
      
      const updatedObj = { ...obj, ...mods };
      
      // On utilise .put() avec l'ID du profil pour écraser l'ancien état de modification locale
      this.syncEvents.put({
        id: String(primKey),
        deviceId: getOrCreateDeviceId(),
        timestamp: Date.now(),
        operation: "upsert",
        entity: "profile",
        payload: updatedObj
      }).catch(err => console.error("Failed to track local change (Update):", err));
    });

    this.profiles.hook("deleting", (primKey, obj) => {
      if (this.isSyncingInternal || obj.source === "builtin") return;

      this.syncEvents.put({
        id: String(primKey),
        deviceId: getOrCreateDeviceId(),
        timestamp: Date.now(),
        operation: "delete",
        entity: "profile",
        payload: { id: primKey, name: obj.name, standardId: obj.standardId }
      }).catch(err => console.error("Failed to track local change (Delete):", err));
    });

    this.standards.hook("updating", (mods, _primKey, obj) => {
      // SÉCURITÉ : Ne pas créer de SyncEvent si l'écriture vient de la synchro réseau ou d'un seed
      if (this.isSyncingInternal || obj.manifest?.isBuiltin) return;

      const updatedObj = { ...obj, ...mods };
      this.syncEvents.add({
        id: crypto.randomUUID(),
        deviceId: getOrCreateDeviceId(),
        timestamp: Date.now(),
        operation: "upsert",
        entity: "standard",
        payload: updatedObj
      }).catch(err => console.error("Failed to update SyncEvent (Standard):", err));
    });
  }
}

export const db = new AppDatabase();
