export type SpotCategory =
  | "park"
  | "tree"
  | "garden"
  | "climbing"
  | "birdwatching"
  | "other";

export type Spot = {
  id: string;
  name: string;
  description: string | null;
  category: SpotCategory;
  source: "official" | "user";
  status: "pending" | "verified";
  confirm_count: number;
  lat: number;
  lng: number;
  photo_url: string | null;
  created_at: string;
};
