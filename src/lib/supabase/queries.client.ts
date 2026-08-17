import { createClient } from "@/lib/supabase/client";
import {
  insertSpot,
  confirmSpotRpc,
  flagSpotRpc,
  fetchVerifiedSpotsInBounds,
  fetchVerifiedSpotsNationwide,
  fetchSpotDensity,
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
  options?: SpotsInBoundsOptions,
) {
  return fetchVerifiedSpotsInBounds(createClient(), bounds, options);
}

// Client-side counterpart to queries.server.ts's getVerifiedSpotsNationwide —
// the swipe modal fetches in the browser (no page navigation), so it needs a
// client-Supabase-client version of the same "no address given" fallback.
export async function getVerifiedSpotsNationwide(
  options?: SpotsInBoundsOptions,
) {
  return fetchVerifiedSpotsNationwide(createClient(), options);
}

export async function getSpotDensity(bounds: BoundingBox, gridSize?: number) {
  return fetchSpotDensity(createClient(), bounds, gridSize);
}

export async function confirmSpot(spotId: string) {
  return confirmSpotRpc(createClient(), spotId);
}

export async function flagSpot(spotId: string) {
  return flagSpotRpc(createClient(), spotId);
}
