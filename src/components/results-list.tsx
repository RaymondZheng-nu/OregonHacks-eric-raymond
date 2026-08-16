"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
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
import type { Spot } from "@/lib/types";

const METERS_TO_MILES = 1609.34;

type SpotWithDistance = Spot & { distanceMeters: number | null };

function formatDistance(meters: number | null): string | null {
  if (meters == null) return null;
  const miles = meters / METERS_TO_MILES;
  return miles < 0.1 ? "Very close" : `${miles.toFixed(1)} mi away`;
}

export function ResultsList({
  spots,
  exploreParams,
}: {
  // Already shuffled server-side (results/page.tsx) before this ever
  // reaches the client — shuffling again here would re-run Math.random()
  // during hydration and produce a different order than the server sent,
  // which React reports as a hydration mismatch.
  spots: SpotWithDistance[];
  exploreParams: string;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);

  function goPrev() {
    setIndex((i) => (i - 1 + spots.length) % spots.length);
  }

  function goNext() {
    setIndex((i) => (i + 1) % spots.length);
  }

  // Same left/right paging as the on-screen arrows, for anyone who'd rather
  // use the keyboard once the popup has focus.
  useEffect(() => {
    if (spots.length === 0) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    }
    // Capture phase: the dialog primitive's own focus-trap handling responds
    // to arrow keys too and stops propagation before a normal bubble-phase
    // listener on window ever sees the event.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goPrev/goNext close over spots.length only, which is stable for the life of this page (spots never change after the server sends them).
  }, [spots.length]);

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

  const spot = spots[index];
  const distanceLabel = formatDistance(spot.distanceMeters);
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
            {index + 1} of {spots.length} matches
          </DialogDescription>
        </DialogHeader>

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
              style={{ backgroundColor: `${CATEGORY_META[spot.category].color}26` }}
              aria-hidden="true"
            />
          )}

          {spots.length > 1 && (
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
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span style={{ color: CATEGORY_META[spot.category].color }}>
              {CATEGORY_META[spot.category].label}
            </span>
            {distanceLabel && (
              <>
                <span>·</span>
                <span>{distanceLabel}</span>
              </>
            )}
          </div>
          {spot.description && (
            <p className="line-clamp-3 text-sm">{spot.description}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            nativeButton={false}
            render={<Link href={`/explore?${viewParams.toString()}`}>View on map</Link>}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
