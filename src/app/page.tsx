import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardListIcon } from "lucide-react";
import { AddSpotDialog } from "@/components/add-spot-dialog";
import { FeaturedSpotlight } from "@/components/featured-spotlight";
import { SpotlightCarousel } from "@/components/spotlight-carousel";
import { SessionQuestionnaire } from "@/components/session-questionnaire";
import { StickyMobileCta } from "@/components/sticky-mobile-cta";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  getFeaturedSpots,
  getPendingCount,
} from "@/lib/supabase/queries.server";

// First CAROUSEL_COUNT feed the hero carousel, the rest fill the grid below.
const CAROUSEL_COUNT = 5;
const GRID_COUNT = 6;
const FEATURED_COUNT = CAROUSEL_COUNT + GRID_COUNT;

export const metadata: Metadata = {
  title: "Find Real Parks & Nature Spots Near You",
  description:
    "Discover real parks, gardens, and quiet nature spots across the USA, spotted by people who actually left the house to find them. Tell us what you're into and get matched.",
};

export default async function LandingPage() {
  const [featured, pendingCount] = await Promise.all([
    getFeaturedSpots(FEATURED_COUNT),
    getPendingCount(),
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
          <div className="flex items-center gap-4">
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
                <Link href="/pending">
                  <ClipboardListIcon aria-hidden="true" />
                  Review submissions
                  {pendingCount > 0 ? ` (${pendingCount})` : ""}
                </Link>
              }
            />
            <AddSpotDialog triggerSize="sm" />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <section className="mx-auto grid max-w-[1400px] items-center gap-8 px-4 pt-8 pb-16 md:grid-cols-[1.1fr_1fr] md:gap-12 md:pt-12">
        <div>
          <h1 className="font-logo text-5xl tracking-tight text-green-700 md:text-7xl">
            TOUCH GRASS
          </h1>
          <p className="mt-4 max-w-md text-xl text-muted-foreground text-pretty">
            Yeah, you. Close the app, get off the couch, there&apos;s a whole
            outside out there. Real parks and quiet spots near you, from people
            who actually left the house to find them.
          </p>
          <div id="hero-cta" className="mt-8 flex flex-col items-start gap-4">
            <p className="text-sm font-medium text-muted-foreground">
              Feeling adventurous?
            </p>
            <SessionQuestionnaire large />
            <Button
              variant="outline"
              size="lg"
              nativeButton={false}
              render={<Link href="/explore">Or browse the full map</Link>}
            />
          </div>
        </div>

        <SpotlightCarousel spots={carouselSpots} />
      </section>

      {restFeatured.length > 0 && (
        <section className="mx-auto max-w-[1400px] px-4 pb-16">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">
            More spots worth checking out
          </h2>
          <FeaturedSpotlight spots={restFeatured} />
        </section>
      )}
      <StickyMobileCta heroCtaId="hero-cta" />
    </div>
  );
}
