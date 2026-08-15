import { ExploreView } from "@/components/explore-view";
import { getVerifiedSpots, getPendingCount } from "@/lib/supabase/queries.server";

export default async function Home() {
  const [spots, pendingCount] = await Promise.all([
    getVerifiedSpots(),
    getPendingCount(),
  ]);

  return <ExploreView initialSpots={spots} pendingCount={pendingCount} />;
}
