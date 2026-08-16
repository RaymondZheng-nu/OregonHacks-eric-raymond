export type SpotCategory =
  | "park"
  | "tree"
  | "garden"
  | "climbing"
  | "birdwatching"
  | "other";

export type SpotSource = "official" | "user" | "osm" | "reddit";

export type Spot = {
  id: string;
  name: string;
  description: string | null;
  category: SpotCategory;
  source: SpotSource;
  status: "pending" | "verified" | "rejected" | "merged";
  confirm_count: number;
  lat: number;
  lng: number;
  photo_url: string | null;
  external_id: string | null;
  area_m2: number | null;
  features: string[] | null;
  merged_into: string | null;
  created_at: string;
};
