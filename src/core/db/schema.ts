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

// ── Enregistrement des Hooks Dexie pour la synchronisation automatique ──

    // Hook lors de la création / mise à jour d'un PROFIL (primKey changé en _primKey)
    this.profiles.hook("creating", (_primKey, obj) => {
      // Ignorer si la source est un seed ou déjà synchronisé
      if (obj.source === "builtin") return;
      
      this.syncEvents.add({
        id: crypto.randomUUID(),
        deviceId: getOrCreateDeviceId(),
        timestamp: Date.now(),
        operation: "upsert",
        entity: "profile",
        payload: obj
      }).catch(err => console.error("Failed to create SyncEvent (Profile):", err));
    });

    // primKey changé en _primKey
    this.profiles.hook("updating", (mods, _primKey, obj) => {
      if (obj.source === "builtin") return;
      
      const updatedObj = { ...obj, ...mods };
      this.syncEvents.add({
        id: crypto.randomUUID(),
        deviceId: getOrCreateDeviceId(),
        timestamp: Date.now(),
        operation: "upsert",
        entity: "profile",
        payload: updatedObj
      }).catch(err => console.error("Fail to update SyncEvent (Profile):", err));
    });

    // Hook lors de la suppression d'un PROFIL (on garde primKey car il est utilisé dans le payload !)
    this.profiles.hook("deleting", (primKey, obj) => {
      if (obj.source === "builtin") return;

      this.syncEvents.add({
        id: crypto.randomUUID(),
        deviceId: getOrCreateDeviceId(),
        timestamp: Date.now(),
        operation: "delete",
        entity: "profile",
        payload: { id: primKey }
      }).catch(err => console.error("Failed to delete SyncEvent (Profile):", err));
    });

    // Hook lors de la modification des STANDARDS / Taxonomie (primKey changé en _primKey)
    this.standards.hook("updating", (mods, _primKey, obj) => {
      // On ne traque pas les modifications des standards intégrés en lecture seule
      if (obj.manifest?.isBuiltin) return;

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

export const db = new AppDatabase();
