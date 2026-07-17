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
      standards: "manifest.id, manifest.organization, manifest.isBuiltin, status, source",
      syncEvents: "id, timestamp, entity",
      settings: "key",
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
          payload: obj
        }).catch(err => console.error("Event error (Profile Create):", err));
      }, 0);
    });

    this.profiles.hook("updating", (mods, primKey, obj) => {
      if (this.isSyncingInternal) return;

      const profile = obj as Profile;
      const updatedMods = mods as Partial<Profile>;

      if (profile.source === "builtin" && updatedMods.source !== "user") return;
      
      const updatedObj = { ...obj, ...mods };
      setTimeout(() => {
        this.syncEvents.put({
          id: String(primKey),
          deviceId: getOrCreateDeviceId(),
          timestamp: Date.now(),
          operation: "upsert",
          entity: "profile",
          payload: updatedObj
        }).catch(err => console.error("Event error (Profile Update):", err));
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
          payload: obj
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

      const updatedObj = { ...obj, ...mods };
      setTimeout(() => {
        this.syncEvents.put({
          id: String(primKey),
          deviceId: getOrCreateDeviceId(),
          timestamp: Date.now(),
          operation: "upsert",
          entity: "standard",
          payload: updatedObj
        }).catch(err => console.error("Event error (Standard Update):", err));
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
