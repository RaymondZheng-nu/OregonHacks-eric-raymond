import { createClient } from "@/lib/supabase/client";
import {
  insertSpot,
  confirmSpotRpc,
  flagSpotRpc,
  fetchVerifiedSpotsInBounds,
  fetchVerifiedSpotsNationwide,
  fetchSpotDensity,
  fetchVerifiedTips,
  submitFreeActivityTip,
  confirmTipRpc,
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

// Client-side counterpart for the swipe modal's in-browser no-address fetch.
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

export async function getVerifiedTips(spotId: string) {
  return fetchVerifiedTips(createClient(), spotId);
}

export async function submitTip(spotId: string, tip: string, sourceUrl: string | null) {
  return submitFreeActivityTip(createClient(), spotId, tip, sourceUrl);
}

export async function confirmTip(tipId: string) {
  return confirmTipRpc(createClient(), tipId);
}
