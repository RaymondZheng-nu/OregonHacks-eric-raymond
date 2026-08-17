"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "motion/react";
import {
  HeartIcon,
  XIcon,
  Undo2Icon,
  MapIcon,
  BookmarkIcon,
  MountainIcon,
  AccessibilityIcon,
  RulerIcon,
  DumbbellIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpotLocationPreview } from "@/components/spot-location-preview-dynamic";
import { CATEGORY_META } from "@/lib/categories";
import { haversineDistanceMeters } from "@/lib/geo";
import { getSpotVerdict } from "@/lib/spot-verdict";
import {
  formatDistance,
  getMatchReasonChip,
  type MatchFilters,
} from "@/lib/spot-reasoning";
import { cn } from "@/lib/utils";
import {
  saveSpot,
  skipSpot,
  unskipSpot,
  removeSavedSpot,
  getSkippedSpotIds,
  getSavedSpots,
} from "@/lib/saved-spots";
import type { Spot } from "@/lib/types";

// Past this offset (px) or this velocity (px/s), a drag release commits to
// a swipe instead of snapping back — two independent triggers so a fast
// flick past a lower distance still registers, same idea as native swipe
// gesture thresholds.
const SWIPE_DISTANCE_THRESHOLD = 120;
const SWIPE_VELOCITY_THRESHOLD = 500;

function formatAmenity(amenity: string): string {
  if (amenity === "indoor_gym") return "Indoor gym";
  return amenity.replace(/_/g, " ");
}

type SwipeDirection = "left" | "right";

function SwipeCard({
  spot,
  distanceMeters,
  filters,
  exploreParams,
  onResolved,
  isTop,
}: {
  spot: Spot;
  distanceMeters: number | null;
  filters: MatchFilters;
  exploreParams: string;
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

  const verdict = getSpotVerdict(spot);
  const reasonChip = getMatchReasonChip(spot, filters);
  const distanceLabel = formatDistance(distanceMeters);

  const viewParams = new URLSearchParams(exploreParams);
  viewParams.set("spot", spot.id);
  viewParams.set("lat", String(spot.lat));
  viewParams.set("lng", String(spot.lng));

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
            <SpotLocationPreview
              lat={spot.lat}
              lng={spot.lng}
              category={spot.category}
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
        <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-4">
          <p className="text-lg font-semibold leading-tight text-balance">
            {spot.name}
          </p>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span>{CATEGORY_META[spot.category].label}</span>
            {distanceLabel && (
              <>
                <span>·</span>
                <span>{distanceLabel}</span>
              </>
            )}
          </div>

          <div className="mt-0.5 flex flex-wrap gap-1.5">
            {reasonChip && <Badge variant="outline">{reasonChip}</Badge>}
            {spot.climbing_grade && (
              <Badge variant="outline">
                <MountainIcon aria-hidden="true" />
                {spot.climbing_grade}
              </Badge>
            )}
            {spot.size_class && (
              <Badge variant="outline">
                <RulerIcon aria-hidden="true" />
                {spot.size_class}
              </Badge>
            )}
            {spot.accessibility === "yes" && (
              <Badge variant="outline">
                <AccessibilityIcon aria-hidden="true" />
                Wheelchair accessible
              </Badge>
            )}
            {spot.accessibility === "limited" && (
              <Badge variant="outline">
                <AccessibilityIcon aria-hidden="true" />
                Limited accessibility
              </Badge>
            )}
            {spot.amenities?.map((amenity) => (
              <Badge key={amenity} variant="outline">
                {amenity === "indoor_gym" && (
                  <DumbbellIcon aria-hidden="true" />
                )}
                {formatAmenity(amenity)}
              </Badge>
            ))}
          </div>

          {spot.description && (
            <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
              {spot.description}
            </p>
          )}

          <p
            className={cn(
              "text-xs",
              verdict.tone === "caution"
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {verdict.label}
          </p>

          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            className="mt-1 self-start"
            render={
              <Link href={`/explore?${viewParams.toString()}`}>
                View on map
              </Link>
            }
          />
        </div>
      </div>
    </motion.div>
  );
}

// Card count kept visible in the stack for the peek-behind effect — deeper
// cards are inert (isTop=false disables drag) so only the front card ever
// responds to a gesture.
const VISIBLE_STACK_DEPTH = 3;

// Reveal in small batches instead of dropping the whole server-fetched pool
// into the deck at once — matches /results' old cadence ("Generate more"
// instead of "here are all 40 at once").
const INITIAL_REVEAL = 5;
const REVEAL_STEP = 5;

function SwipeNavBar({ savedCount }: { savedCount: number }) {
  return (
    <div className="flex w-full max-w-sm items-center justify-between px-1 pt-2">
      <Link
        href="/explore"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <MapIcon aria-hidden="true" className="size-4" />
        Map view
      </Link>
      <span className="font-logo text-sm tracking-tight text-green-700">
        TOUCH GRASS
      </span>
      <Link
        href="/saved"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <BookmarkIcon aria-hidden="true" className="size-4" />
        Saved
        {savedCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
            {savedCount}
          </span>
        )}
      </Link>
    </div>
  );
}

// One entry per resolved card, oldest first — powers the undo button by
// reversing whichever of saveSpot/skipSpot was just called and restoring the
// spot to the front of the deck. Session-scoped only, same as the deck
// itself (a fresh page load starts clean). `savedNew` is only meaningful for
// "right" entries — false means saveSpot was a no-op (already saved from
// somewhere else), so undo must not call removeSavedSpot for it. In normal
// operation this can't happen (already-saved spots never enter the deck —
// see initialDeck below), kept as defense in depth against future code paths
// that add cards to the deck some other way.
type HistoryEntry = {
  spot: Spot;
  direction: SwipeDirection;
  savedNew: boolean;
};

export function SpotSwipeDeck({
  spots,
  userLocation,
  filters,
  exploreParams,
}: {
  spots: Spot[];
  userLocation?: { lat: number; lng: number };
  filters: MatchFilters;
  exploreParams: string;
}) {
  // Deck starts as the raw server-provided `spots` — matching the server
  // render exactly (SSR has no localStorage/sessionStorage access, so it
  // can't know what's already skipped/saved). Filtering by skipped/saved ids
  // *and* slicing down to the first revealed batch happens in the mount
  // effect below, client-only, after hydration — doing either via useMemo
  // would run during the client's first render pass too, produce a shorter
  // array than the server-rendered HTML, and trigger a React hydration
  // mismatch the moment any prior-session skip/save history overlaps the
  // new deck.
  const [deck, setDeck] = useState<Spot[]>(spots);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  // Revealed-so-far count, not the full server pool size — grows by
  // REVEAL_STEP each time "Generate more" is clicked, so the progress bar
  // reads sensibly ("2 of 5", then "2 of 10") instead of jumping straight to
  // the full pool size on the very first card.
  const [totalCount, setTotalCount] = useState(spots.length);
  const [hasMoreInPool, setHasMoreInPool] = useState(false);

  // Mirrors of `deck`/`history` that are always synchronously current —
  // unlike the state values, which only reflect the latest call once React
  // commits a render. Two resolveTop/undo calls fired in the same tick (key
  // repeat, a fast double-click before React re-renders) would otherwise
  // both read the same stale `deck`/`history` closure and act on the same
  // top card twice, corrupting history with duplicate entries that later
  // duplicate a card back into the deck on undo. Reading/writing the ref
  // synchronously inside each handler makes repeated same-tick calls each
  // see the effect of the one before it.
  const deckRef = useRef(spots);
  const historyRef = useRef<HistoryEntry[]>([]);
  // Filtered spots not yet revealed into the deck — populated once on
  // mount, drained by generateMore(). Doesn't need to be state: it never
  // renders directly, only gates the "Generate more" button via
  // hasMoreInPool.
  const poolRef = useRef<Spot[]>([]);

  useEffect(() => {
    // One-time hydration from localStorage/sessionStorage after mount — same
    // convention as saved/page.tsx's read, not an ongoing subscription to
    // set up. Excludes spots skipped earlier this session (sessionStorage)
    // and spots already saved in a past session (localStorage): without
    // this, a spot saved days ago can resurface in a fresh deck, a
    // right-swipe on it is a silent no-op (saveSpot dedupes by id), and a
    // later undo would still unconditionally remove it from the saved list
    // — deleting a real, previously-saved spot the user never asked to remove.
    const skipped = getSkippedSpotIds();
    const saved = getSavedSpots();
    const savedIds = new Set(saved.map((s) => s.id));
    const filtered = spots.filter(
      (spot) => !skipped.has(spot.id) && !savedIds.has(spot.id),
    );

    const revealed = filtered.slice(0, INITIAL_REVEAL);
    poolRef.current = filtered.slice(INITIAL_REVEAL);

    deckRef.current = revealed;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeck(revealed);
    setTotalCount(revealed.length);
    setSavedCount(saved.length);
    setHasMoreInPool(poolRef.current.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount to apply client-only storage filtering; re-running on `spots` identity would fight user-driven deck state after the first swipe.
  }, []);

  function resolveTop(direction: SwipeDirection) {
    const [top, ...rest] = deckRef.current;
    if (!top) return;

    let savedNew = false;
    if (direction === "right") {
      savedNew = saveSpot(top);
      if (savedNew) setSavedCount((c) => c + 1);
    } else {
      skipSpot(top.id);
    }

    historyRef.current = [
      ...historyRef.current,
      { spot: top, direction, savedNew },
    ];
    setHistory(historyRef.current);
    deckRef.current = rest;
    setDeck(rest);
  }

  function undo() {
    const currentHistory = historyRef.current;
    if (currentHistory.length === 0) return;
    const last = currentHistory[currentHistory.length - 1];

    if (last.direction === "right") {
      if (last.savedNew) {
        removeSavedSpot(last.spot.id);
        setSavedCount((c) => Math.max(0, c - 1));
      }
    } else {
      unskipSpot(last.spot.id);
    }

    deckRef.current = [last.spot, ...deckRef.current];
    setDeck(deckRef.current);
    historyRef.current = currentHistory.slice(0, -1);
    setHistory(historyRef.current);
  }

  // Pulls the next REVEAL_STEP spots out of the not-yet-revealed pool and
  // into the deck — only reachable from the empty-deck state, so deckRef is
  // always [] here, but appending (not replacing) keeps this safe even if
  // that ever changes.
  function generateMore() {
    const next = poolRef.current.slice(0, REVEAL_STEP);
    poolRef.current = poolRef.current.slice(REVEAL_STEP);
    deckRef.current = [...deckRef.current, ...next];
    setDeck(deckRef.current);
    setTotalCount((c) => c + next.length);
    setHasMoreInPool(poolRef.current.length > 0);
  }

  // Desktop/demo affordance — left/right arrows swipe, backspace undoes.
  // Ignored while the deck is empty so an empty-state doesn't eat keystrokes
  // headed for surrounding page chrome.
  useEffect(() => {
    if (deck.length === 0) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") resolveTop("left");
      else if (e.key === "ArrowRight") resolveTop("right");
      else if (e.key === "Backspace") undo();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deck]);

  if (deck.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <SwipeNavBar savedCount={savedCount} />
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <p className="text-lg font-medium">That&apos;s every spot for now</p>
          <p className="text-sm text-muted-foreground">
            Check your saved spots, or browse the full map instead.
          </p>
          <div className="mt-2 flex items-center gap-3">
            {hasMoreInPool && (
              <Button variant="outline" onClick={generateMore}>
                Generate more
              </Button>
            )}
            {history.length > 0 && (
              <Button variant="outline" onClick={undo}>
                <Undo2Icon aria-hidden="true" />
                Undo last
              </Button>
            )}
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/explore">Browse the map</Link>}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
      <SwipeNavBar savedCount={savedCount} />

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
                    ? haversineDistanceMeters(
                        userLocation.lat,
                        userLocation.lng,
                        spot.lat,
                        spot.lng,
                      )
                    : null
                }
                filters={filters}
                exploreParams={exploreParams}
                onResolved={resolveTop}
                isTop={i === 0}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="flex w-full max-w-[200px] flex-col items-center gap-1.5">
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{
              width: `${((totalCount - deck.length) / totalCount) * 100}%`,
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {totalCount - deck.length + 1} of {totalCount}
        </p>
      </div>

      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          aria-label="Undo last swipe"
          disabled={history.length === 0}
          onClick={undo}
          className="size-11 rounded-full"
        >
          <Undo2Icon aria-hidden="true" className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon-lg"
          aria-label="Skip this spot"
          onClick={() => resolveTop("left")}
          className="size-16 rounded-full border-destructive/30 text-destructive hover:bg-destructive/10"
        >
          <XIcon aria-hidden="true" className="size-6" />
        </Button>
        <Button
          size="icon-lg"
          aria-label="Save this spot"
          onClick={() => resolveTop("right")}
          className="size-16 rounded-full"
        >
          <HeartIcon aria-hidden="true" className="size-6" />
        </Button>
        <div className="size-11" aria-hidden="true" />
      </div>
    </div>
  );
}
