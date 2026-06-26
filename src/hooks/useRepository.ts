import { useState, useEffect, useCallback } from 'react';
import type { RepoProfile, ProfileDraft, DataPoint } from '../types';
import { loadBuiltinProfiles } from '../lib/dataLoader';
import { loadUserProfiles, saveUserProfiles } from '../lib/repositoryStorage';

function generateId(): string {
  return `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function draftToProfile(
  draft: ProfileDraft,
  existingId?: string,
  createdAt?: string,
): RepoProfile {
  const dataset: DataPoint[] = draft.dataset
    .filter((row) => row.time.trim() !== '')
    .map((row) => ({
      time: row.time.trim(),
      temp_c: parseFloat(row.temp_c) || 0,
      rh_percent: parseFloat(row.rh_percent) || 0,
    }));
  return {
    id: existingId ?? generateId(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    standardId: draft.standardId,
    conditionType: draft.conditionType,
    taxonomyPath: draft.taxonomyPath,
    dataset,
    source: 'user',
    createdAt: createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
}

export interface UseRepositoryResult {
  /** All profiles — builtin + user. Use this for Browse. */
  readonly allProfiles: ReadonlyArray<RepoProfile>;
  /** User-created profiles only. Use this for Library Management. */
  readonly userProfiles: ReadonlyArray<RepoProfile>;
  readonly isLoading: boolean;
  readonly error: string | null;
  createProfile: (draft: ProfileDraft) => RepoProfile;
  updateProfile: (id: string, draft: ProfileDraft) => void;
  deleteProfile: (id: string) => void;
}

export function useRepository(): UseRepositoryResult {
  const [builtinProfiles, setBuiltinProfiles] = useState<RepoProfile[]>([]);
  const [userProfiles, setUserProfiles] = useState<RepoProfile[]>(() => loadUserProfiles());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBuiltinProfiles()
      .then((profiles) => {
        setBuiltinProfiles(profiles);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
      });
  }, []);

  const persist = useCallback((updated: RepoProfile[]) => {
    saveUserProfiles(updated);
    setUserProfiles(updated);
  }, []);

  const createProfile = useCallback(
    (draft: ProfileDraft): RepoProfile => {
      const profile = draftToProfile(draft);
      persist([...userProfiles, profile]);
      return profile;
    },
    [userProfiles, persist],
  );

  const updateProfile = useCallback(
    (id: string, draft: ProfileDraft): void => {
      persist(
        userProfiles.map((p) => (p.id === id ? draftToProfile(draft, id, p.createdAt) : p)),
      );
    },
    [userProfiles, persist],
  );

  const deleteProfile = useCallback(
    (id: string): void => {
      persist(userProfiles.filter((p) => p.id !== id));
    },
    [userProfiles, persist],
  );

  return {
    allProfiles: [...builtinProfiles, ...userProfiles],
    userProfiles,
    isLoading,
    error,
    createProfile,
    updateProfile,
    deleteProfile,
  };
}
