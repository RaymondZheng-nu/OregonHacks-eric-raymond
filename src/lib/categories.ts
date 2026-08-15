import type { SpotCategory } from "@/lib/types";

export const CATEGORY_META: Record<
  SpotCategory,
  { label: string; color: string }
> = {
  park: { label: "Park", color: "#16a34a" },
  tree: { label: "Street Trees", color: "#65a30d" },
  garden: { label: "Garden", color: "#db2777" },
  climbing: { label: "Climbing", color: "#ea580c" },
  birdwatching: { label: "Birdwatching", color: "#0284c7" },
  other: { label: "Other", color: "#7c3aed" },
};

export const CATEGORY_OPTIONS = Object.entries(CATEGORY_META).map(
  ([value, meta]) => ({ value: value as SpotCategory, ...meta })
);
