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
      
      // FIX TS2339: On cast "obj" en tant que Profile pour accéder à "source" en toute sécurité
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
      // SÉCURITÉ : On ignore les modifications système d'usine
      if (obj.source === "builtin" && mods.source !== "user") return;
      
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

      // FIX TS2339: On cast "obj" en tant que Profile pour accéder à ses propriétés
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
      
      // FIX TS2339: On cast "obj" en tant que StandardPlugin pour accéder à "manifest"
      const standard = obj as StandardPlugin;
      if (standard.manifest?.isBuiltin) return;

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

      const standard = obj as StandardPlugin;
      const updatedMods = mods as Partial<StandardPlugin>;
      
      if (standard.manifest?.isBuiltin && updatedMods.manifest?.isBuiltin !== false) return;

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

    // Ajout du hook de suppression pour les standards
    this.standards.hook("deleting", (primKey, obj) => {
      if (this.isSyncingInternal) return;

      setTimeout(() => {
        this.syncEvents.put({
          id: String(primKey),
          deviceId: getOrCreateDeviceId(),
          timestamp: Date.now(),
          operation: "delete",
          entity: "standard",
          payload: { id: primKey, name: obj.manifest?.label || primKey }
        }).catch(err => console.error("Event error (Standard Delete):", err));
      }, 0);
    });
  }
}

export const db = new AppDatabase();
