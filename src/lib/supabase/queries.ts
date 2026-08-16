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
  // Overrides JUNK_AREA_FLOOR_M2 below — exposed so the map's advanced
  // settings can raise the bar above the default junk floor (e.g. "only
  // parks over 2000 m²"). Never goes below the default: this is a stricter
  // override, not a way to re-admit sub-floor junk that query-time filtering
  // already excludes.
  minParkAreaM2?: number;
  // Below: all optional, all no-ops unless the row actually has the data —
  // size_class/amenities/accessibility are populated by the dedup-cleanup
  // pipeline's tagging pass (see schema.sql), so rows this hasn't reached
  // yet just won't match a non-empty filter, same as a genuinely-unset value.
  sizeClasses?: string[];
  amenities?: string[];
  wheelchairAccessibleOnly?: boolean;
  // Applied only when relevant (category = 'climbing'); grade strings aren't
  // a single orderable scale (French vs YDS), so this is an exact-match set,
  // not a numeric range.
  climbingGrades?: string[];
};

const DEFAULT_BOUNDS_LIMIT = 1000;

// Same floor as scripts/dedup-cleanup.mjs's HARD_REJECT_FLOOR_M2, kept in
// sync deliberately: that offline script only fixes up spots it's manually
// run against, so a junk-sized traffic median or street planter that's
// already `verified` (or added after the last cleanup pass) would otherwise
// still render. This applies the same threshold live, at read time, so the
// map never shows what the batch cleanup would also reject. `area_m2 is
// null` stays exempt — most non-OSM-way spots (user submissions, OSM nodes)
// never have an area at all, and null means "unknown," not "tiny."
const JUNK_FILTERED_CATEGORIES: SpotCategory[] = ["park", "other"];
const JUNK_AREA_FLOOR_M2 = 150;

// Viewport-scoped read for the map: only spots inside the given bounds, so
// payload size tracks what's on screen instead of the whole table. `limit`
// is a defensive ceiling (dense downtown viewports), not expected to bind
// under normal panning at the zoom levels this is meant for.
export async function fetchVerifiedSpotsInBounds(
  supabase: SupabaseClient,
  bounds: BoundingBox,
  options: SpotsInBoundsOptions = {}
): Promise<Spot[]> {
  const {
    limit = DEFAULT_BOUNDS_LIMIT,
    categories,
    minParkAreaM2,
    sizeClasses,
    amenities,
    wheelchairAccessibleOnly,
    climbingGrades,
  } = options;
  const areaFloor = Math.max(minParkAreaM2 ?? JUNK_AREA_FLOOR_M2, JUNK_AREA_FLOOR_M2);

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
    .limit(limit)
    .or(
      `category.not.in.(${JUNK_FILTERED_CATEGORIES.join(",")}),area_m2.gte.${areaFloor},area_m2.is.null`
    );

  if (categories) {
    query = query.in("category", categories);
  }

  if (sizeClasses && sizeClasses.length > 0) {
    query = query.in("size_class", sizeClasses);
  }

  // Overlap, not containment: "has at least one of the selected amenities,"
  // not "has all of them" — the intuitive read for a checkbox filter.
  if (amenities && amenities.length > 0) {
    query = query.overlaps("amenities", amenities);
  }

  if (wheelchairAccessibleOnly) {
    query = query.eq("accessibility", "yes");
  }

  if (climbingGrades && climbingGrades.length > 0) {
    query = query.in("climbing_grade", climbingGrades);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Spot[];
}

const DEFAULT_NATIONWIDE_SAMPLE_SIZE = 150;

// Raw pool pulled before shuffling: without an ORDER BY, Postgres tends to
// return rows close to insertion order, which is city-clustered from the
// 30-city ingestion batches (scripts/ingest-osm-cities.mjs). Pulling a wide
// pool before shuffling guarantees the returned sample actually spans many
// cities instead of just whichever city happens to sort first.
const NATIONWIDE_RAW_POOL_SIZE = 5000;

// No-bounds counterpart to fetchVerifiedSpotsInBounds, for when there's no
// location context to scope a viewport to (e.g. the questionnaire's address
// field was skipped — see session-questionnaire.tsx's "browse spots across
// the whole country" copy, which this makes literally true instead of
// silently falling back to a single city's radius).
export async function fetchVerifiedSpotsNationwide(
  supabase: SupabaseClient,
  options: SpotsInBoundsOptions = {}
): Promise<Spot[]> {
  const {
    limit = DEFAULT_NATIONWIDE_SAMPLE_SIZE,
    categories,
    minParkAreaM2,
    sizeClasses,
    amenities,
    wheelchairAccessibleOnly,
    climbingGrades,
  } = options;
  const areaFloor = Math.max(minParkAreaM2 ?? JUNK_AREA_FLOOR_M2, JUNK_AREA_FLOOR_M2);

  if (categories && categories.length === 0) {
    return [];
  }

  let query = supabase
    .from("spots")
    .select("*")
    .eq("status", "verified")
    .limit(NATIONWIDE_RAW_POOL_SIZE)
    .or(
      `category.not.in.(${JUNK_FILTERED_CATEGORIES.join(",")}),area_m2.gte.${areaFloor},area_m2.is.null`
    );

  if (categories) {
    query = query.in("category", categories);
  }

  if (sizeClasses && sizeClasses.length > 0) {
    query = query.in("size_class", sizeClasses);
  }

  if (amenities && amenities.length > 0) {
    query = query.overlaps("amenities", amenities);
  }

  if (wheelchairAccessibleOnly) {
    query = query.eq("accessibility", "yes");
  }

  if (climbingGrades && climbingGrades.length > 0) {
    query = query.in("climbing_grade", climbingGrades);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Fisher-Yates, not .sort(() => Math.random() - 0.5) — the sort-comparator
  // trick is a biased shuffle (V8's sort isn't a fair coin flip per pair).
  const pool = (data ?? []) as Spot[];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, limit);
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

// Populates the amenities checkbox filter with whatever actually occurs in
// the data, rather than a hardcoded guess that could drift from real OSM
// tags. Soft-fails to [] on any error (same convention as this module's
// other reads) — a page render should never break because the filter
// options couldn't be computed.
export async function fetchDistinctAmenities(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from("spots")
    .select("amenities")
    .eq("status", "verified")
    .not("amenities", "is", null)
    .limit(2000);

  if (error) return [];

  const values = new Set<string>();
  for (const row of data ?? []) {
    for (const amenity of (row.amenities as string[] | null) ?? []) {
      values.add(amenity);
    }
  }
  return Array.from(values).sort();
}

// Same soft-fail convention as fetchDistinctAmenities, but with an extra
// gap to guard against: climbing_grade is a new column (schema.sql) that
// may not exist live yet in a given deployment — same DDL-lag situation as
// area_m2 before it. A missing column reads as "no grades available yet,"
// not a crash.
export async function fetchDistinctClimbingGrades(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from("spots")
    .select("climbing_grade")
    .eq("status", "verified")
    .eq("category", "climbing")
    .not("climbing_grade", "is", null)
    .limit(2000);

  if (error) return [];

  const values = new Set<string>();
  for (const row of data ?? []) {
    if (row.climbing_grade) values.add(row.climbing_grade as string);
  }
  return Array.from(values).sort();
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
