"use client";

import { useMemo, useState } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "motion/react";
import { HeartIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORY_META } from "@/lib/categories";
import { haversineDistanceMeters } from "@/lib/geo";
import { saveSpot, skipSpot, getSkippedSpotIds } from "@/lib/saved-spots";
import type { Spot } from "@/lib/types";

const METERS_PER_MILE = 1609.34;
// Past this offset (px) or this velocity (px/s), a drag release commits to
// a swipe instead of snapping back — two independent triggers so a fast
// flick past a lower distance still registers, same idea as native swipe
// gesture thresholds.
const SWIPE_DISTANCE_THRESHOLD = 120;
const SWIPE_VELOCITY_THRESHOLD = 500;

function formatDistance(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.1) return "nearby";
  return `${miles.toFixed(1)} mi away`;
}

type SwipeDirection = "left" | "right";

function SwipeCard({
  spot,
  distanceMeters,
  onResolved,
  isTop,
}: {
  spot: Spot;
  distanceMeters: number | null;
  onResolved: (direction: SwipeDirection) => void;
  isTop: boolean;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const skipOpacity = useTransform(x, [-120, -20], [1, 0]);
  const saveOpacity = useTransform(x, [20, 120], [0, 1]);

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (
      info.offset.x < -SWIPE_DISTANCE_THRESHOLD ||
      info.velocity.x < -SWIPE_VELOCITY_THRESHOLD
    ) {
      onResolved("left");
    } else if (
      info.offset.x > SWIPE_DISTANCE_THRESHOLD ||
      info.velocity.x > SWIPE_VELOCITY_THRESHOLD
    ) {
      onResolved("right");
    }
  }

  return (
    <motion.div
      className="absolute inset-0"
      style={isTop ? { x, rotate } : undefined}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.6}
      // Spring, not a flat power curve, for the snap-back-to-center when a
      // drag release doesn't cross the swipe threshold — matches the feel
      // motion-primitives' carousel uses for its own drag release (damping/
      // stiffness tuned for a quick settle without visible overshoot-bounce).
      dragTransition={{ bounceStiffness: 400, bounceDamping: 24 }}
      onDragEnd={isTop ? handleDragEnd : undefined}
      exit={{
        x: x.get() > 0 ? 600 : x.get() < 0 ? -600 : 0,
        opacity: 0,
        transition: { type: "spring", stiffness: 200, damping: 24 },
      }}
    >
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
        <div className="relative aspect-4/3 w-full shrink-0 overflow-hidden">
          {spot.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={spot.photo_url}
              alt={spot.name}
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div
              className="h-full w-full"
              style={{ backgroundColor: `${CATEGORY_META[spot.category].color}26` }}
              aria-hidden="true"
            />
          )}
          {isTop && (
            <>
              <motion.div
                style={{ opacity: skipOpacity }}
                className="absolute top-4 left-4 rounded-lg border-2 border-destructive px-2.5 py-1 text-sm font-semibold text-destructive"
              >
                SKIP
              </motion.div>
              <motion.div
                style={{ opacity: saveOpacity }}
                className="absolute top-4 right-4 rounded-lg border-2 border-primary px-2.5 py-1 text-sm font-semibold text-primary"
              >
                SAVE
              </motion.div>
            </>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-4">
          <p className="font-semibold leading-tight">{spot.name}</p>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span>{CATEGORY_META[spot.category].label}</span>
            {distanceMeters !== null && (
              <>
                <span>·</span>
                <span>{formatDistance(distanceMeters)}</span>
              </>
            )}
          </div>
          {spot.description && (
            <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
              {spot.description}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Card count kept visible in the stack for the peek-behind effect — deeper
// cards are inert (isTop=false disables drag) so only the front card ever
// responds to a gesture.
const VISIBLE_STACK_DEPTH = 3;

export function SpotSwipeDeck({
  spots,
  userLocation,
}: {
  spots: Spot[];
  userLocation?: { lat: number; lng: number };
}) {
  // Skipped-this-session spots are excluded on mount, not re-checked live —
  // a spot skipped in an earlier /swipe visit this session shouldn't
  // reappear if the user navigates back to the deck.
  const initialDeck = useMemo(() => {
    const skipped = getSkippedSpotIds();
    return spots.filter((spot) => !skipped.has(spot.id));
  }, [spots]);

  const [deck, setDeck] = useState<Spot[]>(initialDeck);

  function resolveTop(direction: SwipeDirection) {
    const [top, ...rest] = deck;
    if (!top) return;

    if (direction === "right") saveSpot(top);
    else skipSpot(top.id);

    setDeck(rest);
  }

  if (deck.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-lg font-medium">That&apos;s every spot for now</p>
        <p className="text-sm text-muted-foreground">
          Check your saved spots, or come back later for more.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-4">
      <div className="relative aspect-3/4 w-full max-w-sm">
        <AnimatePresence>
          {deck.slice(0, VISIBLE_STACK_DEPTH).map((spot, i) => (
            <motion.div
              key={spot.id}
              className="absolute inset-0"
              style={{ zIndex: VISIBLE_STACK_DEPTH - i }}
              initial={false}
              animate={{
                scale: 1 - i * 0.04,
                y: i * 10,
                opacity: 1,
              }}
            >
              <SwipeCard
                spot={spot}
                distanceMeters={
                  userLocation
                    ? haversineDistanceMeters(userLocation.lat, userLocation.lng, spot.lat, spot.lng)
                    : null
                }
                onResolved={resolveTop}
                isTop={i === 0}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon-lg"
          aria-label="Skip this spot"
          onClick={() => resolveTop("left")}
          className="rounded-full border-destructive/40 text-destructive hover:bg-destructive/10"
        >
          <XIcon aria-hidden="true" className="size-5" />
        </Button>
        <Button
          variant="outline"
          size="icon-lg"
          aria-label="Save this spot"
          onClick={() => resolveTop("right")}
          className="rounded-full border-primary/40 text-primary hover:bg-primary/10"
        >
          <HeartIcon aria-hidden="true" className="size-5" />
        </Button>
      </div>
    </div>
  );
}
