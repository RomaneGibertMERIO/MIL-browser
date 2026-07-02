/**
 * React hook for loading all standards from IndexedDB.
 *
 * Uses Dexie's useLiveQuery to automatically re-render when the standards
 * table changes (e.g. after the user imports a new standard).
 *
 * Returns undefined while the query is still loading (first render), and
 * an array (possibly empty) once loaded.
 */

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../core/db/schema";
import type { StandardPlugin } from "../../core/domain/standard";

/**
 * Returns all standards, or undefined while loading.
 * Components should show a loading state when the return value is undefined.
 */
export function useStandards(): StandardPlugin[] | undefined {
  return useLiveQuery<StandardPlugin[]>(() => db.standards.toArray());
}

/**
 * Returns a single standard by id, or undefined while loading / not found.
 */
export function useStandard(id: string | null): StandardPlugin | undefined {
  return useLiveQuery<StandardPlugin | undefined>(
    () => (id !== null ? db.standards.get(id) : Promise.resolve(undefined)),
    [id],
  );
}
