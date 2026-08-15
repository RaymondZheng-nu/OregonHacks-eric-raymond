"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { AddSpotDialog } from "@/components/add-spot-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CATEGORY_META } from "@/lib/categories";
import type { Spot } from "@/lib/types";

const SpotMap = dynamic(
  () => import("@/components/spot-map").then((m) => m.SpotMap),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-muted" /> }
);

export function ExploreView({
  initialSpots,
  pendingCount,
}: {
  initialSpots: Spot[];
  pendingCount: number;
}) {
  return (
    <div className="flex h-screen w-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold leading-tight">Nearby Nature</h1>
          <p className="text-sm text-muted-foreground">
            {initialSpots.length} green spaces & nature spots across NYC
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(CATEGORY_META).map(([key, meta]) => (
            <Badge
              key={key}
              variant="outline"
              style={{ borderColor: meta.color, color: meta.color }}
            >
              {meta.label}
            </Badge>
          ))}
          <Button
            variant="outline"
            render={
              <Link href="/pending">
                Review submissions{pendingCount > 0 ? ` (${pendingCount})` : ""}
              </Link>
            }
          />
          <AddSpotDialog />
        </div>
      </header>
      <main className="flex-1">
        <SpotMap spots={initialSpots} />
      </main>
    </div>
  );
}
