import type { ProjectData } from "./types";
export const LEGACY_KEY = "shotcraft-workbench-project-v1";
export function legacyJson(storage?: Pick<Storage, "getItem">): string | null {
  try { return (storage ?? localStorage).getItem(LEGACY_KEY); } catch { return null; }
}
export function loadBrowserProject(storage: Pick<Storage, "getItem">, key: string, confirmLegacy: (name: string) => boolean): ProjectData | null {
  const parse = (raw: string | null): ProjectData | null => {
    try {
      const value = JSON.parse(raw ?? "null") as ProjectData | null;
      return value && Array.isArray(value.tracks) ? value : null;
    } catch { return null; }
  };
  try {
    const current = parse(storage.getItem(key));
    if (current) return current;
    const legacy = parse(legacyJson(storage));
    return legacy && confirmLegacy(legacy.name ?? "") ? legacy : null;
  } catch { return null; }
}
