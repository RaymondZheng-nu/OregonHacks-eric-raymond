import type { Metadata } from "next";
import { BlobBackground } from "@/components/blob-background";
import { SpotSwipeDeck } from "@/components/spot-swipe-deck";
import {
  getVerifiedSpotsInBounds,
  getVerifiedSpotsNationwide,
} from "@/lib/supabase/queries.server";
import { boundsFromSearch, parseSearchParams } from "@/lib/search-params";
import { shuffle } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Swipe Spots",
  description:
    "Swipe through nearby parks, gardens, and quiet spots — save the ones worth visiting.",
};

// A wider pool than any single batch needs, so "Generate more" has real
// variety to draw from instead of looping through a handful — same idea as
// /results' old POOL_LIMIT.
const POOL_LIMIT = 40;

export default async function SwipePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const parsed = parseSearchParams(params);
  const hasLocation = parsed.lat !== null && parsed.lng !== null;

  // No location: the questionnaire's address field is optional and its copy
  // promises "browse spots across the whole country" on skip — a single
  // city's bounded radius would silently break that promise, so this pulls
  // a shuffled nationwide sample (fetchVerifiedSpotsNationwide) instead of
  // defaulting to a fixed city.
  let spots;
  let userLocation: { lat: number; lng: number } | undefined;
  if (hasLocation) {
    userLocation = { lat: parsed.lat as number, lng: parsed.lng as number };
    const { bounds: initialBounds } = boundsFromSearch(parsed);
    const pool = await getVerifiedSpotsInBounds(initialBounds, {
      limit: POOL_LIMIT,
      categories: parsed.categories ?? undefined,
      activity: parsed.activity,
      picnic: parsed.picnic,
    });
    // Unlike the nationwide fetch below, the bounds query returns DB order
    // (most-recently-created first) — shuffle it so the deck isn't just the
    // newest-ingested spots in a row.
    spots = shuffle(pool);
  } else {
    spots = await getVerifiedSpotsNationwide({
      limit: POOL_LIMIT,
      categories: parsed.categories ?? undefined,
      activity: parsed.activity,
      picnic: parsed.picnic,
    });
  }

  // Forwarded to the client component so it can build both the nav bar's
  // "Map view" link and each card's "View on map" link without re-deriving
  // the original search from scratch.
  const exploreParams = new URLSearchParams();
  if (parsed.categories) exploreParams.set("cats", parsed.categories.join(","));
  if (parsed.activity) exploreParams.set("activity", parsed.activity);
  if (parsed.picnic) exploreParams.set("picnic", "1");
  if (hasLocation) {
    exploreParams.set("lat", String(parsed.lat));
    exploreParams.set("lng", String(parsed.lng));
    if (parsed.radiusMeters)
      exploreParams.set("radius", String(parsed.radiusMeters));
  }

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden">
      <BlobBackground />
      <SpotSwipeDeck
        spots={spots}
        userLocation={userLocation}
        filters={{
          categories: parsed.categories,
          activity: parsed.activity,
          picnic: parsed.picnic,
        }}
        exploreParams={exploreParams.toString()}
      />
    </div>
  );
}
