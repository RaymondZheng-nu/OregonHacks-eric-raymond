import type { SpotCategory } from "@/lib/types";

// The quiz's single guiding question ("what's calling you outside?") maps
// each answer to exactly one filtering mechanism — activity_fit for intents
// that cut across categories (sports/lounge/walk aren't any one place type),
// category for intents where category already *is* the answer (climbing,
// birdwatching, garden). Never both: that's what made the old two-question
// version feel redundant, since climbing/birdwatching had to be listed as
// both a category and an activity to keep the two questions from disagreeing.
//
// Only options backed by real live data are offered here — checked directly
// against Supabase while writing this. `abandoned`/`hangout` are UI-only
// categories with zero verified spots (see HANDOFF.md open items), and
// `tree` has 2 nationwide — guiding someone toward any of those is a
// guaranteed "no spots match" dead end. `other` isn't a coherent intent.
// All of those stay reachable through /explore's own category dropdown.
//
// "Picnic" is deliberately its own `kind`, not folded into `activity`:
// `lounge` is only ever assigned to small spots (SIZE_ACTIVITY_DEFAULTS in
// dedup-cleanup.mjs), which is a correct fit for reading/relaxing (a bench
// is enough) but not for picnicking (needs an open field). There's no
// activity_fit tag for "picnic" — `size_class` medium/large, already a real
// computed column, is the honest signal for "has an open area."
export type IntentOption =
  | { value: string; label: string; kind: "activity"; activity: string }
  | { value: string; label: string; kind: "category"; category: SpotCategory }
  | { value: string; label: string; kind: "picnic" };

export const INTENT_OPTIONS: IntentOption[] = [
  { value: "sports", label: "Get active", kind: "activity", activity: "sports" },
  { value: "picnic", label: "Picnic", kind: "picnic" },
  { value: "lounge", label: "Read or relax", kind: "activity", activity: "lounge" },
  { value: "walk", label: "Take a walk", kind: "activity", activity: "walk" },
  { value: "climbing", label: "Climb something", kind: "category", category: "climbing" },
  { value: "birdwatching", label: "Watch birds", kind: "category", category: "birdwatching" },
  { value: "garden", label: "Explore a garden", kind: "category", category: "garden" },
];
