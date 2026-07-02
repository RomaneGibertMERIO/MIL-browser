/**
 * React hooks for loading profiles from IndexedDB.
 *
 * All hooks use Dexie's useLiveQuery so that profile list views automatically
 * refresh when the Library creates, updates or deletes a profile.
 */

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../core/db/schema";
import type { Profile } from "../../core/domain/profile";

/**
 * Returns all profiles for the given standard, sorted by updatedAt descending.
 * Returns undefined while loading.
 */
export function useProfilesByStandard(standardId: string | null): Profile[] | undefined {
  return useLiveQuery<Profile[]>(
    () =>
      standardId !== null
        ? db.profiles
            .where("standardId")
            .equals(standardId)
            .reverse()
            .sortBy("updatedAt")
        : Promise.resolve([] as Profile[]),
    [standardId],
  );
}

/**
 * Returns all profiles whose nodeId exactly matches the given node.
 * Returns undefined while loading.
 */
export function useProfilesByNode(nodeId: string | null): Profile[] | undefined {
  return useLiveQuery<Profile[]>(
    () =>
      nodeId !== null
        ? db.profiles.where("nodeId").equals(nodeId).toArray()
        : Promise.resolve([] as Profile[]),
    [nodeId],
  );
}

/**
 * Returns all profiles in the database.
 * Use sparingly — prefer the more targeted hooks for large datasets.
 */
export function useAllProfiles(): Profile[] | undefined {
  return useLiveQuery<Profile[]>(() => db.profiles.toArray());
}
