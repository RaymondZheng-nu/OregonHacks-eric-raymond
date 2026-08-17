"use client";

import Image from "next/image";
import { ExternalLinkIcon, MapPinIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import type { NatureEvent } from "@/lib/events";

const AUTO_ADVANCE_MS = 5000;

// No live map preview per slide, unlike SpotlightCarousel's photo-less
// fallback — this carousel sits on the highest-risk screen in the app, and
// mounting a Leaflet instance per slide is a moving part these hand-seeded
// cards don't need. photoUrl is a real photo of the venue (see events.ts),
// not a live fetch; the gradient is the fallback when there isn't one, when
// the photo hasn't been requested yet (shouldLoad), or when it fails to
// load — same failed-load pattern as featured-spotlight.tsx's
// FeaturedCardMedia, same reason (a third-party photo host can fail after
// the URL already looked valid; observed live: Wikimedia rate-limiting a
// burst of concurrent Commons-hosted image requests).
function EventSlideMedia({
  event,
  shouldLoad,
  priority,
}: {
  event: NatureEvent;
  shouldLoad: boolean;
  priority: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  if (!event.photoUrl || !shouldLoad || imageFailed) {
    return <div className="absolute inset-0 bg-green-800" />;
  }

  return (
    <Image
      src={event.photoUrl}
      alt={event.venueName}
      fill
      priority={priority}
      sizes="(min-width: 768px) 50vw, 100vw"
      className="object-cover"
      onError={() => setImageFailed(true)}
    />
  );
}

export function EventSpotlightCarousel({ events }: { events: NatureEvent[] }) {
  const reduceMotion = useReducedMotion();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Grows, never shrinks — once a slide's photo has loaded it stays loaded
  // as the user scrolls past, rather than re-fetching every time it comes
  // back into view. Only the active slide ± 1 neighbor load at any given
  // moment, so a 7-event carousel requests 1-3 third-party photos on mount
  // instead of all 7 at once — the concurrent-request burst is what tripped
  // Wikimedia's rate limit in testing, not any single URL being invalid.
  const [loadedIndices, setLoadedIndices] = useState<Set<number>>(
    () => new Set([0]),
  );

  // Called everywhere `index` changes (not a useEffect keyed on index) —
  // this is an event-driven update in response to a scroll/click, not a
  // derived value React needs to keep synchronized on every render.
  function selectIndex(next: number) {
    setIndex(next);
    setLoadedIndices((prev) => {
      if (prev.has(next - 1) && prev.has(next) && prev.has(next + 1)) {
        return prev;
      }
      const updated = new Set(prev);
      updated.add(next - 1);
      updated.add(next);
      updated.add(next + 1);
      return updated;
    });
  }

  useEffect(() => {
    if (reduceMotion || paused || events.length <= 1) return;

    const id = setInterval(() => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const next = (index + 1) % events.length;
      scroller.scrollTo({
        left: next * scroller.clientWidth,
        behavior: "smooth",
      });
    }, AUTO_ADVANCE_MS);

    return () => clearInterval(id);
  }, [index, paused, reduceMotion, events.length]);

  function handleScroll() {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.clientWidth === 0) return;
    const next = Math.round(scroller.scrollLeft / scroller.clientWidth);
    if (next !== index) selectIndex(next);
  }

  function goTo(next: number) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTo({ left: next * scroller.clientWidth, behavior: "smooth" });
    selectIndex(next);
  }

  if (events.length === 0) return null;

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
        {events.map((event, i) => (
          <div
            key={event.id}
            className="relative h-full w-full shrink-0 snap-center overflow-hidden"
          >
            <EventSlideMedia
              event={event}
              shouldLoad={loadedIndices.has(i)}
              priority={i === 0}
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    event.cost.type === "free"
                      ? "bg-white/20 text-white"
                      : "bg-amber-400/90 text-amber-950",
                  )}
                >
                  {event.cost.type === "free" ? "Free" : event.cost.label}
                </span>
                <span className="text-[11px] text-white/70">
                  {event.venueName}
                </span>
              </div>
              <p className="text-sm font-medium text-white">{event.title}</p>
              <p className="mt-0.5 text-xs text-white/80">{event.dateLabel}</p>
              <p className="mt-1 text-xs text-white/70">{event.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <a
                  href={event.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-white underline underline-offset-2"
                >
                  Event source
                  <ExternalLinkIcon aria-hidden="true" className="size-3" />
                </a>
                {event.matchedSpotId && (
                  <a
                    href={`/explore?spot=${event.matchedSpotId}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-white underline underline-offset-2"
                  >
                    <MapPinIcon aria-hidden="true" className="size-3" />
                    View on map
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {events.length > 1 && (
        <div className="absolute inset-x-0 top-3 z-[1001] flex justify-center gap-1.5">
          {events.map((event, i) => (
            <button
              key={event.id}
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
