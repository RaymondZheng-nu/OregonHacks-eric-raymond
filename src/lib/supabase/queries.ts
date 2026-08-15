import type { SupabaseClient } from "@supabase/supabase-js";
import type { Spot, SpotCategory } from "@/lib/types";

// Reads soft-fail to empty defaults (matches the `data ?? []` pattern the call
// sites used before this module existed) so a page never crashes on a blip —
// it just renders an empty state. Mutations throw, since every call site
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
