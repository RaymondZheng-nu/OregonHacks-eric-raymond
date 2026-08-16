"use client";

import { useMemo, useState } from "react";
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
import { CATEGORY_META } from "@/lib/categories";
import { haversineDistanceMeters } from "@/lib/geo";
import type { Spot, SpotCategory } from "@/lib/types";

const SpotMap = dynamic(
  () => import("@/components/spot-map").then((m) => m.SpotMap),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-muted" /> }
);

const ALL_CATEGORIES = Object.keys(CATEGORY_META) as SpotCategory[];

export function ExploreView({
  initialSpots,
  pendingCount,
  initialActiveCategories,
  initialCenter,
  initialRadiusMeters,
}: {
  initialSpots: Spot[];
  pendingCount: number;
  initialActiveCategories?: SpotCategory[];
  initialCenter?: [number, number];
  initialRadiusMeters?: number;
}) {
  const [activeCategories, setActiveCategories] = useState<Set<SpotCategory>>(
    new Set(initialActiveCategories ?? [])
  );

  const visibleSpots = useMemo(() => {
    return initialSpots.filter((s) => {
      if (!activeCategories.has(s.category)) return false;
      if (initialCenter && initialRadiusMeters) {
        const distance = haversineDistanceMeters(
          initialCenter[0],
          initialCenter[1],
          s.lat,
          s.lng
        );
        if (distance > initialRadiusMeters) return false;
      }
      return true;
    });
  }, [initialSpots, activeCategories, initialCenter, initialRadiusMeters]);

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
              href="/"
              className="font-logo tracking-tight text-green-700 hover:opacity-90"
            >
              TOUCH GRASS
            </Link>
          </h1>
          <p className="text-sm text-muted-foreground">
            {visibleSpots.length} of {initialSpots.length} green spaces & nature
            spots across the USA
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Filter by category"
              render={<Button variant="outline" />}
            >
              Categories ({activeCategories.size}/{ALL_CATEGORIES.length})
              <ChevronDownIcon
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {Object.entries(CATEGORY_META).map(([key, meta]) => {
                const category = key as SpotCategory;
                return (
                  <DropdownMenuCheckboxItem
                    key={key}
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
        <SpotMap spots={visibleSpots} center={initialCenter} />
        {visibleSpots.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center">
            <div className="pointer-events-auto motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200 motion-safe:ease-out rounded-lg border bg-background/95 px-4 py-3 text-center shadow-sm backdrop-blur-xs">
              <p className="text-sm font-medium">No spots match these filters</p>
              <p className="text-xs text-muted-foreground">
                Turn a category back on above to see it on the map.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
