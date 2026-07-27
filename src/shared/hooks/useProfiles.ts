/**
 * React hooks for loading profiles from IndexedDB.
 *
 * All hooks use Dexie's useLiveQuery so that profile list views automatically
 * refresh when the Library creates, updates or deletes a profile.
 */

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../core/db/schema";
import type { Profile } from "../../core/domain/profile";
import { useAppStore } from "../../store/appStore";

/**
 * Un profil est-il visible dans l'espace de travail courant ? Symétrique des
 * standards (voir isVisibleInWorkspace), mais les profils n'ont pas de champ
 * `workspace` : on s'appuie sur source/status.
 *
 * PARTAGÉ  : tout — profils du dépôt (officiels/pending) + mes brouillons +
 *            le socle builtin (la base).
 * AUTONOME : socle builtin + mes brouillons locaux (status "local") ; on masque
 *            le contenu officiel/pending tiré du dépôt.
 */
export function isProfileVisibleInWorkspace(
  profile: { source: string; status?: string },
  repoMode: "local" | "shared",
): boolean {
  if (repoMode === "shared") return true;
  return profile.source === "builtin" || profile.status === "local";
}

/**
 * Returns the profiles for the given standard that are visible in the active
 * workspace, sorted by updatedAt descending. Returns undefined while loading.
 */
export function useProfilesByStandard(standardId: string | null): Profile[] | undefined {
  const repoMode = useAppStore((s) => s.repoMode);
  return useLiveQuery<Profile[]>(
    async () => {
      if (standardId === null) return [];
      const profiles = await db.profiles
        .where("standardId")
        .equals(standardId)
        .reverse()
        .sortBy("updatedAt");
      return profiles.filter((p) => isProfileVisibleInWorkspace(p, repoMode));
    },
    [standardId, repoMode],
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
