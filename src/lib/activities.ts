import type { SpotCategory } from "@/lib/types";

// Mirrors the `activity_fit` vocabulary computed for every verified spot
// during ingestion (see scripts/dedup-cleanup.mjs) — a real column in
// Postgres, not a new concept invented for the quiz. "Picnic" and "reading"
// both land on `lounge` since the data doesn't distinguish them; the label
// says so rather than pretending they're separate signals.
// `impliesCategory` auto-selects the one category that can actually satisfy
// climb/birdwatch, since those activity values only ever appear on spots in
// that exact category.
export const ACTIVITY_OPTIONS: {
  value: string;
  label: string;
  impliesCategory?: SpotCategory;
}[] = [
  { value: "sports", label: "Sports" },
  { value: "walk", label: "A walk" },
  { value: "lounge", label: "Picnic, reading, or relaxing" },
  { value: "climb", label: "Climbing", impliesCategory: "climbing" },
  { value: "birdwatch", label: "Birdwatching", impliesCategory: "birdwatching" },
];

export const ACTIVITY_LABELS: Record<string, string> = Object.fromEntries(
  ACTIVITY_OPTIONS.map((option) => [option.value, option.label])
);
