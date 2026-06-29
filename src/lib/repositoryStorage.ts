import type { RepoProfile } from "../types";

const STORAGE_KEY = "mil_browser_profiles_v2";

export function loadUserProfiles(): RepoProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as RepoProfile[];
  } catch {
    return [];
  }
}

export function saveUserProfiles(profiles: ReadonlyArray<RepoProfile>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export function exportProfiles(profiles: ReadonlyArray<RepoProfile>): void {
  const blob = new Blob([JSON.stringify(profiles, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "profiles.json";
  a.click();

  URL.revokeObjectURL(url);
}

export function replaceUserProfiles(profiles: RepoProfile[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export async function importProfiles(file: File): Promise<RepoProfile[]> {
  const text = await file.text();

  const parsed: unknown = JSON.parse(text);

  if (!Array.isArray(parsed)) {
    throw new Error("Invalid profiles file");
  }

  return parsed as RepoProfile[];
}
