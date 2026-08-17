import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Spot } from "@/lib/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Fisher-Yates. Keep it server-side for anything that reaches a Client
// Component's initial render — re-running it during hydration gives a different
// order (Math.random isn't deterministic) and React throws a mismatch.
export function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Same hydration caveat as shuffle(). Randomizes photo-having and photo-less
// spots independently, keeping photo-having ones first — a tiebreaker, not a
// filter. Preserves a photosFirst fetch's ordering that a flat shuffle would undo.
export function shuffleWithPhotosFirst(spots: Spot[]): Spot[] {
  const withPhoto = shuffle(spots.filter((spot) => spot.photo_url))
  const withoutPhoto = shuffle(spots.filter((spot) => !spot.photo_url))
  return [...withPhoto, ...withoutPhoto]
}
