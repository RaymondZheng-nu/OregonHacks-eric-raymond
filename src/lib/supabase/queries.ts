import type { SupabaseClient } from "@supabase/supabase-js";
import type { Spot, SpotCategory } from "@/lib/types";
import { boundingBox, haversineDistanceMeters } from "@/lib/geo";

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

export async function fetchVerifiedSpots(
  supabase: SupabaseClient
): Promise<Spot[]> {
  const { data } = await supabase
    .from("spots")
    .select("*")
    .eq("status", "verified")
    .order("created_at", { ascending: false });

  return (data ?? []) as Spot[];
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
  const { data } = await supabase
    .from("spots")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return (data ?? []) as Spot[];
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
