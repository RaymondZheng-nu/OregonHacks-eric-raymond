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

// Every picker in the app (quiz, /explore's dropdown, add-spot-dialog) should
// offer the same set — `tree` (2 spots nationwide) is confirmed dead weight,
// dropped everywhere it's user-selectable. `CATEGORY_META` still has a `tree`
// entry so a lookup against a legacy tree-category row doesn't crash; it's
// just never offered as a choice.
export const SELECTABLE_CATEGORIES: SpotCategory[] = (
  Object.keys(CATEGORY_META) as SpotCategory[]
).filter((category) => category !== "tree");

export const CATEGORY_OPTIONS = SELECTABLE_CATEGORIES.map((value) => ({
  value,
  ...CATEGORY_META[value],
}));
