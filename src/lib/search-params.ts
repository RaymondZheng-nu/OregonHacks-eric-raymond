import type { SpotCategory } from "@/lib/types";
import { CATEGORY_META } from "@/lib/categories";
import {
  boundingBox,
  clampRadiusMeters,
  isValidLatLng,
  type BoundingBox,
} from "@/lib/geo";

// /explore and /swipe both read the same quiz querystring shape
// (cats/activity/picnic/lat/lng/radius); parsing lives here for both.
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
  // Out-of-range values (bad geocode, hand-edited URL) → "no location", so
  // boundingBox falls back to the default center instead of a bogus box.
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

// Shared anchor for the quiz's skip-address fallback and the coverage-region boxes.
export const PORTLAND_CENTER = { lat: 45.5152, lng: -122.6784 };
// Matches spot-map.tsx's default center so the first SSR paint shows the right
// viewport instead of fetching the whole table.
export const DEFAULT_CENTER = PORTLAND_CENTER;
export const DEFAULT_VIEWPORT_RADIUS_METERS = 25_000;

// Narrows the initial SSR fetch to the quiz location so there's no empty flash
// before the client's own viewport fetch runs. Users can still pan freely after.
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

// Round-trips a parsed search back into /explore's querystring for the "view on
// map" links. Isomorphic (no server-only imports), usable from client components.
export function buildExploreParams(parsed: ParsedSearch): URLSearchParams {
  const exploreParams = new URLSearchParams();
  if (parsed.categories) exploreParams.set("cats", parsed.categories.join(","));
  if (parsed.activity) exploreParams.set("activity", parsed.activity);
  if (parsed.picnic) exploreParams.set("picnic", "1");
  if (parsed.lat !== null && parsed.lng !== null) {
    exploreParams.set("lat", String(parsed.lat));
    exploreParams.set("lng", String(parsed.lng));
    // != null, not truthiness — an explicit radius of 0 is a real value, not "unset".
    if (parsed.radiusMeters != null)
      exploreParams.set("radius", String(parsed.radiusMeters));
  }
  return exploreParams;
}
