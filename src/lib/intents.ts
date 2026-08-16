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
export type IntentOption =
  | { value: string; label: string; kind: "activity"; activity: string }
  | { value: string; label: string; kind: "category"; category: SpotCategory };

export const INTENT_OPTIONS: IntentOption[] = [
  { value: "sports", label: "Get active", kind: "activity", activity: "sports" },
  { value: "lounge", label: "Picnic, reading, or relaxing", kind: "activity", activity: "lounge" },
  { value: "walk", label: "Take a walk", kind: "activity", activity: "walk" },
  { value: "climbing", label: "Climb something", kind: "category", category: "climbing" },
  { value: "birdwatching", label: "Watch birds", kind: "category", category: "birdwatching" },
  { value: "garden", label: "Explore a garden", kind: "category", category: "garden" },
];
