// Purely a refinement layer on top of category (see categories.ts) — never a
// replacement for it. Category is the app's real taxonomy (park vs hidden
// garden vs urbex spot); vibe just narrows within whatever categories were
// picked. Zero vocabulary overlap with category on purpose: climbing and
// birdwatching used to be listed both as a category *and* a vibe, which is
// what made the quiz feel redundant. Now they're category-only.
export type VibeOption =
  | { value: string; label: string; kind: "activity"; activity: string }
  | { value: string; label: string; kind: "picnic" };

export const VIBE_OPTIONS: VibeOption[] = [
  { value: "sports", label: "Get active", kind: "activity", activity: "sports" },
  { value: "picnic", label: "Picnic", kind: "picnic" },
  { value: "lounge", label: "Read or relax", kind: "activity", activity: "lounge" },
  { value: "walk", label: "Take a walk", kind: "activity", activity: "walk" },
];
