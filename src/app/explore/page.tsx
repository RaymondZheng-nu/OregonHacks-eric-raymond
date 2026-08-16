import type { Metadata } from "next";
import { ExploreView } from "@/components/explore-view";
import {
  getVerifiedSpotsInBounds,
  getPendingCount,
  getDistinctAmenities,
  getDistinctClimbingGrades,
} from "@/lib/supabase/queries.server";
import { boundsFromSearch, parseSearchParams } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Explore the Map",
  description:
    "Browse parks, gardens, and quiet nature spots across the USA on an interactive map. Filter by category and find something worth visiting nearby.",
};

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const parsed = parseSearchParams(params);
  const { bounds: initialBounds } = boundsFromSearch(parsed);
  // Present only when arriving from the results list's "View on map" —
  // identifies which marker should have its popup auto-opened once loaded.
  const focusSpotId = params.spot || undefined;

  const [spots, pendingCount, availableAmenities, availableClimbingGrades] = await Promise.all([
    getVerifiedSpotsInBounds(initialBounds, {
      categories: parsed.categories ?? undefined,
      activity: parsed.activity,
      picnic: parsed.picnic,
    }),
    getPendingCount(),
    getDistinctAmenities(),
    getDistinctClimbingGrades(),
  ]);

  return (
    <ExploreView
      initialSpots={spots}
      pendingCount={pendingCount}
      initialActiveCategories={parsed.categories ?? undefined}
      initialActivity={parsed.activity}
      initialPicnic={parsed.picnic}
      initialCenter={parsed.lat !== null && parsed.lng !== null ? [parsed.lat, parsed.lng] : undefined}
      focusSpotId={focusSpotId}
      availableAmenities={availableAmenities}
      availableClimbingGrades={availableClimbingGrades}
    />
  );
}
