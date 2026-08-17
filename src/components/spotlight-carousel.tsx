"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { SpotLocationPreview } from "@/components/spot-location-preview-dynamic";
import { CATEGORY_META } from "@/lib/categories";
import { getSpotVerdict } from "@/lib/spot-verdict";
import { cn } from "@/lib/utils";
import type { Spot } from "@/lib/types";

const AUTO_ADVANCE_MS = 5000;

// Same failed-load fallback as featured-spotlight.tsx's FeaturedCardMedia —
// see that component's comment for why (Wikimedia rate-limiting observed
// live). Kept as its own component so each slide's failure flag is
// independent, same reason as there.
function CarouselSlideMedia({
  spot,
  priority,
}: {
  spot: Spot;
  priority: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  if (!spot.photo_url || imageFailed) {
    return (
      <SpotLocationPreview lat={spot.lat} lng={spot.lng} category={spot.category} />
    );
  }

  return (
    <Image
      src={spot.photo_url}
      alt={spot.name}
      fill
      priority={priority}
      sizes="(min-width: 768px) 50vw, 100vw"
      className="object-cover"
      onError={() => setImageFailed(true)}
    />
  );
}

export function SpotlightCarousel({ spots }: { spots: Spot[] }) {
  const reduceMotion = useReducedMotion();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Auto-advance by scrolling the native snap container — this doubles as
  // the touch/trackpad swipe implementation, so there's no separate gesture
  // handler to keep in sync with the dots.
  useEffect(() => {
    if (reduceMotion || paused || spots.length <= 1) return;

    const id = setInterval(() => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const next = (index + 1) % spots.length;
      scroller.scrollTo({
        left: next * scroller.clientWidth,
        behavior: "smooth",
      });
    }, AUTO_ADVANCE_MS);

    return () => clearInterval(id);
  }, [index, paused, reduceMotion, spots.length]);

  // Keeps the dots in sync when the user swipes/scrolls manually instead of
  // going through goTo().
  function handleScroll() {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.clientWidth === 0) return;
    const next = Math.round(scroller.scrollLeft / scroller.clientWidth);
    setIndex((prev) => (prev === next ? prev : next));
  }

  function goTo(next: number) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTo({
      left: next * scroller.clientWidth,
      behavior: "smooth",
    });
    setIndex(next);
  }

  if (spots.length === 0) return null;

  return (
    <div
      className="relative aspect-4/3 w-full overflow-hidden rounded-2xl md:aspect-square"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {spots.map((spot) => {
          const verdict = getSpotVerdict(spot);
          return (
            <div
              key={spot.id}
              className="relative h-full w-full shrink-0 snap-center"
            >
              <CarouselSlideMedia spot={spot} priority={spot.id === spots[0].id} />
              <div className="absolute inset-x-0 bottom-0 z-[1001] bg-gradient-to-t from-black/70 to-transparent p-4">
                <p className="text-sm font-medium text-white">{spot.name}</p>
                <p
                  className={cn(
                    "text-xs",
                    verdict.tone === "caution" ? "text-white" : "text-white/80",
                  )}
                >
                  {CATEGORY_META[spot.category].label} · {verdict.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {spots.length > 1 && (
        <div className="absolute inset-x-0 top-3 z-[1001] flex justify-center gap-1.5">
          {spots.map((spot, i) => (
            <button
              key={spot.id}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index}
              onClick={() => goTo(i)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-200 ease-out",
                i === index
                  ? "w-5 bg-white"
                  : "w-1.5 bg-white/50 hover:bg-white/75",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
