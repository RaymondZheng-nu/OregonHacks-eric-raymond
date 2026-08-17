import type { Metadata } from "next";
import Link from "next/link";
import { XIcon } from "lucide-react";
import { SpotSwipeDeck } from "@/components/spot-swipe-deck";
import { Button } from "@/components/ui/button";
import {
  getVerifiedSpotsInBounds,
  getVerifiedSpotsNationwide,
} from "@/lib/supabase/queries.server";
import { boundsFromSearch, parseSearchParams } from "@/lib/search-params";
import { shuffleWithPhotosFirst } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Swipe Spots",
  description:
    "Swipe through nearby parks, gardens, and quiet spots — save the ones worth visiting.",
};

// Wider than one batch needs so "Generate more" has variety to draw from.
const POOL_LIMIT = 40;

export default async function SwipePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const parsed = parseSearchParams(params);
  const hasLocation = parsed.lat !== null && parsed.lng !== null;

  // No location only happens on a direct /swipe visit (the quiz always sends
  // coords now), where a nationwide sample is the honest fallback.
  let spots;
  let userLocation: { lat: number; lng: number } | undefined;
  if (hasLocation) {
    userLocation = { lat: parsed.lat as number, lng: parsed.lng as number };
    const { bounds: initialBounds } = boundsFromSearch(parsed);
    const pool = await getVerifiedSpotsInBounds(initialBounds, {
      limit: POOL_LIMIT,
      categories: parsed.categories ?? undefined,
      activity: parsed.activity,
      picnic: parsed.picnic,
      photosFirst: true,
    });
    // Bounds query returns DB order, so shuffle it off the newest-ingested run.
    // shuffleWithPhotosFirst preserves the photosFirst weighting a flat shuffle
    // would undo.
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

  return (
    // bg-accent, not bg-background: dark mode's --background is near-black,
    // which read as a harsh solid void filling the empty space around the
    // deck. bg-accent is meaningfully lighter (and has the brand's green
    // tint), closer to the softer, less-than-pure-black feel the quiz
    // dialog's own overlay has.
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-accent">
      {/* Same corner position + ghost icon-button treatment as the quiz
          dialog's own close button — one consistent exit affordance, not a
          text link on desktop and a different icon on mobile. */}
      <Button
        variant="ghost"
        size="icon-sm"
        nativeButton={false}
        className="fixed top-3 right-3 z-[1200]"
        render={
          <Link href="/">
            <XIcon aria-hidden="true" />
            <span className="sr-only">Exit swiping</span>
          </Link>
        }
      />
      <SpotSwipeDeck
        spots={spots}
        userLocation={userLocation}
        filters={{
          categories: parsed.categories,
          activity: parsed.activity,
          picnic: parsed.picnic,
        }}
      />
    </div>
  );
}
