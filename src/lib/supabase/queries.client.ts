import { createClient } from "@/lib/supabase/client";
import {
  insertSpot,
  confirmSpotRpc,
  fetchVerifiedSpotsInBounds,
  type SubmitSpotInput,
  type SpotsInBoundsOptions,
} from "@/lib/supabase/queries";
import type { BoundingBox } from "@/lib/geo";

export async function submitSpot(input: SubmitSpotInput) {
  return insertSpot(createClient(), input);
}

// For the map to refetch on pan/zoom without a full page round-trip.
export async function getVerifiedSpotsInBounds(
  bounds: BoundingBox,
  options?: SpotsInBoundsOptions
) {
  return fetchVerifiedSpotsInBounds(createClient(), bounds, options);
}

export async function confirmSpot(spotId: string) {
  return confirmSpotRpc(createClient(), spotId);
}
