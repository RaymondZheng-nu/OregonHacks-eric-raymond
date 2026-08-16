import type { Metadata } from "next";
import { ExploreView } from "@/components/explore-view";
import {
  getVerifiedSpotsInBounds,
  getPendingCount,
  getDistinctAmenities,
  getDistinctClimbingGrades,
} from "@/lib/supabase/queries.server";
import { boundingBox, clampRadiusMeters, isValidLatLng } from "@/lib/geo";
import type { SpotCategory } from "@/lib/types";
import { CATEGORY_META } from "@/lib/categories";

export const metadata: Metadata = {
  title: "Explore the Map",
  description:
    "Browse parks, gardens, and quiet nature spots across the USA on an interactive map. Filter by category and find something worth visiting nearby.",
};

function parseCategories(raw: string | undefined): SpotCategory[] | null {
  if (!raw) return null;
  const known = new Set(Object.keys(CATEGORY_META));
  const parsed = raw.split(",").filter((c) => known.has(c)) as SpotCategory[];
  return parsed.length > 0 ? parsed : null;
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Matches the map's own default center/zoom in spot-map.tsx (NYC, zoom 11)
// so the first server-rendered paint already shows the right viewport
// instead of fetching (and discarding) the whole table on every load.
const DEFAULT_CENTER = { lat: 40.7484, lng: -73.9857 };
const DEFAULT_VIEWPORT_RADIUS_METERS = 25_000;

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  const categories = parseCategories(params.cats);
  const rawLat = parseNumber(params.lat);
  const rawLng = parseNumber(params.lng);
  const radiusMeters = parseNumber(params.radius);

  // Out-of-range values (bad geocode, hand-edited URL) fall back to the
  // default center rather than feeding boundingBox a bogus lat/lng — that
  // would produce a nonsensical or near-global box instead of just failing.
  const hasLocation = rawLat !== null && rawLng !== null && isValidLatLng(rawLat, rawLng);
  const lat = hasLocation ? (rawLat as number) : null;
  const lng = hasLocation ? (rawLng as number) : null;

  // A questionnaire-derived location narrows the initial SSR fetch to that
  // area (same bounded-fetch pattern as the plain default) — the map still
  // centers there and users can pan/zoom freely afterward, this only avoids
  // an initial empty-map flash while the client's own viewport fetch spins up.
  const center = hasLocation ? { lat: lat as number, lng: lng as number } : DEFAULT_CENTER;
  const radius = clampRadiusMeters(radiusMeters ?? DEFAULT_VIEWPORT_RADIUS_METERS);
  const initialBounds = boundingBox(center.lat, center.lng, radius);

  const [spots, pendingCount, availableAmenities, availableClimbingGrades] = await Promise.all([
    getVerifiedSpotsInBounds(initialBounds, {
      categories: categories ?? undefined,
    }),
    getPendingCount(),
    getDistinctAmenities(),
    getDistinctClimbingGrades(),
  ]);

  return (
    <ExploreView
      initialSpots={spots}
      pendingCount={pendingCount}
      initialActiveCategories={categories ?? undefined}
      initialCenter={lat !== null && lng !== null ? [lat, lng] : undefined}
      availableAmenities={availableAmenities}
      availableClimbingGrades={availableClimbingGrades}
    />
  );
}
