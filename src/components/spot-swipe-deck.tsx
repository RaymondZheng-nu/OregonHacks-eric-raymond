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
  Share2Icon,
  ChevronUpIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function useSpotTips(spotId: string | undefined): FreeActivityTip[] {
  const [tips, setTips] = useState<FreeActivityTip[]>([]);
  useEffect(() => {
    if (!spotId) return;
    let cancelled = false;
    getVerifiedTips(spotId).then((result) => {
      if (!cancelled) setTips(result);
    });
    return () => {
      cancelled = true;
    };
  }, [spotId]);
  return tips;
}

// Extra detail that doesn't fit the compact swipe card — full description,
// and the full tip list with source links (the card only shows tip text as a
// badge). Desktop has the room to show this beside the card at all times;
// mobile gets it as a drag-up sheet instead (see MobileDetailSheet). "View on
// map" (from the card) swaps this same panel into map mode rather than
// opening a separate popup — one surface, not two.
function SpotDetailPanel({
  spot,
  tips,
  mode,
  onBack,
}: {
  spot: Spot;
  tips: FreeActivityTip[];
  mode: "info" | "map";
  onBack: () => void;
}) {
  const verdict = getSpotVerdict(spot);

  if (mode === "map") {
    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold leading-tight text-balance">
            {spot.name}
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Back to spot details"
            onClick={onBack}
            className="shrink-0"
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
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
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold leading-tight text-balance">
          {spot.name}
        </h2>
        <p className="text-sm text-muted-foreground">
          {CATEGORY_META[spot.category].label}
        </p>
      </div>
      {spot.description && (
        <p className="text-sm text-muted-foreground">{spot.description}</p>
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
      {spot.reddit_citation_url && (
        <a
          href={spot.reddit_citation_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          &ldquo;{spot.reddit_citation_snippet}&rdquo; — r/{spot.reddit_citation_subreddit}
        </a>
      )}
      <div className="space-y-2 border-t pt-3">
        <p className="text-xs font-medium">Free things to do here</p>
        {tips.length > 0 ? (
          <ul className="space-y-2">
            {tips.map((tip) => (
              <li key={tip.id} className="flex gap-2 text-sm text-muted-foreground">
                <TicketIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {tip.tip}
                  {tip.source_url && (
                    <>
                      {" "}
                      <a
                        href={tip.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 hover:text-foreground"
                      >
                        source
                      </a>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nobody&apos;s added one yet.
          </p>
        )}
        <SuggestTipDialog spotId={spot.id} />
      </div>
    </div>
  );
}

// Fixed height so the drag range is a known pixel constant — dvh-based sizing
// would need to compute constraints off the rendered element instead.
const SHEET_HEIGHT_PX = 420;
const SHEET_PEEK_PX = 64;
const SHEET_DRAG_THRESHOLD = 60;

function MobileDetailSheet({
  spot,
  tips,
  mode,
  onBack,
  expanded,
  onExpandedChange,
}: {
  spot: Spot;
  tips: FreeActivityTip[];
  mode: "info" | "map";
  onBack: () => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const collapsedY = SHEET_HEIGHT_PX - SHEET_PEEK_PX;

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y < -SHEET_DRAG_THRESHOLD || info.velocity.y < -400) {
      onExpandedChange(true);
    } else if (info.offset.y > SHEET_DRAG_THRESHOLD || info.velocity.y > 400) {
      onExpandedChange(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-x-0 bottom-0 z-[1100] flex flex-col rounded-t-2xl border-t bg-background shadow-lg md:hidden"
      style={{ height: SHEET_HEIGHT_PX }}
      drag="y"
      dragConstraints={{ top: 0, bottom: collapsedY }}
      dragElastic={0.1}
      animate={{ y: expanded ? 0 : collapsedY }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      onDragEnd={handleDragEnd}
    >
      <button
        type="button"
        onClick={() => onExpandedChange(!expanded)}
        className="flex shrink-0 flex-col items-center gap-1.5 py-2.5"
        aria-expanded={expanded}
      >
        <span
          aria-hidden="true"
          className="h-1 w-10 rounded-full bg-muted-foreground/30"
        />
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <ChevronUpIcon
            aria-hidden="true"
            className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
          />
          More about this spot
        </span>
      </button>
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <SpotDetailPanel spot={spot} tips={tips} mode={mode} onBack={onBack} />
      </div>
    </motion.div>
  );
}

type SwipeDirection = "left" | "right";

function SwipeCard({
  spot,
  distanceMeters,
  filters,
  onResolved,
  onViewOnMap,
  isTop,
}: {
  spot: Spot;
  distanceMeters: number | null;
  filters: MatchFilters;
  onResolved: (direction: SwipeDirection) => void;
  onViewOnMap: () => void;
  isTop: boolean;
}) {
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
          <div className="flex flex-1 flex-col overflow-hidden p-4">
            {/* Scrollable middle, pinned action row below — badges/tips can run
                long enough to push a scrolling action row half offscreen, which
                read as the card being clipped. */}
            <div className="flex-1 space-y-1.5 overflow-y-auto">
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
                  className="block text-xs text-muted-foreground underline-offset-2 hover:underline"
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
            </div>

            <div className="mt-2 flex shrink-0 items-center gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={onViewOnMap}>
                View on map
              </Button>
              <Link
                href={`/spot/${spot.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Share2Icon aria-hidden="true" className="size-3.5" />
                Share
              </Link>
              <SuggestTipDialog spotId={spot.id} />
            </div>
          </div>
        </div>
      </motion.div>
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

// Full-width header bar. The exit control lives outside this bar entirely —
// a small corner icon button matching the quiz dialog's close button, in
// swipe/page.tsx — so it stays identical across breakpoints instead of a text
// link on desktop and a separate icon on mobile.
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
          General map view
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
  // "View on map" (from the card) swaps the panel/sheet into map mode instead
  // of opening a separate popup. Declared here (not lower, near topSpot) so
  // resolveTop/undo/generateMore below can reference the setters without a
  // temporal-dead-zone issue — they're plain functions, not hooks, so nothing
  // else requires this ordering, but the setters must exist before them.
  const [detailMode, setDetailMode] = useState<"info" | "map">("info");
  const [mobileSheetExpanded, setMobileSheetExpanded] = useState(false);

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

    setDetailMode("info");
    setMobileSheetExpanded(false);

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

    setDetailMode("info");
    setMobileSheetExpanded(false);

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
    setDetailMode("info");
    setMobileSheetExpanded(false);
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

  // Drives the desktop side panel + mobile bottom sheet. Declared above the
  // early return below so hook order stays stable regardless of deck.length.
  const topSpot = deck[0];
  const topSpotTips = useSpotTips(topSpot?.id);

  function handleViewOnMap() {
    setDetailMode("map");
    setMobileSheetExpanded(true);
  }

  function handleBackToInfo() {
    setDetailMode("info");
  }

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

      {/* pb-16 leaves room for MobileDetailSheet's peeked handle below md. */}
      <div className="flex flex-1 items-center justify-center gap-8 overflow-y-auto p-4 pb-16 md:pb-4">
        <div className="flex flex-col items-center gap-4">
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
                    onViewOnMap={handleViewOnMap}
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

        {/* Desktop only: mobile gets the same content via MobileDetailSheet
            below, dragged/tapped open instead of always-visible — there's no
            room for a permanent side panel at phone widths. */}
        {topSpot && (
          <div className="hidden max-h-[min(80vh,640px)] w-80 shrink-0 self-center overflow-y-auto rounded-2xl border bg-card p-5 md:block">
            <SpotDetailPanel
              spot={topSpot}
              tips={topSpotTips}
              mode={detailMode}
              onBack={handleBackToInfo}
            />
          </div>
        )}
      </div>

      {topSpot && (
        <MobileDetailSheet
          spot={topSpot}
          tips={topSpotTips}
          mode={detailMode}
          onBack={handleBackToInfo}
          expanded={mobileSheetExpanded}
          onExpandedChange={setMobileSheetExpanded}
        />
      )}
    </div>
  );
}
