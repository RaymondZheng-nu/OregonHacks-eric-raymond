import { createClient } from "@/lib/supabase/server";
import {
  fetchVerifiedSpots,
  fetchVerifiedSpotsInBounds,
  fetchSpotDensity,
  fetchPendingSpots,
  fetchPendingCount,
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

export async function getPendingSpots() {
  return fetchPendingSpots(await createClient());
}

export async function getPendingCount() {
  return fetchPendingCount(await createClient());
}
