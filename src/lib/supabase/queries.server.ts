import { createClient } from "@/lib/supabase/server";
import {
  fetchVerifiedSpots,
  fetchVerifiedSpotsInBounds,
  fetchSpotDensity,
  fetchFeaturedSpots,
  fetchPendingSpots,
  fetchPendingCount,
  fetchDistinctAmenities,
  fetchDistinctClimbingGrades,
  type SpotsInBoundsOptions,
} from "@/lib/supabase/queries";
import type { BoundingBox } from "@/lib/geo";

export async function getVerifiedSpots() {
  return fetchVerifiedSpots(await createClient());
}

export async function getVerifiedSpotsInBounds(
  bounds: BoundingBox,
  options?: SpotsInBoundsOptions
) {
  return fetchVerifiedSpotsInBounds(await createClient(), bounds, options);
}

export async function getSpotDensity(bounds: BoundingBox, gridSize?: number) {
  return fetchSpotDensity(await createClient(), bounds, gridSize);
}

export async function getFeaturedSpots(limit: number) {
  return fetchFeaturedSpots(await createClient(), limit);
}

export async function getPendingSpots() {
  return fetchPendingSpots(await createClient());
}

export async function getPendingCount() {
  return fetchPendingCount(await createClient());
}

export async function getDistinctAmenities() {
  return fetchDistinctAmenities(await createClient());
}

export async function getDistinctClimbingGrades() {
  return fetchDistinctClimbingGrades(await createClient());
}
