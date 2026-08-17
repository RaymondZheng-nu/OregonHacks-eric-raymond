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
  abandoned: { label: "Urbex", color: "#57534e" },
  hangout: { label: "Hangout", color: "#f59e0b" },
  other: { label: "Other", color: "#7c3aed" },
};

// Shared by every picker. `tree` (2 spots nationwide) is dropped as a choice,
// but CATEGORY_META keeps its entry so a legacy tree-category row still resolves.
export const SELECTABLE_CATEGORIES: SpotCategory[] = (
  Object.keys(CATEGORY_META) as SpotCategory[]
).filter((category) => category !== "tree");

export const CATEGORY_OPTIONS = SELECTABLE_CATEGORIES.map((value) => ({
  value,
  ...CATEGORY_META[value],
}));
