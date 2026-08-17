import type { SpotCategory } from "@/lib/types";
import { CATEGORY_META } from "@/lib/categories";
import {
  boundingBox,
  clampRadiusMeters,
  isValidLatLng,
  type BoundingBox,
} from "@/lib/geo";

// Shared by /explore and /swipe — both pages read the same querystring
// shape the quiz produces (cats/activity/picnic/lat/lng/radius), so parsing
// lived in one place only from the start; this file just gives it a name
// once a second page needed it too.
export function parseCategories(
  raw: string | undefined,
): SpotCategory[] | null {
  if (!raw) return null;
  const known = new Set(Object.keys(CATEGORY_META));
  const parsed = raw.split(",").filter((c) => known.has(c)) as SpotCategory[];
  return parsed.length > 0 ? parsed : null;
}

export function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export type ParsedSearch = {
  categories: SpotCategory[] | null;
  activity?: string;
  picnic: boolean;
  lat: number | null;
  lng: number | null;
  radiusMeters: number | null;
};

export function parseSearchParams(
  params: Record<string, string | undefined>,
): ParsedSearch {
  const rawLat = parseNumber(params.lat);
  const rawLng = parseNumber(params.lng);
  // Out-of-range values (bad geocode, hand-edited URL) are treated as "no
  // location" rather than passed through — feeding boundingBox a bogus
  // lat/lng produces a nonsensical or near-global box instead of just
  // falling back to the default center.
  const hasLocation =
    rawLat !== null && rawLng !== null && isValidLatLng(rawLat, rawLng);

  return {
    categories: parseCategories(params.cats),
    activity: params.activity || undefined,
    picnic: params.picnic === "1",
    lat: hasLocation ? rawLat : null,
    lng: hasLocation ? rawLng : null,
    radiusMeters: parseNumber(params.radius),
  };
}

// Matches the map's own default center/zoom in spot-map.tsx (NYC, zoom 11)
// so the first server-rendered paint already shows the right viewport
// instead of fetching (and discarding) the whole table on every load.
export const DEFAULT_CENTER = { lat: 40.7484, lng: -73.9857 };
export const DEFAULT_VIEWPORT_RADIUS_METERS = 25_000;

// A questionnaire-derived location narrows the initial SSR fetch to that
// area (same bounded-fetch pattern as the plain default) — the map still
// centers there and users can pan/zoom freely afterward, this only avoids
// an initial empty flash while the client's own viewport fetch spins up.
export function boundsFromSearch(parsed: ParsedSearch): {
  center: { lat: number; lng: number };
  bounds: BoundingBox;
} {
  const center =
    parsed.lat !== null && parsed.lng !== null
      ? { lat: parsed.lat, lng: parsed.lng }
      : DEFAULT_CENTER;
  const radius = clampRadiusMeters(
    parsed.radiusMeters ?? DEFAULT_VIEWPORT_RADIUS_METERS,
  );
  return { center, bounds: boundingBox(center.lat, center.lng, radius) };
}
