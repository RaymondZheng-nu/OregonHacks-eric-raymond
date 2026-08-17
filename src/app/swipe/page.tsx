import type { Metadata } from "next";
import { BlobBackground } from "@/components/blob-background";
import { SpotSwipeDeck } from "@/components/spot-swipe-deck";
import {
  getVerifiedSpotsInBounds,
  getVerifiedSpotsNationwide,
} from "@/lib/supabase/queries.server";
import { boundsFromSearch, parseSearchParams } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Swipe Spots",
  description: "Swipe through nearby parks, gardens, and quiet spots — save the ones worth visiting.",
};

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
    spots = await getVerifiedSpotsInBounds(initialBounds, {
      categories: parsed.categories ?? undefined,
      activity: parsed.activity,
      picnic: parsed.picnic,
    });
  } else {
    spots = await getVerifiedSpotsNationwide({
      categories: parsed.categories ?? undefined,
      activity: parsed.activity,
      picnic: parsed.picnic,
    });
  }

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden">
      <BlobBackground />
      <SpotSwipeDeck spots={spots} userLocation={userLocation} />
    </div>
  );
}
