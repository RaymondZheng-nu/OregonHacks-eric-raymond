import type { Spot, SpotCategory } from "@/lib/types";

// No auth in this app — saved spots live in this browser only, never in the DB.
export type SavedSpot = {
  id: string;
  name: string;
  category: SpotCategory;
  lat: number;
  lng: number;
  photo_url: string | null;
  savedAt: string;
};

const SAVED_KEY = "touch-grass:saved-spots";
// sessionStorage, not localStorage: skips reset each session, unlike saved spots.
const SKIPPED_KEY = "touch-grass:skipped-spots";

// Array.isArray is a real shape check, not just a parse guard: wrong-shaped JSON
// under this key would cast to T and only blow up later when a caller does
// `.some(...)` on what's actually an object.
function readJson<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

// setItem can throw (quota, private-browsing lockout) — make a failed write a
// silent no-op instead of crashing a swipe-deck save/skip handler.
function writeJson(storage: Storage, key: string, value: unknown): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function getSavedSpots(): SavedSpot[] {
  if (typeof window === "undefined") return [];
  return readJson(window.localStorage, SAVED_KEY, []);
}

// Returns true only if this call inserted a new spot (false if already saved).
// Undo history needs this so it doesn't remove a spot saved in an earlier session.
export function saveSpot(spot: Spot): boolean {
  if (typeof window === "undefined") return false;
  const existing = getSavedSpots();
  if (existing.some((s) => s.id === spot.id)) return false;

  const next: SavedSpot[] = [
    ...existing,
    {
      id: spot.id,
      name: spot.name,
      category: spot.category,
      lat: spot.lat,
      lng: spot.lng,
      photo_url: spot.photo_url,
      savedAt: new Date().toISOString(),
    },
  ];
  return writeJson(window.localStorage, SAVED_KEY, next);
}

export function removeSavedSpot(id: string): void {
  if (typeof window === "undefined") return;
  const next = getSavedSpots().filter((s) => s.id !== id);
  writeJson(window.localStorage, SAVED_KEY, next);
}

export function getSkippedSpotIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  return new Set(readJson<string[]>(window.sessionStorage, SKIPPED_KEY, []));
}

export function skipSpot(id: string): void {
  if (typeof window === "undefined") return;
  const existing = getSkippedSpotIds();
  existing.add(id);
  writeJson(window.sessionStorage, SKIPPED_KEY, Array.from(existing));
}

export function unskipSpot(id: string): void {
  if (typeof window === "undefined") return;
  const next = getSkippedSpotIds();
  next.delete(id);
  writeJson(window.sessionStorage, SKIPPED_KEY, Array.from(next));
}
