import { createClient } from "@/lib/supabase/server";
import {
  fetchVerifiedSpots,
  fetchPendingSpots,
  fetchPendingCount,
} from "@/lib/supabase/queries";

export async function getVerifiedSpots() {
  return fetchVerifiedSpots(await createClient());
}

export async function getPendingSpots() {
  return fetchPendingSpots(await createClient());
}

export async function getPendingCount() {
  return fetchPendingCount(await createClient());
}
