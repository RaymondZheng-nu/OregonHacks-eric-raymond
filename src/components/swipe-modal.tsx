"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SpotSwipeDeck } from "@/components/spot-swipe-deck";
import { boundsFromSearch, parseSearchParams } from "@/lib/search-params";
import { shuffleWithPhotosFirst } from "@/lib/utils";
import {
  getVerifiedSpotsInBounds,
  getVerifiedSpotsNationwide,
} from "@/lib/supabase/queries.client";
import type { Spot } from "@/lib/types";

// Wider than one batch needs so "Generate more" has variety to draw from.
const POOL_LIMIT = 40;

type DeckData = {
  spots: Spot[];
  userLocation?: { lat: number; lng: number };
};

// Modal over the current page instead of routing to /swipe: fetching
// client-side keeps the page behind it mounted and dimmed. /swipe still exists
// as a real full page for direct links/refreshes.
export function SwipeModal({
  query,
  onClose,
}: {
  query: URLSearchParams;
  onClose: () => void;
}) {
  const [data, setData] = useState<DeckData | null>(null);
  const parsed = parseSearchParams(Object.fromEntries(query.entries()));

  useEffect(() => {
    let cancelled = false;
    const hasLocation = parsed.lat !== null && parsed.lng !== null;

    async function load() {
      let spots: Spot[];
      let userLocation: { lat: number; lng: number } | undefined;

      if (hasLocation) {
        userLocation = {
          lat: parsed.lat as number,
          lng: parsed.lng as number,
        };
        const { bounds: initialBounds } = boundsFromSearch(parsed);
        const pool = await getVerifiedSpotsInBounds(initialBounds, {
          limit: POOL_LIMIT,
          categories: parsed.categories ?? undefined,
          activity: parsed.activity,
          picnic: parsed.picnic,
          photosFirst: true,
        });
        // Bounds query returns DB order, so shuffle it off the newest-ingested
        // run. shuffleWithPhotosFirst preserves the photosFirst weighting a flat
        // shuffle would undo. Client-only component, so no SSR order to mismatch.
        spots = shuffleWithPhotosFirst(pool);
      } else {
        spots = await getVerifiedSpotsNationwide({
          limit: POOL_LIMIT,
          categories: parsed.categories ?? undefined,
          activity: parsed.activity,
          picnic: parsed.picnic,
          photosFirst: true,
        });
      }

      if (cancelled) return;
      setData({ spots, userLocation });
    }

    load().catch((error) => {
      console.error("Failed to load swipe deck spots", error);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on `query` only; a fresh SwipeModal mounts per submit, so this runs once per instance.
  }, [query]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="h-[min(85dvh,700px)] gap-0 overflow-hidden p-0 sm:max-w-sm">
        {/* Accessible name for the dialog; the visible header is the wordmark. */}
        <DialogTitle className="sr-only">Swipe through nearby spots</DialogTitle>
        {data ? (
          <SpotSwipeDeck
            spots={data.spots}
            userLocation={data.userLocation}
            filters={{
              categories: parsed.categories,
              activity: parsed.activity,
              picnic: parsed.picnic,
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
            <div className="h-40 w-full animate-pulse rounded-xl bg-muted" />
            <p className="text-sm text-muted-foreground">Finding spots…</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
