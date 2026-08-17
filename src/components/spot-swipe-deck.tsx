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
  TicketIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SavedModal } from "@/components/saved-modal";
import { SpotLocationPreview } from "@/components/spot-location-preview-dynamic";
import { SuggestTipDialog } from "@/components/suggest-tip-dialog";
import { getVerifiedTips } from "@/lib/supabase/queries.client";
import { CATEGORY_META } from "@/lib/categories";
import { directionsUrl, haversineDistanceMeters } from "@/lib/geo";
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
import type { FreeActivityTip, Spot } from "@/lib/types";

// A release past either the offset (px) or velocity (px/s) commits the swipe;
// two triggers so a fast short flick still registers.
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
  onResolved,
  isTop,
}: {
  spot: Spot;
  distanceMeters: number | null;
  filters: MatchFilters;
  onResolved: (direction: SwipeDirection) => void;
  isTop: boolean;
}) {
  const [showLocation, setShowLocation] = useState(false);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const skipOpacity = useTransform(x, [-120, -20], [1, 0]);
  const saveOpacity = useTransform(x, [20, 120], [0, 1]);
  // Photos hotlink to their source (Wikimedia etc.) with no fallback; a dead
  // link or rate-limit (seen with Wikimedia) rendered a blank box. Fall back to
  // the same location-preview map used for photo-less spots.
  const [imgFailed, setImgFailed] = useState(false);
  const [tips, setTips] = useState<FreeActivityTip[]>([]);

  useEffect(() => {
    let cancelled = false;
    getVerifiedTips(spot.id).then((result) => {
      if (!cancelled) setTips(result);
    });
    return () => {
      cancelled = true;
    };
  }, [spot.id]);

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

  return (
    <>
      <motion.div
        className="absolute inset-0"
        style={isTop ? { x, rotate } : undefined}
        drag={isTop ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.6}
        // Spring snap-back when a release doesn't cross the threshold; tuned for
        // a quick settle without visible overshoot.
        dragTransition={{ bounceStiffness: 400, bounceDamping: 24 }}
        onDragEnd={isTop ? handleDragEnd : undefined}
        exit={{
          x: x.get() > 0 ? 600 : x.get() < 0 ? -600 : 0,
          opacity: 0,
          transition: { type: "spring", stiffness: 200, damping: 24 },
        }}
      >
        <div
          // Without inert, buried cards' "View on map" buttons stay in tab order,
          // so keyboard users tab through obscured buttons before the real controls.
          inert={!isTop}
          className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10"
        >
          <div className="relative aspect-4/3 w-full shrink-0 overflow-hidden">
            {spot.photo_url && !imgFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={spot.photo_url}
                alt={spot.name}
                className="h-full w-full object-cover"
                draggable={false}
                onError={() => setImgFailed(true)}
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
              {tips.map((tip) => (
                <Badge key={tip.id} variant="outline">
                  <TicketIcon aria-hidden="true" />
                  {tip.tip}
                </Badge>
              ))}
            </div>

            {spot.description && (
              <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                {spot.description}
              </p>
            )}

            {spot.reddit_citation_url && (
              <a
                href={spot.reddit_citation_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                &ldquo;{spot.reddit_citation_snippet}&rdquo; — r/{spot.reddit_citation_subreddit}
              </a>
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

            <div className="mt-1 flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLocation(true)}
              >
                View on map
              </Button>
              <SuggestTipDialog spotId={spot.id} />
            </div>
          </div>
        </div>
      </motion.div>
      {/* Popup, not a Link to /explore: navigating away unmounts the deck's
          state, so browser-back lands on a fresh homepage instead of this deck. */}
      <Dialog open={showLocation} onOpenChange={setShowLocation}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{spot.name}</DialogTitle>
          </DialogHeader>
          <div className="h-56 w-full overflow-hidden rounded-lg">
            <SpotLocationPreview
              lat={spot.lat}
              lng={spot.lng}
              category={spot.category}
              draggable
            />
          </div>
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <a
                href={directionsUrl(spot.lat, spot.lng)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get directions
              </a>
            }
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

// How many cards render for the peek-behind stack; only the front one drags.
const VISIBLE_STACK_DEPTH = 3;

// Reveal in small batches ("Generate more") instead of dumping the whole pool.
const INITIAL_REVEAL = 5;
const REVEAL_STEP = 5;

function KeyHint({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground">
      {children}
    </kbd>
  );
}

// Full-width header bar. On mobile this collapses to the same three links,
// tightly packed; the keyboard hints and explicit "Exit" only make sense once
// there's a keyboard and room to show them, so those are md+ only.
function SwipeNavBar({
  savedCount,
  onSavedCountChange,
}: {
  savedCount: number;
  onSavedCountChange: () => void;
}) {
  const [showSaved, setShowSaved] = useState(false);

  return (
    <div className="flex w-full items-center justify-between border-b bg-background px-4 py-3 md:px-6">
      <div className="flex items-center gap-4">
        <Link
          href="/explore"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <MapIcon aria-hidden="true" className="size-4" />
          Map view
        </Link>
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
          <KeyHint>←</KeyHint> skip
          <KeyHint>→</KeyHint> save
          <KeyHint>Backspace</KeyHint> undo
        </span>
      </div>
      <Link
        href="/"
        className="font-logo text-sm tracking-tight text-green-700 hover:opacity-90"
      >
        TOUCH GRASS
      </Link>
      <div className="flex items-center gap-4">
        {/* Popup, not a Link to /saved — same deck-unmount reasoning as above. */}
        <button
          type="button"
          onClick={() => setShowSaved(true)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <BookmarkIcon aria-hidden="true" className="size-4" />
          Saved
          {savedCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {savedCount}
            </span>
          )}
        </button>
        {/* Mobile keeps the fixed corner X in swipe/page.tsx instead. */}
        <Link
          href="/"
          className="hidden items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground md:flex"
        >
          <XIcon aria-hidden="true" className="size-4" />
          Exit
        </Link>
      </div>
      <SavedModal
        open={showSaved}
        onClose={() => {
          setShowSaved(false);
          // The popup can delete saved spots itself, so re-read on close rather
          // than threading a change callback through SavedModal/SavedList.
          onSavedCountChange();
        }}
      />
    </div>
  );
}

// One entry per resolved card, powering undo. Session-scoped. savedNew only
// matters for "right" entries: false means saveSpot was a no-op (already
// saved), so undo must not removeSavedSpot. Can't happen today (already-saved
// spots never enter the deck), kept as a guard for future deck-fill paths.
type HistoryEntry = {
  spot: Spot;
  direction: SwipeDirection;
  savedNew: boolean;
};

export function SpotSwipeDeck({
  spots,
  userLocation,
  filters,
}: {
  spots: Spot[];
  userLocation?: { lat: number; lng: number };
  filters: MatchFilters;
}) {
  // Deck starts as the raw server `spots` to match SSR (no storage access
  // server-side). Skipped/saved filtering and batch slicing happen in the mount
  // effect, client-only — doing it in useMemo would shorten the first render
  // and cause a hydration mismatch against the server HTML.
  const [deck, setDeck] = useState<Spot[]>(spots);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  // Current batch size, not the full pool — "Generate more" resets it so the
  // progress bar reads "1 of 5" per batch, not "6 of 10".
  const [totalCount, setTotalCount] = useState(spots.length);
  const [hasMoreInPool, setHasMoreInPool] = useState(false);

  // Synchronously-current mirrors of deck/history. Two resolveTop/undo calls in
  // one tick (key repeat, fast double-click) would otherwise both read the same
  // stale closure and act on the same card twice; the refs let each call see the
  // previous one's effect.
  const deckRef = useRef(spots);
  const historyRef = useRef<HistoryEntry[]>([]);
  // Filtered spots not yet revealed; drained by generateMore(). Not state — it
  // never renders, only gates the button via hasMoreInPool.
  const poolRef = useRef<Spot[]>([]);

  useEffect(() => {
    // One-time hydration after mount. Excludes spots skipped this session and
    // saved in a past one: otherwise an old saved spot resurfaces, a right-swipe
    // is a silent no-op, and a later undo would delete it from the saved list.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only; re-running on `spots` would fight user-driven deck state after the first swipe.
  }, []);

  function refreshSavedCount() {
    setSavedCount(getSavedSpots().length);
  }

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

  // Reveals the next REVEAL_STEP spots. Only reachable from the empty-deck
  // state, so this always starts a fresh batch.
  function generateMore() {
    const next = poolRef.current.slice(0, REVEAL_STEP);
    poolRef.current = poolRef.current.slice(REVEAL_STEP);
    deckRef.current = next;
    setDeck(next);
    setTotalCount(next.length);
    setHasMoreInPool(poolRef.current.length > 0);
    // Reset history per batch: an undo across the "Generate more" boundary would
    // push an old card onto the new deck and let deck.length exceed totalCount.
    historyRef.current = [];
    setHistory([]);
  }

  // Desktop: arrows swipe, backspace undoes. Off when the deck is empty so it
  // doesn't eat keystrokes meant for surrounding chrome.
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
      <div className="flex h-full flex-col">
        <SwipeNavBar savedCount={savedCount} onSavedCountChange={refreshSavedCount} />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          {/* Empty history here means the pool started empty; any swipe appends. */}
          <p className="text-lg font-medium">
            {history.length === 0 ? "No spots match yet" : "That's every spot for now"}
          </p>
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
    <div className="flex h-full flex-col">
      <SwipeNavBar savedCount={savedCount} onSavedCountChange={refreshSavedCount} />

      <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-4">
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
    </div>
  );
}
