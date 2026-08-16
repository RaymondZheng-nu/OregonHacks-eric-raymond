import type { Metadata } from "next";
import { BlobBackground } from "@/components/blob-background";
import { SpotSwipeDeck } from "@/components/spot-swipe-deck";
import {
  getVerifiedSpotsInBounds,
  getVerifiedSpotsNationwide,
} from "@/lib/supabase/queries.server";
import { boundingBox, clampRadiusMeters, isValidLatLng } from "@/lib/geo";
import type { SpotCategory } from "@/lib/types";
import { CATEGORY_META } from "@/lib/categories";

export const metadata: Metadata = {
  title: "Swipe Spots",
  description: "Swipe through nearby parks, gardens, and quiet spots — save the ones worth visiting.",
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

const DEFAULT_VIEWPORT_RADIUS_METERS = 25_000;

export default async function SwipePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  const categories = parseCategories(params.cats);
  const rawLat = parseNumber(params.lat);
  const rawLng = parseNumber(params.lng);
  const radiusMeters = parseNumber(params.radius);

  // Out-of-range values (bad geocode, hand-edited URL) are treated as "no
  // location" rather than feeding boundingBox a bogus lat/lng — that would
  // produce a nonsensical or near-global box instead of just failing.
  const hasLocation = rawLat !== null && rawLng !== null && isValidLatLng(rawLat, rawLng);

  // No location: the questionnaire's address field is optional and its copy
  // promises "browse spots across the whole country" on skip — a single
  // city's bounded radius would silently break that promise, so this pulls
  // a shuffled nationwide sample (fetchVerifiedSpotsNationwide) instead of
  // defaulting to a fixed city.
  let spots;
  let userLocation: { lat: number; lng: number } | undefined;
  if (hasLocation) {
    userLocation = { lat: rawLat as number, lng: rawLng as number };
    const radius = clampRadiusMeters(radiusMeters ?? DEFAULT_VIEWPORT_RADIUS_METERS);
    const initialBounds = boundingBox(userLocation.lat, userLocation.lng, radius);
    spots = await getVerifiedSpotsInBounds(initialBounds, {
      categories: categories ?? undefined,
    });
  } else {
    spots = await getVerifiedSpotsNationwide({
      categories: categories ?? undefined,
    });
  }

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden">
      <BlobBackground />
      <SpotSwipeDeck spots={spots} userLocation={userLocation} />
    </div>
  );
}
