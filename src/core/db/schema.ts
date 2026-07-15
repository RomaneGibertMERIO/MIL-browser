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

export class AppDatabase extends Dexie {
  profiles!: Table<Profile, string>;
  standards!: Table<StandardPlugin, string>;
  syncEvents!: Table<SyncEvent, string>;
  settings!: Table<AppSettings, string>;
  
  public isSyncingInternal = false;

  constructor() {
    super("mil_browser_v1");

    this.version(1).stores({
      profiles: "id, nodeId, standardId, updatedAt, source, status, [standardId+nodeId]",
      standards: "manifest.id, manifest.organization, manifest.isBuiltin",
      syncEvents: "id, timestamp, entity",
      settings: "key",
    });

    // ── HOOK PROFILES ──
    this.profiles.hook("creating", (primKey, obj) => {
      if (this.isSyncingInternal) return;
      
      this.syncEvents.put({
        id: String(primKey), 
        deviceId: getOrCreateDeviceId(),
        timestamp: Date.now(),
        operation: "upsert",
        entity: "profile",
        payload: obj
      }).catch(err => console.error("Event error (Profile Create):", err));
    });

    this.profiles.hook("updating", (mods, primKey, obj) => {
      if (this.isSyncingInternal) return;
      
      const updatedObj = { ...obj, ...mods };
      this.syncEvents.put({
        id: String(primKey),
        deviceId: getOrCreateDeviceId(),
        timestamp: Date.now(),
        operation: "upsert",
        entity: "profile",
        payload: updatedObj
      }).catch(err => console.error("Event error (Profile Update):", err));
    });

    this.profiles.hook("deleting", (primKey, obj) => {
      if (this.isSyncingInternal) return;

      this.syncEvents.put({
        id: String(primKey),
        deviceId: getOrCreateDeviceId(),
        timestamp: Date.now(),
        operation: "delete",
        entity: "profile",
        payload: { id: primKey, name: obj.name, standardId: obj.standardId }
      }).catch(err => console.error("Event error (Profile Delete):", err));
    });

    // ── HOOK STANDARDS ──
    this.standards.hook("creating", (primKey, obj) => {
      if (this.isSyncingInternal) return;

      this.syncEvents.put({
        id: String(primKey),
        deviceId: getOrCreateDeviceId(),
        timestamp: Date.now(),
        operation: "upsert",
        entity: "standard",
        payload: obj
      }).catch(err => console.error("Event error (Standard Create):", err));
    });

    this.standards.hook("updating", (mods, primKey, obj) => {
      if (this.isSyncingInternal) return;

      const updatedObj = { ...obj, ...mods };
      this.syncEvents.put({
        id: String(primKey),
        deviceId: getOrCreateDeviceId(),
        timestamp: Date.now(),
        operation: "upsert",
        entity: "standard",
        payload: updatedObj
      }).catch(err => console.error("Event error (Standard Update):", err));
    });
  }
}

export const db = new AppDatabase();
