"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ClipboardListIcon } from "lucide-react";
import { AddSpotDialog } from "@/components/add-spot-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CATEGORY_META } from "@/lib/categories";
import type { Spot, SpotCategory } from "@/lib/types";
import type { MapMode } from "@/components/spot-map";
import { cn } from "@/lib/utils";

const SpotMap = dynamic(
  () => import("@/components/spot-map").then((m) => m.SpotMap),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-muted" /> }
);

const ALL_CATEGORIES = Object.keys(CATEGORY_META) as SpotCategory[];

export function ExploreView({
  initialSpots,
  pendingCount,
}: {
  initialSpots: Spot[];
  pendingCount: number;
}) {
  const [activeCategories, setActiveCategories] =
    useState<Set<SpotCategory>>(new Set(ALL_CATEGORIES));
  const [visibleCount, setVisibleCount] = useState(initialSpots.length);
  const [mapMode, setMapMode] = useState<MapMode>("markers");
  const isHeatmapMode = mapMode === "heatmap";

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

  return (
    <div className="flex h-screen w-full flex-col">
      <header className="flex flex-col gap-3 border-b bg-background px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg leading-tight">
            <Link
              href="/about"
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
            <div
              className={cn(
                "flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0",
                isHeatmapMode && "opacity-50"
              )}
              role="group"
              aria-label="Filter by category"
              aria-disabled={isHeatmapMode}
            >
              {Object.entries(CATEGORY_META).map(([key, meta]) => {
                const category = key as SpotCategory;
                const active = activeCategories.has(category);
                return (
                  <Badge
                    key={key}
                    variant="outline"
                    render={
                      <button
                        type="button"
                        aria-pressed={active}
                        disabled={isHeatmapMode}
                        onClick={() => toggleCategory(category)}
                      />
                    }
                    className={cn(
                      "h-9 shrink-0 select-none px-3.5 transition-[opacity,transform,background-color,color] duration-200 ease-out",
                      isHeatmapMode ? "cursor-not-allowed" : "cursor-pointer motion-safe:active:scale-95",
                      !active && "opacity-40"
                    )}
                    style={{
                      borderColor: meta.color,
                      color: active ? meta.color : undefined,
                      backgroundColor: active ? `${meta.color}1a` : undefined,
                    }}
                  >
                    {meta.label}
                  </Badge>
                );
              })}
            </div>
            {isHeatmapMode && (
              <p className="text-xs text-muted-foreground">
                Zoom in to filter by category
              </p>
            )}
          </div>
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
        </div>
      </header>
      <main className="relative flex-1">
        <SpotMap
          initialSpots={initialSpots}
          categories={activeCategories}
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
                    Turn a category back on above to see it on the map.
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
