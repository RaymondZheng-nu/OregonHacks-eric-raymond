import type { SupabaseClient } from "@supabase/supabase-js";
import type { FreeActivityTip, Spot, SpotCategory } from "@/lib/types";
import {
  boundingBox,
  haversineDistanceMeters,
  isValidLatLng,
  type BoundingBox,
} from "@/lib/geo";
import { shuffle, shuffleWithPhotosFirst } from "@/lib/utils";

// Reads soft-fail to empty defaults so a page never crashes on a blip.
// Mutations throw — call sites wrap them in try/catch for toast logic.

export type SubmitSpotInput = {
  name: string;
  description: string | null;
  category: SpotCategory;
  lat: number;
  lng: number;
  photo_url: string | null;
};

// PostgREST caps a single select() at 1000 rows. Table's well past that, so an
// unpaginated query silently drops the oldest rows by created_at — that's how
// the original NYC seed vanished from the map. Hence pagination below.
const FETCH_PAGE_SIZE = 1000;

export async function fetchVerifiedSpots(
  supabase: SupabaseClient,
): Promise<Spot[]> {
  const allSpots: Spot[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("spots")
      .select("*")
      .eq("status", "verified")
      .order("created_at", { ascending: false })
      .range(from, from + FETCH_PAGE_SIZE - 1);

    // Break, don't fall through: an undefined `data` looks exactly like a
    // short final page to the length check below, silently truncating the list.
    if (error) {
      console.error("fetchVerifiedSpots: pagination failed, returning partial results", error);
      break;
    }

    const page = (data ?? []) as Spot[];
    allSpots.push(...page);
    if (page.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }

  return allSpots;
}

// Filter to "has a photo" in the query, not client-side: past the 1000-row
// cap, the photo-having rows (original seeded parks) are exactly the oldest
// ones and fall outside a created_at-desc window.
export async function fetchFeaturedSpots(
  supabase: SupabaseClient,
  limit: number,
): Promise<Spot[]> {
  const { data, error } = await supabase
    .from("spots")
    .select("*")
    .eq("status", "verified")
    .not("photo_url", "is", null)
    .not("photo_url", "ilike", "%picsum.photos%")
    .order("confirm_count", { ascending: false })
    .limit(limit);

  if (error) console.error("fetchFeaturedSpots failed", error);
  return (data ?? []) as Spot[];
}

export async function fetchPendingSpots(
  supabase: SupabaseClient,
): Promise<Spot[]> {
  const allSpots: Spot[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("spots")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .range(from, from + FETCH_PAGE_SIZE - 1);

    // Same as fetchVerifiedSpots: don't let an error read as "no more pages."
    if (error) {
      console.error("fetchPendingSpots: pagination failed, returning partial results", error);
      break;
    }

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
  // Stricter override of JUNK_AREA_FLOOR_M2 for the map's advanced settings;
  // clamped to never go below the default floor.
  minParkAreaM2?: number;
  // These filters are populated by the dedup-cleanup tagging pass; rows it
  // hasn't reached just won't match, same as an unset value.
  sizeClasses?: string[];
  amenities?: string[];
  wheelchairAccessibleOnly?: boolean;
  // Exact-match set, not a range — grade strings aren't one orderable scale
  // (French vs YDS). Only relevant for category = 'climbing'.
  climbingGrades?: string[];
  // Filters the activity_fit array column; only set when the quiz's "what do
  // you want to do" question was answered.
  activity?: string;
  // size_class medium/large is the real signal for "fits a picnic" — the
  // `lounge` activity tag covers reading but a bench-sized spot can't picnic.
  picnic?: boolean;
  // Order photo-having rows first (still returns photo-less ones after). The
  // swipe deck slices a small batch and only ~1.3% of spots have a real photo,
  // so a flat random slice comes back almost entirely photo-less.
  photosFirst?: boolean;
};

const DEFAULT_BOUNDS_LIMIT = 1000;

// Mirror of dedup-cleanup.mjs's HARD_REJECT_FLOOR_M2, applied live at read
// time so already-verified junk (traffic medians, planters) the offline script
// hasn't touched still gets filtered. `area_m2 is null` stays exempt — most
// non-OSM-way spots have no area, and null means "unknown," not "tiny."
const JUNK_FILTERED_CATEGORIES: SpotCategory[] = ["park", "other"];
const JUNK_AREA_FLOOR_M2 = 150;

// Viewport-scoped map read so payload tracks what's on screen. `limit` is a
// defensive ceiling for dense viewports, not expected to bind under normal use.
export async function fetchVerifiedSpotsInBounds(
  supabase: SupabaseClient,
  bounds: BoundingBox,
  options: SpotsInBoundsOptions = {},
): Promise<Spot[]> {
  const {
    limit = DEFAULT_BOUNDS_LIMIT,
    categories,
    minParkAreaM2,
    sizeClasses,
    amenities,
    wheelchairAccessibleOnly,
    climbingGrades,
    activity,
    picnic,
    photosFirst,
  } = options;
  // Guard non-finite input: Math.max(NaN, floor) is NaN, which interpolates
  // into the .or() filter below as the literal "NaN" and breaks PostgREST.
  const safeMinParkAreaM2 = Number.isFinite(minParkAreaM2)
    ? minParkAreaM2
    : undefined;
  const areaFloor = Math.max(
    safeMinParkAreaM2 ?? JUNK_AREA_FLOOR_M2,
    JUNK_AREA_FLOOR_M2,
  );

  // undefined = no filter; [] = "filter to nothing" and must return zero rows.
  // Deselecting every category on the map should show none, not everything.
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
    .or(
      `category.not.in.(${JUNK_FILTERED_CATEGORIES.join(",")}),area_m2.gte.${areaFloor},area_m2.is.null`,
    );

  // Before the recency order so it's the primary sort key, not a tiebreaker.
  if (photosFirst) {
    query = query.order("photo_url", { ascending: true, nullsFirst: false });
  }
  query = query.order("created_at", { ascending: false }).limit(limit);

  if (categories) {
    query = query.in("category", categories);
  }

  if (sizeClasses && sizeClasses.length > 0) {
    query = query.in("size_class", sizeClasses);
  }

  // Overlap = "has at least one," the intuitive read for a checkbox filter.
  if (amenities && amenities.length > 0) {
    query = query.overlaps("amenities", amenities);
  }

  if (wheelchairAccessibleOnly) {
    query = query.eq("accessibility", "yes");
  }

  if (climbingGrades && climbingGrades.length > 0) {
    query = query.in("climbing_grade", climbingGrades);
  }

  if (activity) {
    query = query.overlaps("activity_fit", [activity]);
  }

  // Two .in() calls on size_class intersect; picnic narrows further on top of
  // any explicit sizeClasses filter rather than clobbering it.
  if (picnic) {
    query = query.in("size_class", ["medium", "large"]);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Spot[];
}

const DEFAULT_NATIONWIDE_SAMPLE_SIZE = 150;

// Must exceed the table's total row count, not just be "large": with no ORDER
// BY, `.limit()` returns whatever Postgres scans first (~insertion order,
// city-clustered) and permanently excludes everything else — the shuffle below
// can't fix a truncated pool. ~21k spots today; if it grows past 25k this needs
// a real DB-side sample (ORDER BY random() LIMIT n RPC), not a bigger constant.
const NATIONWIDE_RAW_POOL_SIZE = 25_000;

// No-bounds counterpart for when there's no location context. The quiz no
// longer hits this (skipping the address step now defaults to Portland bounds),
// but a direct /swipe or /explore visit with no lat/lng still reaches it.
export async function fetchVerifiedSpotsNationwide(
  supabase: SupabaseClient,
  options: SpotsInBoundsOptions = {},
): Promise<Spot[]> {
  const {
    limit = DEFAULT_NATIONWIDE_SAMPLE_SIZE,
    categories,
    minParkAreaM2,
    sizeClasses,
    amenities,
    wheelchairAccessibleOnly,
    climbingGrades,
    activity,
    picnic,
    photosFirst,
  } = options;
  // Guard non-finite input: Math.max(NaN, floor) is NaN, which interpolates
  // into the .or() filter below as the literal "NaN" and breaks PostgREST.
  const safeMinParkAreaM2 = Number.isFinite(minParkAreaM2)
    ? minParkAreaM2
    : undefined;
  const areaFloor = Math.max(
    safeMinParkAreaM2 ?? JUNK_AREA_FLOOR_M2,
    JUNK_AREA_FLOOR_M2,
  );

  if (categories && categories.length === 0) {
    return [];
  }

  let query = supabase
    .from("spots")
    .select("*")
    .eq("status", "verified")
    .limit(NATIONWIDE_RAW_POOL_SIZE)
    .or(
      `category.not.in.(${JUNK_FILTERED_CATEGORIES.join(",")}),area_m2.gte.${areaFloor},area_m2.is.null`,
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

  if (activity) {
    query = query.overlaps("activity_fit", [activity]);
  }

  if (picnic) {
    query = query.in("size_class", ["medium", "large"]);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rawPool = (data ?? []) as Spot[];

  // photosFirst shuffles the two groups independently so photo rows stay ahead
  // (~1.3% have a photo, so a flat shuffle buries them). Both use Fisher-Yates,
  // not the .sort(() => Math.random()) trick, which is a biased shuffle.
  const pool = photosFirst ? shuffleWithPhotosFirst(rawPool) : shuffle(rawPool);

  return pool.slice(0, limit);
}

export type DensityBucket = {
  lat: number;
  lng: number;
  count: number;
};

const DEFAULT_DENSITY_GRID_SIZE = 0.05;

// What the density view counts as "green space." Narrower than
// SELECTABLE_CATEGORIES on purpose: abandoned/hangout/climbing(indoor)/other
// aren't green space, and counting them would make the view's "here's where
// green space is" claim false. Editorial to this view — don't import elsewhere.
const GREEN_SPACE_CATEGORIES: SpotCategory[] = [
  "park",
  "garden",
  "tree",
  "birdwatching",
];

// Zoomed-out views: bucketed counts via the spot_density_grid RPC, so payload
// scales with grid resolution, not table size. Green-space categories only.
export async function fetchSpotDensity(
  supabase: SupabaseClient,
  bounds: BoundingBox,
  gridSize: number = DEFAULT_DENSITY_GRID_SIZE,
): Promise<DensityBucket[]> {
  const { data, error } = await supabase.rpc("spot_density_grid", {
    min_lat: bounds.minLat,
    max_lat: bounds.maxLat,
    min_lng: bounds.minLng,
    max_lng: bounds.maxLng,
    grid_size: gridSize,
    categories: GREEN_SPACE_CATEGORIES,
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as DensityBucket[];
}

// Amenities checkbox options, derived from real data instead of a hardcoded
// guess that could drift from OSM tags. Soft-fails to [].
export async function fetchDistinctAmenities(
  supabase: SupabaseClient,
): Promise<string[]> {
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

// Soft-fails to [] like fetchDistinctAmenities. Extra reason here: climbing_grade
// is a new column that may not exist in a given deployment yet (DDL lag), and a
// missing column should read as "no grades yet," not a crash.
export async function fetchDistinctClimbingGrades(
  supabase: SupabaseClient,
): Promise<string[]> {
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
  supabase: SupabaseClient,
): Promise<number> {
  const { count } = await supabase
    .from("spots")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  return count ?? 0;
}

export async function fetchVerifiedSpotCount(
  supabase: SupabaseClient,
): Promise<number> {
  const { count } = await supabase
    .from("spots")
    .select("*", { count: "exact", head: true })
    .eq("status", "verified");

  return count ?? 0;
}

export async function fetchSpotById(
  supabase: SupabaseClient,
  id: string,
): Promise<Spot | null> {
  const { data, error } = await supabase
    .from("spots")
    .select("*")
    .eq("id", id)
    .eq("status", "verified")
    .maybeSingle();

  if (error) {
    console.error("fetchSpotById failed", error);
    return null;
  }
  return (data as Spot) ?? null;
}

export type SpotSearchResult = Pick<Spot, "id" | "name" | "category" | "lat" | "lng">;

// Name-only search for the explore header's search box — not a substitute for
// the map's real filtering, just a fast way to jump straight to a known spot.
export async function searchVerifiedSpots(
  supabase: SupabaseClient,
  query: string,
  limit = 8,
): Promise<SpotSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { data, error } = await supabase
    .from("spots")
    .select("id, name, category, lat, lng")
    .eq("status", "verified")
    .ilike("name", `%${trimmed}%`)
    .order("name")
    .limit(limit);

  if (error) {
    console.error("searchVerifiedSpots failed", error);
    return [];
  }
  return (data ?? []) as SpotSearchResult[];
}

// Generous enough to never bother a real submission, just enough to reject a
// pasted document. Exported so add-spot-dialog.tsx validates the same limit.
export const MAX_NAME_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 2000;

export async function insertSpot(
  supabase: SupabaseClient,
  input: SubmitSpotInput,
): Promise<Spot> {
  // Revalidate at the boundary — the dialog isn't the only possible caller.
  if (!isValidLatLng(input.lat, input.lng)) {
    throw new Error("Invalid coordinates");
  }
  if (!input.name.trim() || input.name.length > MAX_NAME_LENGTH) {
    throw new Error(`Name must be between 1 and ${MAX_NAME_LENGTH} characters`);
  }
  if (input.description && input.description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`Description must be under ${MAX_DESCRIPTION_LENGTH} characters`);
  }

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
  spotId: string,
): Promise<void> {
  const { error } = await supabase.rpc("confirm_spot", { spot_id: spotId });
  if (error) throw new Error(error.message);
}

export async function flagSpotRpc(
  supabase: SupabaseClient,
  spotId: string,
): Promise<void> {
  const { error } = await supabase.rpc("flag_spot", { spot_id: spotId });
  if (error) throw new Error(error.message);
}

export const MAX_TIP_LENGTH = 280;

export async function fetchVerifiedTips(
  supabase: SupabaseClient,
  spotId: string,
): Promise<FreeActivityTip[]> {
  const { data, error } = await supabase
    .from("free_activity_tips")
    .select("*")
    .eq("spot_id", spotId)
    .eq("status", "verified")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch free activity tips", error);
    return [];
  }
  return (data ?? []) as FreeActivityTip[];
}

export async function submitFreeActivityTip(
  supabase: SupabaseClient,
  spotId: string,
  tip: string,
  sourceUrl: string | null,
): Promise<FreeActivityTip> {
  if (!tip.trim() || tip.length > MAX_TIP_LENGTH) {
    throw new Error(`Tip must be between 1 and ${MAX_TIP_LENGTH} characters`);
  }

  const { data, error } = await supabase
    .from("free_activity_tips")
    .insert({ spot_id: spotId, tip, source_url: sourceUrl || null })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as FreeActivityTip;
}

export async function confirmTipRpc(
  supabase: SupabaseClient,
  tipId: string,
): Promise<void> {
  const { error } = await supabase.rpc("confirm_tip", { tip_id: tipId });
  if (error) throw new Error(error.message);
}

// Dedup check for ingestion: any verified spot within radiusMeters? Verified
// only — near-misses against pending submissions aren't worth handling.
// Heuristic: two distinct close-together spots can register as a false match.
export async function findNearbySpot(
  supabase: SupabaseClient,
  lat: number,
  lng: number,
  radiusMeters = 30,
): Promise<Spot | null> {
  const box = boundingBox(lat, lng, radiusMeters);
  const { data, error } = await supabase
    .from("spots")
    .select("*")
    .eq("status", "verified")
    .gte("lat", box.minLat)
    .lte("lat", box.maxLat)
    .gte("lng", box.minLng)
    .lte("lng", box.maxLng);

  if (error) console.error("findNearbySpot failed", error);
  const candidates = (data ?? []) as Spot[];
  let closest: Spot | null = null;
  let closestDistance = Infinity;

  for (const candidate of candidates) {
    const distance = haversineDistanceMeters(
      lat,
      lng,
      candidate.lat,
      candidate.lng,
    );
    if (distance <= radiusMeters && distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }

  return closest;
}
