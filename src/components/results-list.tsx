"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CATEGORY_META } from "@/lib/categories";
import type { Spot } from "@/lib/types";

const BATCH_SIZE = 6;
const METERS_TO_MILES = 1609.34;

type SpotWithDistance = Spot & { distanceMeters: number | null };

function formatDistance(meters: number | null): string | null {
  if (meters == null) return null;
  const miles = meters / METERS_TO_MILES;
  return miles < 0.1 ? "Very close" : `${miles.toFixed(1)} mi away`;
}

export function ResultsList({
  spots,
  exploreParams,
}: {
  // Already shuffled server-side (results/page.tsx) before this ever
  // reaches the client — shuffling again here would re-run Math.random()
  // during hydration and produce a different order than the server sent,
  // which React reports as a hydration mismatch.
  spots: SpotWithDistance[];
  exploreParams: string;
}) {
  const [batchIndex, setBatchIndex] = useState(0);

  const batches = useMemo(() => {
    const chunks: SpotWithDistance[][] = [];
    for (let i = 0; i < spots.length; i += BATCH_SIZE) {
      chunks.push(spots.slice(i, i + BATCH_SIZE));
    }
    return chunks.length > 0 ? chunks : [[]];
  }, [spots]);

  const currentBatch = batches[batchIndex] ?? [];
  const canRefresh = batches.length > 1;

  function refresh() {
    setBatchIndex((i) => (i + 1) % batches.length);
  }

  if (spots.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 px-4 py-6 text-center">
        <p className="text-sm font-medium">No spots match yet</p>
        <p className="text-xs text-muted-foreground">
          Try a different vibe, fewer categories, or a wider radius.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canRefresh && (
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCwIcon aria-hidden="true" />
          Show me different ones
        </Button>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {currentBatch.map((spot) => {
          const distanceLabel = formatDistance(spot.distanceMeters);
          const viewParams = new URLSearchParams(exploreParams);
          viewParams.set("spot", spot.id);
          viewParams.set("lat", String(spot.lat));
          viewParams.set("lng", String(spot.lng));

          return (
            <Card key={spot.id} size="sm" className="gap-2 pt-0">
              {spot.photo_url ? (
                <div className="relative aspect-4/3 w-full overflow-hidden rounded-t-xl">
                  <Image
                    src={spot.photo_url}
                    alt={spot.name}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div
                  className="aspect-4/3 w-full rounded-t-xl"
                  style={{ backgroundColor: `${CATEGORY_META[spot.category].color}26` }}
                  aria-hidden="true"
                />
              )}
              <CardContent className="space-y-1.5">
                <p className="truncate font-medium leading-tight">{spot.name}</p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span style={{ color: CATEGORY_META[spot.category].color }}>
                    {CATEGORY_META[spot.category].label}
                  </span>
                  {distanceLabel && (
                    <>
                      <span>·</span>
                      <span>{distanceLabel}</span>
                    </>
                  )}
                </div>
                {spot.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {spot.description}
                  </p>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  nativeButton={false}
                  render={
                    <Link href={`/explore?${viewParams.toString()}`}>View on map</Link>
                  }
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
