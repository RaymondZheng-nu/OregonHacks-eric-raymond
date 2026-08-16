export type SpotCategory =
  | "park"
  | "tree"
  | "garden"
  | "climbing"
  | "birdwatching"
  | "abandoned"
  | "hangout"
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
  flag_count: number;
  lat: number;
  lng: number;
  photo_url: string | null;
  external_id: string | null;
  area_m2: number | null;
  features: string[] | null;
  merged_into: string | null;
  size_class: "small" | "medium" | "large" | null;
  activity_fit: string[] | null;
  amenities: string[] | null;
  accessibility: string | null;
  created_at: string;
};
