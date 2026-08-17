"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SpotSwipeDeck } from "@/components/spot-swipe-deck";
import {
  boundsFromSearch,
  buildExploreParams,
  parseSearchParams,
} from "@/lib/search-params";
import { shuffleWithPhotosFirst } from "@/lib/utils";
import {
  getVerifiedSpotsInBounds,
  getVerifiedSpotsNationwide,
} from "@/lib/supabase/queries.client";
import type { Spot } from "@/lib/types";

// Same pool size as /swipe's full-page fallback (app/swipe/page.tsx) — a
// wider pool than any single batch needs, so "Generate more" has real
// variety to draw from instead of looping through a handful.
const POOL_LIMIT = 40;

type DeckData = {
  spots: Spot[];
  userLocation?: { lat: number; lng: number };
  exploreParams: string;
};

// Card-styled modal over whatever page the quiz was opened from (today,
// always "/" — SessionQuestionnaire only renders there) instead of
// navigating to /swipe: fetching client-side means the page underneath
// never unmounts, so it stays visible (dimmed) behind the same Dialog
// overlay every other dialog in this app uses. /swipe itself is unchanged
// and still handles direct links/refreshes as a real full page, where
// there's no "page behind" to preserve anyway.
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
        // Unlike the nationwide fetch below, the bounds query returns DB
        // order — shuffle it so the deck isn't just the newest-ingested
        // spots in a row. shuffleWithPhotosFirst, not a flat shuffle: the
        // query above already weighted photo-having rows into this pool via
        // photosFirst, and a flat shuffle would immediately undo that by
        // remixing them back in with everything else. Safe to shuffle
        // client-side here (unlike utils.ts's shuffle doc warning about
        // hydration mismatches): this component never renders server-side,
        // so there's no SSR order to mismatch against.
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
      setData({
        spots,
        userLocation,
        exploreParams: buildExploreParams(parsed).toString(),
      });
    }

    load().catch((error) => {
      console.error("Failed to load swipe deck spots", error);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on `query` identity only; SessionQuestionnaire mounts a fresh SwipeModal per submit, so this only ever runs once per instance.
  }, [query]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="h-[min(85dvh,700px)] gap-0 overflow-hidden p-0 sm:max-w-sm">
        {data ? (
          <SpotSwipeDeck
            spots={data.spots}
            userLocation={data.userLocation}
            filters={{
              categories: parsed.categories,
              activity: parsed.activity,
              picnic: parsed.picnic,
            }}
            exploreParams={data.exploreParams}
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
