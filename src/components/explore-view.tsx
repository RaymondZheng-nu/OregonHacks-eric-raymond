"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronDownIcon, ClipboardListIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { AddSpotDialog } from "@/components/add-spot-dialog";
import { SpotSearchBox } from "@/components/spot-search-box";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CATEGORY_META, SELECTABLE_CATEGORIES } from "@/lib/categories";
import { VIBE_OPTIONS } from "@/lib/vibes";
import { cn } from "@/lib/utils";
import type { Spot, SpotCategory } from "@/lib/types";
import type { AdvancedFilters, MapMode } from "@/components/spot-map";

// Mirrors queries.ts's JUNK_AREA_FLOOR_M2, which the query layer clamps to —
// so the slider floor matches what the server enforces.
const MIN_PARK_AREA_FLOOR_M2 = 150;

// Closed enum from the dedup-cleanup pipeline, so hardcoded (unlike the dynamic
// amenities/grades below).
const SIZE_CLASSES = ["small", "medium", "large"] as const;

// Selectable categories that have zero live spots today (confirmed by count).
// Picking only these gives an empty map, which gets a designed "add the first
// one" invite. Revisit once either has real data.
const ZERO_SPOT_CATEGORIES: SpotCategory[] = ["abandoned", "hangout"];

function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Badge
      variant="outline"
      render={<button type="button" aria-pressed={active} onClick={onClick} />}
      className={cn(
        "h-8 cursor-pointer select-none px-3 capitalize transition-[opacity,background-color,color] duration-200 ease-out",
        !active && "opacity-40"
      )}
    >
      {children}
    </Badge>
  );
}

const SpotMap = dynamic(
  () => import("@/components/spot-map").then((m) => m.SpotMap),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-muted" /> }
);

// Quiz sends activity= or picnic=1, never both — collapse them into one vibe state.
function vibeFromParams(activity?: string, picnic?: boolean): string | undefined {
  if (picnic) return "picnic";
  return activity;
}

export function ExploreView({
  initialSpots,
  pendingCount,
  initialActiveCategories,
  initialActivity,
  initialPicnic,
  initialCenter,
  availableAmenities,
  availableClimbingGrades,
  focusSpotId,
}: {
  initialSpots: Spot[];
  pendingCount: number;
  initialActiveCategories?: SpotCategory[];
  initialActivity?: string;
  initialPicnic?: boolean;
  initialCenter?: [number, number];
  availableAmenities: string[];
  availableClimbingGrades: string[];
  focusSpotId?: string;
}) {
  // Default to all categories when the quiz specified none (direct /explore
  // visit) — an empty Set would read as "nothing selected" and blank the map.
  const [activeCategories, setActiveCategories] = useState<Set<SpotCategory>>(
    new Set(initialActiveCategories?.length ? initialActiveCategories : SELECTABLE_CATEGORIES)
  );
  const [activeVibe, setActiveVibe] = useState<string | undefined>(
    vibeFromParams(initialActivity, initialPicnic)
  );
  const [visibleCount, setVisibleCount] = useState(initialSpots.length);
  const [mapMode, setMapMode] = useState<MapMode>("markers");
  const [minParkAreaM2, setMinParkAreaM2] = useState(MIN_PARK_AREA_FLOOR_M2);
  const [sizeClasses, setSizeClasses] = useState<Set<string>>(new Set());
  const [amenities, setAmenities] = useState<Set<string>>(new Set());
  const [wheelchairAccessibleOnly, setWheelchairAccessibleOnly] = useState(false);
  const [climbingGrades, setClimbingGrades] = useState<Set<string>>(new Set());
  // Dismissible independently of mode: reset (not just hidden) once the user
  // leaves heatmap mode, so panning back out later shows the tip again
  // instead of it staying dismissed for the rest of the session.
  const [legendDismissed, setLegendDismissed] = useState(false);
  const isHeatmapMode = mapMode === "heatmap";
  // Reset during render, not an effect — the standard React pattern for
  // "adjust state when a prop/derived value changes" (avoids an extra
  // render-then-cascade round trip an effect would need for the same reset).
  const [prevIsHeatmapMode, setPrevIsHeatmapMode] = useState(isHeatmapMode);
  if (isHeatmapMode !== prevIsHeatmapMode) {
    setPrevIsHeatmapMode(isHeatmapMode);
    if (!isHeatmapMode) setLegendDismissed(false);
  }
  const isClimbingActive = activeCategories.has("climbing");
  // True only when every active category is known-empty; a mixed selection
  // still shows real spots and keeps the generic no-matches state.
  const isOnlyZeroSpotCategories =
    activeCategories.size > 0 &&
    Array.from(activeCategories).every((category) =>
      ZERO_SPOT_CATEGORIES.includes(category),
    );
  const zeroSpotCategoryLabel = Array.from(activeCategories)
    .map((category) => CATEGORY_META[category].label)
    .join(" or ");

  const advancedFilters: AdvancedFilters = useMemo(
    () => ({
      sizeClasses: sizeClasses.size > 0 ? Array.from(sizeClasses) : undefined,
      amenities: amenities.size > 0 ? Array.from(amenities) : undefined,
      wheelchairAccessibleOnly: wheelchairAccessibleOnly || undefined,
      // Gated on isClimbingActive: a grade filter with climbing off would force
      // climbing_grade to match non-climbing rows too (always null) → zero results.
      climbingGrades:
        isClimbingActive && climbingGrades.size > 0 ? Array.from(climbingGrades) : undefined,
    }),
    [sizeClasses, amenities, wheelchairAccessibleOnly, climbingGrades, isClimbingActive]
  );

  const selectedVibe = VIBE_OPTIONS.find((option) => option.value === activeVibe);
  const activeActivity = selectedVibe?.kind === "activity" ? selectedVibe.activity : undefined;
  const activePicnic = selectedVibe?.kind === "picnic";

  function toggleCategory(category: SpotCategory) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  function selectVibe(value: string) {
    setActiveVibe((prev) => (prev === value ? undefined : value));
  }

  return (
    <div className="flex h-screen w-full flex-col">
      <header className="flex flex-col gap-3 border-b bg-background px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg leading-tight">
            <Link
              href="/"
              className="font-logo tracking-tight text-green-700 hover:opacity-90"
            >
              TOUCH GRASS
            </Link>
          </h1>
          <p className="text-sm text-muted-foreground">
            {visibleCount} green spaces & nature spots in this view
          </p>
          {/* Cluster-color legend, matching markercluster's default size tiers.
              Marker-mode only — heatmap colors mean density, not cluster size. */}
          {!isHeatmapMode && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: "rgb(110, 204, 57)" }}
                />
                &lt;10 spots
              </span>
              <span className="flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: "rgb(240, 194, 12)" }}
                />
                10-99
              </span>
              <span className="flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: "rgb(241, 128, 23)" }}
                />
                100+
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SpotSearchBox />
          <div className="flex flex-col gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Filter by category"
                disabled={isHeatmapMode}
                render={<Button variant="outline" disabled={isHeatmapMode} />}
              >
                Categories ({activeCategories.size}/{SELECTABLE_CATEGORIES.length})
                <ChevronDownIcon
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {SELECTABLE_CATEGORIES.map((category) => {
                  const meta = CATEGORY_META[category];
                  return (
                    <DropdownMenuCheckboxItem
                      key={category}
                      checked={activeCategories.has(category)}
                      onCheckedChange={() => toggleCategory(category)}
                    >
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: meta.color }}
                      />
                      {meta.label}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-col gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Filter by vibe"
                disabled={isHeatmapMode}
                render={<Button variant="outline" disabled={isHeatmapMode} />}
              >
                Vibe: {selectedVibe?.label ?? "Everything"}
                <ChevronDownIcon
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {/* Checkbox item visually, but selectVibe enforces single-select
                    (no radio-item primitive in this codebase). */}
                {VIBE_OPTIONS.map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option.value}
                    checked={activeVibe === option.value}
                    onCheckedChange={() => selectVibe(option.value)}
                  >
                    {option.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Dialog>
            <DialogTrigger
              disabled={isHeatmapMode}
              render={
                <Button variant="outline" disabled={isHeatmapMode}>
                  <SlidersHorizontalIcon aria-hidden="true" />
                  Advanced
                </Button>
              }
            />
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Advanced settings</DialogTitle>
              </DialogHeader>
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="min-park-area">Minimum park size (m²)</Label>
                  <Input
                    id="min-park-area"
                    type="number"
                    min={MIN_PARK_AREA_FLOOR_M2}
                    step={50}
                    value={minParkAreaM2}
                    onChange={(e) => {
                      const parsed = Number(e.target.value);
                      setMinParkAreaM2(
                        Number.isFinite(parsed)
                          ? Math.max(parsed, MIN_PARK_AREA_FLOOR_M2)
                          : MIN_PARK_AREA_FLOOR_M2
                      );
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Filters out traffic islands and other junk-sized
                    &ldquo;park&rdquo; spots. Only applies to the park and other categories.
                    Climbing, gardens, and the rest are unaffected.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Size</Label>
                  <div className="flex flex-wrap gap-2">
                    {SIZE_CLASSES.map((size) => (
                      <FilterChip
                        key={size}
                        active={sizeClasses.has(size)}
                        onClick={() => setSizeClasses((prev) => toggleInSet(prev, size))}
                      >
                        {size}
                      </FilterChip>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Only spots with a known size are affected. Leave all
                    unselected to include everything regardless of size.
                  </p>
                </div>

                {availableAmenities.length > 0 && (
                  <div className="space-y-2">
                    <Label>Amenities</Label>
                    <div className="flex flex-wrap gap-2">
                      {availableAmenities.map((amenity) => (
                        <FilterChip
                          key={amenity}
                          active={amenities.has(amenity)}
                          onClick={() => setAmenities((prev) => toggleInSet(prev, amenity))}
                        >
                          {amenity.replace(/_/g, " ")}
                        </FilterChip>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Accessibility</Label>
                  {/* FilterChip, not a native checkbox, to match sibling filters. */}
                  <FilterChip
                    active={wheelchairAccessibleOnly}
                    onClick={() =>
                      setWheelchairAccessibleOnly((prev) => !prev)
                    }
                  >
                    Wheelchair accessible only
                  </FilterChip>
                </div>

                {isClimbingActive && availableClimbingGrades.length > 0 && (
                  <div className="space-y-2">
                    <Label>Climbing grade</Label>
                    <div className="flex flex-wrap gap-2">
                      {availableClimbingGrades.map((grade) => (
                        <FilterChip
                          key={grade}
                          active={climbingGrades.has(grade)}
                          onClick={() => setClimbingGrades((prev) => toggleInSet(prev, grade))}
                        >
                          {grade}
                        </FilterChip>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Grades are shown exactly as tagged in OpenStreetMap.
                      French and YDS scales aren&apos;t converted between each other.
                    </p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
          {isHeatmapMode && (
            <p className="text-xs text-muted-foreground">
              Showing green space coverage. Zoom in for spots and filters
            </p>
          )}
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link href="/pending">
                <ClipboardListIcon aria-hidden="true" />
                Review submissions{pendingCount > 0 ? ` (${pendingCount})` : ""}
              </Link>
            }
          />
          <AddSpotDialog />
          <ThemeToggle />
        </div>
      </header>
      <main className="relative flex-1">
        <SpotMap
          initialSpots={initialSpots}
          categories={activeCategories}
          activity={activeActivity}
          picnic={activePicnic}
          initialCenter={initialCenter}
          minParkAreaM2={minParkAreaM2}
          advancedFilters={advancedFilters}
          focusSpotId={focusSpotId}
          onViewChange={({ count, mode }) => {
            setVisibleCount(count);
            setMapMode(mode);
          }}
        />
        {isHeatmapMode && !legendDismissed && (
          <div className="pointer-events-none absolute top-3 left-1/2 z-[1000] w-[min(380px,calc(100%-1.5rem))] -translate-x-1/2">
            <div className="pointer-events-auto motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 motion-safe:ease-out relative rounded-lg border bg-background/95 px-4 py-3 shadow-sm backdrop-blur-xs">
              <button
                type="button"
                onClick={() => setLegendDismissed(true)}
                className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <XIcon aria-hidden="true" className="size-3.5" />
                <span className="sr-only">Dismiss</span>
              </button>
              <p className="pr-5 text-sm font-medium">Green space coverage</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Darker areas have more known parks and nature spots nearby.
                Lighter areas may mean less green space, or just that we
                haven&apos;t mapped that area yet.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">
                  Fewer
                </span>
                <div
                  className="h-2 flex-1 rounded-full"
                  style={{
                    background:
                      "linear-gradient(to right, #bbf7d0, #4ade80, #16a34a, #14532d)",
                  }}
                  aria-hidden="true"
                />
                <span className="text-[10px] text-muted-foreground">
                  More
                </span>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Full readings shown for the outlined regions (Portland, NYC).
                Density elsewhere reflects unverified, uncleaned data.
              </p>
            </div>
          </div>
        )}
        {visibleCount === 0 && (
          <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center">
            <div className="pointer-events-auto motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200 motion-safe:ease-out rounded-lg border bg-background/95 px-4 py-3 text-center shadow-sm backdrop-blur-xs">
              {isOnlyZeroSpotCategories ? (
                <>
                  <p className="text-sm font-medium">
                    No {zeroSpotCategoryLabel} spots yet
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Nobody&apos;s added one here yet. Know a spot like this?
                  </p>
                  <div className="mt-3 flex justify-center">
                    <AddSpotDialog triggerSize="sm" />
                  </div>
                </>
              ) : isHeatmapMode ? (
                <>
                  <p className="text-sm font-medium">No spots in this area yet</p>
                  <p className="text-xs text-muted-foreground">
                    Try panning to a different region.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">No spots match these filters</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedVibe
                      ? "Try setting Vibe back to Everything, or turn a category back on."
                      : "Turn a category back on above to see it on the map."}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
