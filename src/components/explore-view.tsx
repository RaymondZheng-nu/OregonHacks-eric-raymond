"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronDownIcon, ClipboardListIcon } from "lucide-react";
import { AddSpotDialog } from "@/components/add-spot-dialog";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CATEGORY_META, SELECTABLE_CATEGORIES } from "@/lib/categories";
import { VIBE_OPTIONS } from "@/lib/vibes";
import type { Spot, SpotCategory } from "@/lib/types";
import type { MapMode } from "@/components/spot-map";

const SpotMap = dynamic(
  () => import("@/components/spot-map").then((m) => m.SpotMap),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-muted" /> }
);

// The quiz only ever sends `activity=` or `picnic=1`, never both, and both
// map to a single vibe option's `value` (see src/lib/vibes.ts) — so the two
// query params collapse into one piece of UI state instead of tracking them
// independently, matching how the quiz itself only ever has one vibe picked.
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
  focusSpotId,
}: {
  initialSpots: Spot[];
  pendingCount: number;
  initialActiveCategories?: SpotCategory[];
  initialActivity?: string;
  initialPicnic?: boolean;
  initialCenter?: [number, number];
  focusSpotId?: string;
}) {
  // Falls back to every selectable category when the questionnaire didn't
  // specify any (e.g. visiting /explore directly) — an empty initial Set
  // would otherwise read as "nothing selected" and show a blank map.
  const [activeCategories, setActiveCategories] = useState<Set<SpotCategory>>(
    new Set(initialActiveCategories?.length ? initialActiveCategories : SELECTABLE_CATEGORIES)
  );
  const [activeVibe, setActiveVibe] = useState<string | undefined>(
    vibeFromParams(initialActivity, initialPicnic)
  );
  const [visibleCount, setVisibleCount] = useState(initialSpots.length);
  const [mapMode, setMapMode] = useState<MapMode>("markers");
  const isHeatmapMode = mapMode === "heatmap";

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
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
                {/* Reuses the checkbox item visually, but single-select is
                    enforced by selectVibe clearing any other pick — this
                    codebase has no radio-item menu primitive, and the quiz's
                    own vibe question already single-selects the same way. */}
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
          {isHeatmapMode && (
            <p className="text-xs text-muted-foreground">Zoom in to filter</p>
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
          focusSpotId={focusSpotId}
          onViewChange={({ count, mode }) => {
            setVisibleCount(count);
            setMapMode(mode);
          }}
        />
        {visibleCount === 0 && (
          <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center">
            <div className="pointer-events-auto motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200 motion-safe:ease-out rounded-lg border bg-background/95 px-4 py-3 text-center shadow-sm backdrop-blur-xs">
              {isHeatmapMode ? (
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
