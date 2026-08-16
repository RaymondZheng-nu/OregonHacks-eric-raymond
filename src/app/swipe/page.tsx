import type { Metadata } from "next";
import { BlobBackground } from "@/components/blob-background";
import { SpotSwipeDeck } from "@/components/spot-swipe-deck";
import { getVerifiedSpotsInBounds } from "@/lib/supabase/queries.server";
import { boundingBox } from "@/lib/geo";
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

// Same defaults as explore/page.tsx, so a bare /swipe (no questionnaire
// params) behaves the same way a bare /explore does.
const DEFAULT_CENTER = { lat: 40.7484, lng: -73.9857 };
const DEFAULT_VIEWPORT_RADIUS_METERS = 25_000;

export default async function SwipePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  const categories = parseCategories(params.cats);
  const lat = parseNumber(params.lat);
  const lng = parseNumber(params.lng);
  const radiusMeters = parseNumber(params.radius);

  const hasLocation = lat !== null && lng !== null;
  const center = hasLocation ? { lat, lng } : DEFAULT_CENTER;
  const radius = radiusMeters ?? DEFAULT_VIEWPORT_RADIUS_METERS;
  const initialBounds = boundingBox(center.lat, center.lng, radius);

  const spots = await getVerifiedSpotsInBounds(initialBounds, {
    categories: categories ?? undefined,
  });

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden">
      <BlobBackground />
      <SpotSwipeDeck
        spots={spots}
        userLocation={hasLocation ? { lat: lat as number, lng: lng as number } : undefined}
      />
    </div>
  );
}
