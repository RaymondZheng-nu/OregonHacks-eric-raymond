import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Spot } from "@/lib/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Fisher-Yates. Must only ever be called server-side for anything whose
// output reaches a Client Component's initial render — calling it again
// during client hydration (e.g. inside a useState lazy initializer) produces
// a different order than the server did and React throws a hydration
// mismatch, since Math.random() isn't deterministic across the two runs.
export function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Same server-only-for-hydration caveat as shuffle() above. Shuffles a spot
// list the same way, but keeps the (independently randomized) photo-having
// spots ahead of the (also randomized) photo-less ones — a tiebreaker within
// an already-valid match set, never a filter, so nothing is excluded. Used
// wherever a fetch already prioritized photo-having rows server-side
// (SpotsInBoundsOptions.photosFirst) and still needs a display shuffle
// without a flat shuffle() undoing that prioritization.
export function shuffleWithPhotosFirst(spots: Spot[]): Spot[] {
  const withPhoto = shuffle(spots.filter((spot) => spot.photo_url))
  const withoutPhoto = shuffle(spots.filter((spot) => !spot.photo_url))
  return [...withPhoto, ...withoutPhoto]
}
