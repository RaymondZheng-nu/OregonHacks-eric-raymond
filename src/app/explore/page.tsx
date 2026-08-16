import type { Metadata } from "next";
import { ExploreView } from "@/components/explore-view";
import { getVerifiedSpots, getPendingCount } from "@/lib/supabase/queries.server";
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

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const [spots, pendingCount] = await Promise.all([
    getVerifiedSpots(),
    getPendingCount(),
  ]);

  const categories = parseCategories(params.cats);
  const lat = parseNumber(params.lat);
  const lng = parseNumber(params.lng);
  const radiusMeters = parseNumber(params.radius);

  return (
    <ExploreView
      initialSpots={spots}
      pendingCount={pendingCount}
      initialActiveCategories={categories ?? undefined}
      initialCenter={lat !== null && lng !== null ? [lat, lng] : undefined}
      initialRadiusMeters={radiusMeters ?? undefined}
    />
  );
}
