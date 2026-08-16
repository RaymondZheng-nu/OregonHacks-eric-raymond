import type { Metadata } from "next";
import Link from "next/link";
import { ResultsList } from "@/components/results-list";
import { Button } from "@/components/ui/button";
import { getVerifiedSpotsInBounds } from "@/lib/supabase/queries.server";
import { boundsFromSearch, parseSearchParams } from "@/lib/search-params";
import { haversineDistanceMeters } from "@/lib/geo";
import { shuffle } from "@/lib/utils";

// Personalized/derived from quiz answers, not a page worth ranking in search
// — same reasoning as /pending.
export const metadata: Metadata = {
  title: "Your Matches",
  robots: { index: false, follow: false },
};

// A wider pool than any single map viewport needs, so paging through the
// results popup has real variety instead of looping through a handful.
const POOL_LIMIT = 40;

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const parsed = parseSearchParams(params);
  const { center, bounds } = boundsFromSearch(parsed);
  const hasOrigin = parsed.lat !== null && parsed.lng !== null;

  const pool = await getVerifiedSpotsInBounds(bounds, {
    limit: POOL_LIMIT,
    categories: parsed.categories ?? undefined,
    activity: parsed.activity,
    picnic: parsed.picnic,
  });

  const spotsWithDistance = shuffle(pool).map((spot) => ({
    ...spot,
    distanceMeters: hasOrigin
      ? haversineDistanceMeters(center.lat, center.lng, spot.lat, spot.lng)
      : null,
  }));

  // Forwarded to the client component so it can build both the "view all on
  // the map" link and each card's "view this one on the map" link without
  // re-deriving the original search from scratch.
  const exploreParams = new URLSearchParams();
  if (parsed.categories) exploreParams.set("cats", parsed.categories.join(","));
  if (parsed.activity) exploreParams.set("activity", parsed.activity);
  if (parsed.picnic) exploreParams.set("picnic", "1");
  if (hasOrigin) {
    exploreParams.set("lat", String(parsed.lat));
    exploreParams.set("lng", String(parsed.lng));
    if (parsed.radiusMeters)
      exploreParams.set("radius", String(parsed.radiusMeters));
  }

  return (
    <div className="min-h-[100dvh]">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4">
          <Link
            href="/"
            className="font-logo text-lg tracking-tight text-green-700"
          >
            TOUCH GRASS
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/#hero-cta">Retake quiz</Link>}
            />
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <Link href={`/explore?${exploreParams.toString()}`}>
                  View all on the map
                </Link>
              }
            />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-8">
        <ResultsList
          spots={spotsWithDistance}
          exploreParams={exploreParams.toString()}
          filters={{
            categories: parsed.categories,
            activity: parsed.activity,
            picnic: parsed.picnic,
          }}
        />
      </main>
    </div>
  );
}
