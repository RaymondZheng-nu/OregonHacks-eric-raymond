import type { Spot, SpotCategory } from "@/lib/types";

// No auth in this app (see AGENTS.md/schema.sql's RLS-disabled note) — saved
// spots are a local snapshot on this device/browser, never written to the
// spots table or tied to any account.
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
// sessionStorage, not localStorage: skips are meant to reset every session
// ("never show again this session," not "forever") — a different lifetime
// than saved spots, so a different storage API rather than one key with a
// manual expiry.
const SKIPPED_KEY = "touch-grass:skipped-spots";

function readJson<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    // Corrupted/foreign data under this key shouldn't break the feature —
    // same soft-fail-to-default convention as the rest of this app's reads.
    return fallback;
  }
}

export function getSavedSpots(): SavedSpot[] {
  if (typeof window === "undefined") return [];
  return readJson(window.localStorage, SAVED_KEY, []);
}

export function saveSpot(spot: Spot): void {
  if (typeof window === "undefined") return;
  const existing = getSavedSpots();
  if (existing.some((s) => s.id === spot.id)) return;

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
  window.localStorage.setItem(SAVED_KEY, JSON.stringify(next));
}

export function removeSavedSpot(id: string): void {
  if (typeof window === "undefined") return;
  const next = getSavedSpots().filter((s) => s.id !== id);
  window.localStorage.setItem(SAVED_KEY, JSON.stringify(next));
}

export function getSkippedSpotIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  return new Set(readJson<string[]>(window.sessionStorage, SKIPPED_KEY, []));
}

export function skipSpot(id: string): void {
  if (typeof window === "undefined") return;
  const existing = getSkippedSpotIds();
  existing.add(id);
  window.sessionStorage.setItem(SKIPPED_KEY, JSON.stringify(Array.from(existing)));
}
