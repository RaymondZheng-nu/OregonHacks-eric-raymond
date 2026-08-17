"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CityPickerModal } from "@/components/city-picker-modal";
import { EventSpotlightCarousel } from "@/components/event-spotlight-carousel";
import { FeaturedSpotlight } from "@/components/featured-spotlight";
import { SessionQuestionnaire } from "@/components/session-questionnaire";
import { SpotlightCarousel } from "@/components/spotlight-carousel";
import { Button } from "@/components/ui/button";
import { getActiveEvents, type EventCity } from "@/lib/events";
import type { Spot } from "@/lib/types";

const CITY_LABEL: Record<EventCity, string> = {
  portland: "Portland",
  nyc: "New York City",
};

// Owns the hero section (headline + carousel) and the grid section below it
// as one unit, not just the carousel slot — both need to react to the same
// city selection, and the headline's CTA markup (id="hero-cta", read by
// StickyMobileCta) has to stay put either way, so there's no clean seam to
// split this at without duplicating state across two components.
export function LandingHighlights({
  spotCount,
  carouselSpots,
  restFeatured,
  portlandFeatured,
  nycFeatured,
}: {
  spotCount: number;
  carouselSpots: Spot[];
  restFeatured: Spot[];
  portlandFeatured: Spot[];
  nycFeatured: Spot[];
}) {
  // null = not yet decided (modal still open) or explicitly skipped — both
  // read as "show the existing nationwide default," which is deliberate:
  // dismissing the modal falls straight back to the exact carousel/grid
  // that's already live, not a broken or empty variant of the new feature.
  const [selectedCity, setSelectedCity] = useState<EventCity | null>(null);
  const [modalOpen, setModalOpen] = useState(true);

  // Computed once, not on a timer — this is a single landing-page render,
  // not a long-lived session where "now" needs to keep advancing.
  const activeEvents = useMemo(() => {
    try {
      return getActiveEvents(new Date());
    } catch {
      return [];
    }
  }, []);

  const cityEvents = selectedCity
    ? activeEvents.filter((event) => event.city === selectedCity)
    : [];

  const cityFeatured =
    selectedCity === "portland"
      ? portlandFeatured
      : selectedCity === "nyc"
        ? nycFeatured
        : [];

  // Falls back to the proven nationwide carousel/grid whenever there's no
  // city selection, or the city's data came back empty for any reason — the
  // landing page's hero slot never renders broken or blank.
  const showEventCarousel = selectedCity !== null && cityEvents.length > 0;
  const showCityGrid = selectedCity !== null && cityFeatured.length > 0;

  return (
    <>
      {modalOpen && (
        <CityPickerModal
          onSelect={(city) => {
            setSelectedCity(city);
            setModalOpen(false);
          }}
        />
      )}

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
          {spotCount > 0 && (
            <p className="mt-3 text-sm font-medium text-green-700">
              {spotCount.toLocaleString()}+ real spots mapped nationwide
            </p>
          )}
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

        {showEventCarousel ? (
          <EventSpotlightCarousel events={cityEvents} />
        ) : (
          <SpotlightCarousel spots={carouselSpots} />
        )}
      </section>

      {showCityGrid ? (
        <section className="mx-auto max-w-[1400px] px-4 pb-16">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">
            More spots in {CITY_LABEL[selectedCity as EventCity]}
          </h2>
          <FeaturedSpotlight spots={cityFeatured} />
        </section>
      ) : (
        restFeatured.length > 0 && (
          <section className="mx-auto max-w-[1400px] px-4 pb-16">
            <h2 className="mb-4 text-sm font-medium text-muted-foreground">
              More spots worth checking out
            </h2>
            <FeaturedSpotlight spots={restFeatured} />
          </section>
        )
      )}
    </>
  );
}
