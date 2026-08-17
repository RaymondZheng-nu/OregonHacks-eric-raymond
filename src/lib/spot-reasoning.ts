import { CATEGORY_META } from "@/lib/categories";
import { VIBE_OPTIONS } from "@/lib/vibes";
import type { Spot, SpotCategory } from "@/lib/types";

const METERS_TO_MILES = 1609.34;

export function formatDistance(meters: number | null): string | null {
  if (meters == null) return null;
  const miles = meters / METERS_TO_MILES;
  return miles < 0.1 ? "Very close" : `${miles.toFixed(1)} mi away`;
}

export type MatchFilters = {
  categories: SpotCategory[] | null;
  activity?: string;
  picnic: boolean;
};

// Labels for activity_fit values with no VIBE_OPTIONS entry (climb/birdwatch
// are category-only in the quiz, but the pipeline still tags them on rows).
const ACTIVITY_LABELS: Record<string, string> = {
  climb: "Climbing spot",
  birdwatch: "Birdwatching",
  walk: "Good for a walk",
  lounge: "Good for reading",
  sports: "Good for getting active",
};

// The "why this matched" chip, split out of getMatchChips so callers with their
// own badge layout (the swipe deck) can prepend just this one.
export function getMatchReasonChip(
  spot: Pick<Spot, "category" | "activity_fit" | "size_class">,
  filters: MatchFilters,
): string | null {
  if (filters.categories?.includes(spot.category)) {
    return CATEGORY_META[spot.category].label;
  }
  if (filters.activity && spot.activity_fit?.includes(filters.activity)) {
    const vibe = VIBE_OPTIONS.find(
      (option) =>
        option.kind === "activity" && option.activity === filters.activity,
    );
    if (vibe) return vibe.label;
  }
  if (
    filters.picnic &&
    (spot.size_class === "medium" || spot.size_class === "large")
  ) {
    return "Picnic-worthy";
  }
  return null;
}

// Every chip traces to a real column on the row (no fabrication). Capped at 4,
// favoring "why this matched" over an exhaustive tag dump.
export function getMatchChips(
  spot: Spot & { distanceMeters: number | null },
  filters: MatchFilters,
): string[] {
  const chips: string[] = [];

  // 1. Why this result exists at all.
  const reasonChip = getMatchReasonChip(spot, filters);
  if (reasonChip) chips.push(reasonChip);

  // 2. Size, when known.
  if (spot.size_class) {
    chips.push(spot.size_class[0].toUpperCase() + spot.size_class.slice(1));
  }

  // 3. One more real descriptor not already shown as the match chip.
  const extraActivity = spot.activity_fit?.find(
    (activity) => activity !== filters.activity && ACTIVITY_LABELS[activity],
  );
  if (extraActivity) chips.push(ACTIVITY_LABELS[extraActivity]);

  // 4. Distance.
  const distanceLabel = formatDistance(spot.distanceMeters);
  if (distanceLabel) chips.push(distanceLabel);

  return chips.slice(0, 4);
}
