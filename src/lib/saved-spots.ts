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

// Both real call sites (getSavedSpots, getSkippedSpotIds) always pass an
// array fallback and expect an array back — so Array.isArray is a real
// shape check here, not just a parse check. Without it, valid-but-wrong-
// shaped JSON under this key (e.g. a stale/foreign value from a past schema,
// or a collision with something else writing to localStorage) would parse
// successfully, get cast to T, and only blow up later when a caller like
// saveSpot calls `.some(...)` on what turned out to be `{}` — an uncaught
// TypeError, exactly the kind of storage-corruption crash this function's
// own comment claims to guard against but previously didn't.
function readJson<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    // Corrupted/foreign data under this key shouldn't break the feature —
    // same soft-fail-to-default convention as the rest of this app's reads.
    return fallback;
  }
}

// Writes can throw too (QuotaExceededError, private-browsing storage
// restrictions in some browsers) — reads were already defensively wrapped
// above, but every write call site previously called setItem bare. Given
// this file's own stated philosophy ("shouldn't break the feature"), an
// uncaught write failure from inside a swipe-deck save/skip button handler
// contradicts that; this makes a failed write a silent no-op instead of an
// uncaught exception.
function writeJson(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Soft-fail: the in-memory state the caller already computed stays
    // correct for this session, it just won't persist across reloads.
  }
}

export function getSavedSpots(): SavedSpot[] {
  if (typeof window === "undefined") return [];
  return readJson(window.localStorage, SAVED_KEY, []);
}

// Returns whether this call actually inserted a new saved spot (false for an
// already-saved id, a no-op). Callers that track undo history need this: an
// unconditional "this was saved, so undo should remove it" would delete a
// spot that was really saved in an earlier session, not by this call.
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
  writeJson(window.localStorage, SAVED_KEY, next);
  return true;
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

// Undo for the swipe deck's "back" button — reverses whichever of
// skipSpot/saveSpot was just called, so a misswipe isn't permanent for the
// rest of the session.
export function unskipSpot(id: string): void {
  if (typeof window === "undefined") return;
  const next = getSkippedSpotIds();
  next.delete(id);
  writeJson(window.sessionStorage, SKIPPED_KEY, Array.from(next));
}
