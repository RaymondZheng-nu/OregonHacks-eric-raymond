"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CATEGORY_META } from "@/lib/categories";
import { getSpotVerdict } from "@/lib/spot-verdict";
import { getMatchChips, type MatchFilters } from "@/lib/spot-reasoning";
import { cn } from "@/lib/utils";
import type { Spot } from "@/lib/types";

type SpotWithDistance = Spot & { distanceMeters: number | null };

type RefineKey = "bigger" | "closer" | "best-rated";

const REFINE_OPTIONS: { key: RefineKey; label: string }[] = [
  { key: "bigger", label: "Bigger" },
  { key: "closer", label: "Closer" },
  { key: "best-rated", label: "Best rated" },
];

// Reveal in small batches instead of dumping the whole pool (up to
// POOL_LIMIT in results/page.tsx) on the user at once — "1 of 40 matches"
// reads as overwhelming even one-at-a-time. "Generate more" grows the
// revealed slice without a network round trip, since the full pool is
// already sitting in memory.
const INITIAL_REVEAL = 5;
const REVEAL_STEP = 5;

export function ResultsList({
  spots,
  exploreParams,
  filters,
}: {
  // Already shuffled server-side (results/page.tsx) before this ever
  // reaches the client — shuffling again here would re-run Math.random()
  // during hydration and produce a different order than the server sent,
  // which React reports as a hydration mismatch.
  spots: SpotWithDistance[];
  exploreParams: string;
  filters: MatchFilters;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [activeRefines, setActiveRefines] = useState<Set<RefineKey>>(new Set());
  const [revealCount, setRevealCount] = useState(INITIAL_REVEAL);

  function toggleRefine(key: RefineKey) {
    setActiveRefines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setIndex(0);
    setRevealCount(INITIAL_REVEAL);
  }

  // "Bigger" can empty the pool for a niche search — fall back to the full
  // pool with a note rather than the dead-end "No spots match yet" state,
  // which stays reserved for the genuinely-zero-results case from the server.
  const biggerFiltered = activeRefines.has("bigger")
    ? spots.filter((s) => s.size_class === "medium" || s.size_class === "large")
    : spots;
  const usingFallback =
    activeRefines.has("bigger") && biggerFiltered.length === 0;
  const pool = usingFallback ? spots : biggerFiltered;

  // "Closer" wins over "Best rated" when both are active — physical
  // proximity is the more actionable axis for a get-outside app.
  const sortedPool = [...pool].sort((a, b) => {
    if (activeRefines.has("closer")) {
      return (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity);
    }
    if (activeRefines.has("best-rated")) {
      return b.confirm_count - b.flag_count - (a.confirm_count - a.flag_count);
    }
    return 0;
  });

  // Only ever page through what's actually been revealed — "Generate more"
  // grows this without touching index/goPrev/goNext.
  const visiblePool = sortedPool.slice(0, revealCount);
  const hasMore = revealCount < sortedPool.length;

  function goPrev() {
    setIndex((i) => (i - 1 + visiblePool.length) % visiblePool.length);
  }

  function goNext() {
    setIndex((i) => (i + 1) % visiblePool.length);
  }

  function generateMore() {
    setRevealCount((c) => Math.min(c + REVEAL_STEP, sortedPool.length));
  }

  // Same left/right paging as the on-screen arrows, for anyone who'd rather
  // use the keyboard once the popup has focus.
  useEffect(() => {
    if (visiblePool.length === 0) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    }
    // Capture phase: the dialog primitive's own focus-trap handling responds
    // to arrow keys too and stops propagation before a normal bubble-phase
    // listener on window ever sees the event.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goPrev/goNext close over visiblePool.length only, which this effect already re-runs on.
  }, [visiblePool.length]);

  function handleOpenChange(open: boolean) {
    // This page's whole purpose is the popup — closing it means "I'm done
    // looking," so it goes back to the start instead of leaving an empty
    // page behind.
    if (!open) router.push("/");
  }

  if (spots.length === 0) {
    return (
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>No spots match yet</DialogTitle>
            <DialogDescription>
              Try a different vibe, fewer categories, or a wider radius.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const spot = visiblePool[index];
  const verdict = getSpotVerdict(spot);
  const matchChips = getMatchChips(spot, filters);
  const viewParams = new URLSearchParams(exploreParams);
  viewParams.set("spot", spot.id);
  viewParams.set("lat", String(spot.lat));
  viewParams.set("lng", String(spot.lng));

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate">{spot.name}</DialogTitle>
          <DialogDescription>
            {index + 1} of {visiblePool.length} matches
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1.5">
          {REFINE_OPTIONS.map(({ key, label }) => (
            <Button
              key={key}
              type="button"
              size="xs"
              variant={activeRefines.has(key) ? "default" : "outline"}
              onClick={() => toggleRefine(key)}
            >
              {label}
            </Button>
          ))}
        </div>
        {usingFallback && (
          <p className="text-xs text-muted-foreground">
            No bigger matches nearby — showing everything.
          </p>
        )}

        <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg">
          {spot.photo_url ? (
            <Image
              src={spot.photo_url}
              alt={spot.name}
              fill
              sizes="(min-width: 640px) 24rem, 100vw"
              className="object-cover"
            />
          ) : (
            <div
              className="h-full w-full"
              style={{
                backgroundColor: `${CATEGORY_META[spot.category].color}26`,
              }}
              aria-hidden="true"
            />
          )}

          {visiblePool.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous spot"
                onClick={goPrev}
                className="absolute top-1/2 left-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
              >
                <ChevronLeftIcon aria-hidden="true" className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Next spot"
                onClick={goNext}
                className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
              >
                <ChevronRightIcon aria-hidden="true" className="size-5" />
              </button>
            </>
          )}
        </div>

        <div className="space-y-1.5">
          {matchChips.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {matchChips.map((chip) => (
                <Badge key={chip} variant="outline">
                  {chip}
                </Badge>
              ))}
            </div>
          )}
          {spot.description && (
            <p className="line-clamp-3 text-sm">{spot.description}</p>
          )}
          <p
            className={cn(
              "text-xs",
              verdict.tone === "caution"
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {verdict.label}
          </p>
        </div>

        <DialogFooter>
          {hasMore && (
            <Button type="button" variant="outline" onClick={generateMore}>
              Generate more
            </Button>
          )}
          <Button
            nativeButton={false}
            render={
              <Link href={`/explore?${viewParams.toString()}`}>
                View on map
              </Link>
            }
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
