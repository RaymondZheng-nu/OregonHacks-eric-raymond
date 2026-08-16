// Display labels for the `activity_fit` values the quiz can actually
// produce (see src/lib/intents.ts) — used by explore-view.tsx's "Good for:
// X" chip. `climb`/`birdwatch` aren't here: those intents route through
// `category` instead (climbing/birdwatching categories are 1:1 with the
// activity, so category alone is the simpler, sufficient filter).
export const ACTIVITY_LABELS: Record<string, string> = {
  sports: "Get active",
  lounge: "Picnic, reading, or relaxing",
  walk: "A walk",
};
