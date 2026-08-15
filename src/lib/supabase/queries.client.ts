import { createClient } from "@/lib/supabase/client";
import {
  insertSpot,
  confirmSpotRpc,
  type SubmitSpotInput,
} from "@/lib/supabase/queries";

export async function submitSpot(input: SubmitSpotInput) {
  return insertSpot(createClient(), input);
}

export async function confirmSpot(spotId: string) {
  return confirmSpotRpc(createClient(), spotId);
}
