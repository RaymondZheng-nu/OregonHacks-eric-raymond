// A refinement on top of category, never a replacement — vibe narrows within
// the picked categories. No overlap with category vocabulary on purpose:
// climbing/birdwatching were both, which made the quiz feel redundant.
export type VibeOption =
  | { value: string; label: string; kind: "activity"; activity: string }
  | { value: string; label: string; kind: "picnic" };

export const VIBE_OPTIONS: VibeOption[] = [
  { value: "sports", label: "Get active", kind: "activity", activity: "sports" },
  { value: "picnic", label: "Picnic", kind: "picnic" },
  { value: "lounge", label: "Read or relax", kind: "activity", activity: "lounge" },
  { value: "walk", label: "Take a walk", kind: "activity", activity: "walk" },
];
