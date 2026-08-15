import { ExploreView } from "@/components/explore-view";
import { createClient } from "@/lib/supabase/server";
import type { Spot } from "@/lib/types";

export default async function Home() {
  const supabase = await createClient();
  const [{ data: spots }, { count: pendingCount }] = await Promise.all([
    supabase
      .from("spots")
      .select("*")
      .eq("status", "verified")
      .order("created_at", { ascending: false }),
    supabase
      .from("spots")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  return (
    <ExploreView
      initialSpots={(spots ?? []) as Spot[]}
      pendingCount={pendingCount ?? 0}
    />
  );
}
