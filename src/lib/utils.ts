import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

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
