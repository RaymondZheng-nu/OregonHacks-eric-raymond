import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardListIcon } from "lucide-react";
import { AddSpotDialog } from "@/components/add-spot-dialog";
import { LandingHighlights } from "@/components/landing-highlights";
import { SavedButton } from "@/components/saved-button";
import { StickyMobileCta } from "@/components/sticky-mobile-cta";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { boundingBox } from "@/lib/geo";
import {
  DEFAULT_CENTER,
  DEFAULT_VIEWPORT_RADIUS_METERS,
  PORTLAND_CENTER,
} from "@/lib/search-params";
import {
  getFeaturedSpots,
  getPendingCount,
  getVerifiedSpotCount,
  getVerifiedSpotsInBounds,
} from "@/lib/supabase/queries.server";

// First CAROUSEL_COUNT feed the hero carousel, the rest fill the grid below.
const CAROUSEL_COUNT = 5;
const GRID_COUNT = 6;
const FEATURED_COUNT = CAROUSEL_COUNT + GRID_COUNT;
// City-scoped pool for the "more spots" grid once a city is picked in
// CityPickerModal — same bounded-fetch pattern /explore's SSR view already
// uses (search-params.ts), reused rather than a new query. photosFirst
// keeps the grid photo-forward without requiring a hard photo_url filter;
// FeaturedSpotlight already falls back to a map preview when one's missing.
const CITY_FEATURED_COUNT = 8;

export const metadata: Metadata = {
  title: "Find Real Parks & Nature Spots Near You",
  description:
    "Discover real parks, gardens, and quiet nature spots across the USA, spotted by people who actually left the house to find them. Tell us what you're into and get matched.",
};

export default async function LandingPage() {
  const [featured, pendingCount, spotCount, portlandFeatured, nycFeatured] =
    await Promise.all([
      getFeaturedSpots(FEATURED_COUNT),
      getPendingCount(),
      getVerifiedSpotCount(),
      getVerifiedSpotsInBounds(
        boundingBox(
          PORTLAND_CENTER.lat,
          PORTLAND_CENTER.lng,
          DEFAULT_VIEWPORT_RADIUS_METERS,
        ),
        { limit: CITY_FEATURED_COUNT, photosFirst: true },
      ),
      getVerifiedSpotsInBounds(
        boundingBox(
          DEFAULT_CENTER.lat,
          DEFAULT_CENTER.lng,
          DEFAULT_VIEWPORT_RADIUS_METERS,
        ),
        { limit: CITY_FEATURED_COUNT, photosFirst: true },
      ),
    ]);
  const carouselSpots = featured.slice(0, CAROUSEL_COUNT);
  const restFeatured = featured.slice(CAROUSEL_COUNT);

  return (
    <div className="min-h-[100dvh]">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4">
          <span className="font-logo text-lg tracking-tight text-green-700">
            TOUCH GRASS
          </span>
          {/* gap-2 below sm: gap-4 overflows on a 320px phone. */}
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
              <Link href="/privacy" className="hover:text-foreground">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-foreground">
                Terms
              </Link>
            </div>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                // aria-label carries the full name; below sm the visible text
                // collapses to an icon, which would leave no accessible name.
                <Link
                  href="/pending"
                  aria-label={`Review submissions${pendingCount > 0 ? ` (${pendingCount})` : ""}`}
                >
                  <ClipboardListIcon aria-hidden="true" />
                  <span className="hidden sm:inline" aria-hidden="true">
                    Review submissions
                  </span>
                  <span aria-hidden="true">
                    {pendingCount > 0 ? ` (${pendingCount})` : ""}
                  </span>
                </Link>
              }
            />
            <SavedButton triggerSize="sm" />
            <AddSpotDialog triggerSize="sm" />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <LandingHighlights
        spotCount={spotCount}
        carouselSpots={carouselSpots}
        restFeatured={restFeatured}
        portlandFeatured={portlandFeatured}
        nycFeatured={nycFeatured}
      />
      <StickyMobileCta heroCtaId="hero-cta" />
    </div>
  );
}
