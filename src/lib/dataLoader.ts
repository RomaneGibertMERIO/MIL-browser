import type { RepoProfile, Standard } from '../types';

const BASE = '/data';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load "${url}": ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

/** Load available testing standards (never hardcoded — all data-driven). */
export function loadStandards(): Promise<Standard[]> {
  return fetchJson<Standard[]>(`${BASE}/standards.json`);
}

/** Load builtin profiles from the static JSON seed file. Data is inlined. */
export function loadBuiltinProfiles(): Promise<RepoProfile[]> {
  return fetchJson<RepoProfile[]>(`${BASE}/profiles.json`);
}
