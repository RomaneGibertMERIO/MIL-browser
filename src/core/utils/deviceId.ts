/**
 * Device identity utility.
 *
 * The device ID is a stable random UUID that identifies this browser
 * installation. It is the only value stored in localStorage in the new
 * architecture — all other persistence uses IndexedDB.
 *
 * The device ID is used exclusively by the sync system to:
 * - Tag outgoing SyncEvents so the server can filter echo events.
 * - Filter the local sync event log when building push payloads.
 *
 * It is never exposed to the user and is not a security credential.
 */

const DEVICE_ID_KEY = "mil_browser_device_id";

let cachedDeviceId: string | null = null;

/**
 * Returns the device ID for the current browser installation.
 * Generates and persists a new UUID on first call.
 */
export function getDeviceId(): string {
  if (cachedDeviceId !== null) {
    return cachedDeviceId;
  }

  const stored = localStorage.getItem(DEVICE_ID_KEY);
  if (stored !== null) {
    cachedDeviceId = stored;
    return cachedDeviceId;
  }

  const generated = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, generated);
  cachedDeviceId = generated;
  return cachedDeviceId;
}
