import type { SupabaseClient } from "@supabase/supabase-js";
import type { Spot, SpotCategory } from "@/lib/types";
import { boundingBox, haversineDistanceMeters, type BoundingBox } from "@/lib/geo";

// Reads soft-fail to empty defaults (matches the `data ?? []` pattern the call
// sites used before this module existed) so a page never crashes on a blip.
// It just renders an empty state. Mutations throw, since every call site
// wraps them in try/catch and expects a rejected promise for its toast logic.

export type SubmitSpotInput = {
  name: string;
  description: string | null;
  category: SpotCategory;
  lat: number;
  lng: number;
  photo_url: string | null;
};

// PostgREST caps a single select() at 1000 rows by default. With ingestion
// jobs now putting the table well past that, an unpaginated query silently
// drops whichever rows fall outside the most recent 1000 by created_at —
// which made the oldest data (the original NYC seed) disappear from the map.
const FETCH_PAGE_SIZE = 1000;

export async function fetchVerifiedSpots(
  supabase: SupabaseClient
): Promise<Spot[]> {
  const allSpots: Spot[] = [];
  let from = 0;

  for (;;) {
    const { data } = await supabase
      .from("spots")
      .select("*")
      .eq("status", "verified")
      .order("created_at", { ascending: false })
      .range(from, from + FETCH_PAGE_SIZE - 1);

    const page = (data ?? []) as Spot[];
    allSpots.push(...page);
    if (page.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }

  return allSpots;
}

// Queried directly by "has a photo" rather than pulling fetchVerifiedSpots()
// and slicing client-side: that table is well past Supabase's 1000-row
// response cap, and ordering by created_at desc means the oldest rows (the
// original seeded parks, which are the ones with real photos) fall outside
// the returned window entirely once total verified spots exceeds 1000.
export async function fetchFeaturedSpots(
  supabase: SupabaseClient,
  limit: number
): Promise<Spot[]> {
  const { data } = await supabase
    .from("spots")
    .select("*")
    .eq("status", "verified")
    .not("photo_url", "is", null)
    .not("photo_url", "ilike", "%picsum.photos%")
    .order("confirm_count", { ascending: false })
    .limit(limit);

  return (data ?? []) as Spot[];
}

export async function fetchPendingSpots(
  supabase: SupabaseClient
): Promise<Spot[]> {
  const allSpots: Spot[] = [];
  let from = 0;

  for (;;) {
    const { data } = await supabase
      .from("spots")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .range(from, from + FETCH_PAGE_SIZE - 1);

    const page = (data ?? []) as Spot[];
    allSpots.push(...page);
    if (page.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }

  return allSpots;
}

export type SpotsInBoundsOptions = {
  limit?: number;
  categories?: SpotCategory[];
  // Set only when the "what do you want to do" quiz question was answered —
  // filters against the `activity_fit` array column (see dedup-cleanup.mjs)
  // rather than being a hard requirement for plain map browsing.
  activity?: string;
  // `lounge` (small spots, per SIZE_ACTIVITY_DEFAULTS in dedup-cleanup.mjs)
  // covers reading/relaxing but not picnicking — a bench-sized spot can't fit
  // a picnic. Picnic-worthiness isn't its own activity_fit tag; `size_class`
  // medium/large is the real, already-computed signal for "has an open area."
  picnic?: boolean;
};

const DEFAULT_BOUNDS_LIMIT = 1000;

// Viewport-scoped read for the map: only spots inside the given bounds, so
// payload size tracks what's on screen instead of the whole table. `limit`
// is a defensive ceiling (dense downtown viewports), not expected to bind
// under normal panning at the zoom levels this is meant for.
export async function fetchVerifiedSpotsInBounds(
  supabase: SupabaseClient,
  bounds: BoundingBox,
  options: SpotsInBoundsOptions = {}
): Promise<Spot[]> {
  const { limit = DEFAULT_BOUNDS_LIMIT, categories, activity, picnic } = options;

  // `categories: undefined` means "no filter"; `categories: []` means "filter
  // to nothing" and must return zero rows, not silently fall back to
  // unfiltered — otherwise a caller that deselects every category (the map's
  // "no categories active" state) gets every spot instead of none.
  if (categories && categories.length === 0) {
    return [];
  }

  let query = supabase
    .from("spots")
    .select("*")
    .eq("status", "verified")
    .gte("lat", bounds.minLat)
    .lte("lat", bounds.maxLat)
    .gte("lng", bounds.minLng)
    .lte("lng", bounds.maxLng)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (categories) {
    query = query.in("category", categories);
  }

  if (activity) {
    query = query.overlaps("activity_fit", [activity]);
  }

  if (picnic) {
    query = query.in("size_class", ["medium", "large"]);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Spot[];
}

export type DensityBucket = {
  lat: number;
  lng: number;
  count: number;
};

const DEFAULT_DENSITY_GRID_SIZE = 0.05;

// Zoomed-out map views: bucketed counts instead of individual spots, via the
// spot_density_grid RPC (schema.sql) so payload size stays bounded by grid
// resolution rather than by how many spots are in the table.
export async function fetchSpotDensity(
  supabase: SupabaseClient,
  bounds: BoundingBox,
  gridSize: number = DEFAULT_DENSITY_GRID_SIZE
): Promise<DensityBucket[]> {
  const { data, error } = await supabase.rpc("spot_density_grid", {
    min_lat: bounds.minLat,
    max_lat: bounds.maxLat,
    min_lng: bounds.minLng,
    max_lng: bounds.maxLng,
    grid_size: gridSize,
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as DensityBucket[];
}

export async function fetchPendingCount(
  supabase: SupabaseClient
): Promise<number> {
  const { count } = await supabase
    .from("spots")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  return count ?? 0;
}

export async function insertSpot(
  supabase: SupabaseClient,
  input: SubmitSpotInput
): Promise<Spot> {
  const { data, error } = await supabase
    .from("spots")
    .insert({ ...input, source: "user", status: "pending" })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Spot;
}

export async function confirmSpotRpc(
  supabase: SupabaseClient,
  spotId: string
): Promise<void> {
  const { error } = await supabase.rpc("confirm_spot", { spot_id: spotId });
  if (error) throw new Error(error.message);
}

// Cross-source dedup check for ingestion scripts: is there already a verified
// spot within radiusMeters of this point? Scoped to status='verified' only —
// a coincidental near-miss against an unconfirmed user submission isn't worth
// the added complexity of deciding what to do about it (skip? auto-verify the
// pending one?). Heuristic, not exact: two genuinely distinct close-together
// spots could register as a false match.
export async function findNearbySpot(
  supabase: SupabaseClient,
  lat: number,
  lng: number,
  radiusMeters = 30
): Promise<Spot | null> {
  const box = boundingBox(lat, lng, radiusMeters);
  const { data } = await supabase
    .from("spots")
    .select("*")
    .eq("status", "verified")
    .gte("lat", box.minLat)
    .lte("lat", box.maxLat)
    .gte("lng", box.minLng)
    .lte("lng", box.maxLng);

  const candidates = (data ?? []) as Spot[];
  let closest: Spot | null = null;
  let closestDistance = Infinity;

  for (const candidate of candidates) {
    const distance = haversineDistanceMeters(lat, lng, candidate.lat, candidate.lng);
    if (distance <= radiusMeters && distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }

  return closest;
}
