import { ExploreView } from "@/components/explore-view";
import { getVerifiedSpotsInBounds, getPendingCount } from "@/lib/supabase/queries.server";
import { boundingBox } from "@/lib/geo";

// Matches the map's default center/zoom in spot-map.tsx (NYC, zoom 11) so
// the first server-rendered paint already shows the right viewport instead
// of the whole table.
const DEFAULT_CENTER = { lat: 40.7484, lng: -73.9857 };
const DEFAULT_VIEWPORT_RADIUS_METERS = 25_000;

export default async function Home() {
  const defaultBounds = boundingBox(
    DEFAULT_CENTER.lat,
    DEFAULT_CENTER.lng,
    DEFAULT_VIEWPORT_RADIUS_METERS
  );

  const [spots, pendingCount] = await Promise.all([
    getVerifiedSpotsInBounds(defaultBounds),
    getPendingCount(),
  ]);

  return <ExploreView initialSpots={spots} pendingCount={pendingCount} />;
}
