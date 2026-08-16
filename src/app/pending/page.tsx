import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getPendingSpots } from "@/lib/supabase/queries.server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReviewSpotActions } from "@/components/review-spot-actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { CATEGORY_META } from "@/lib/categories";

// Internal moderation queue, not a page worth ranking in search.
export const metadata: Metadata = {
  title: "Review Submissions",
  robots: { index: false, follow: false },
};

export default async function PendingPage() {
  const spots = await getPendingSpots();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold leading-tight">
            Review submissions
          </h1>
          <p className="text-sm text-muted-foreground">
            New spots wait here until the community confirms they&apos;re real.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/explore">Back to map</Link>}
          />
          <ThemeToggle />
        </div>
      </div>

      {spots.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No pending submissions right now.
        </p>
      )}

      <div className="space-y-4">
        {spots.map((spot) => (
          <Card key={spot.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>{spot.name}</CardTitle>
                <Badge
                  variant="outline"
                  className="mt-1"
                  style={{
                    borderColor: CATEGORY_META[spot.category].color,
                    color: CATEGORY_META[spot.category].color,
                  }}
                >
                  {CATEGORY_META[spot.category].label}
                </Badge>
              </div>
              <ReviewSpotActions spotId={spot.id} />
            </CardHeader>
            <CardContent className="space-y-2">
              {spot.photo_url && (
                <div className="relative h-40 w-full overflow-hidden rounded">
                  <Image
                    src={spot.photo_url}
                    alt={spot.name}
                    fill
                    sizes="(min-width: 672px) 640px, 100vw"
                    className="object-cover"
                  />
                </div>
              )}
              {spot.description && (
                <p className="text-sm">{spot.description}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {spot.confirm_count}/2 confirmations · {spot.flag_count} flag
                {spot.flag_count === 1 ? "" : "s"} · {spot.lat.toFixed(4)},{" "}
                {spot.lng.toFixed(4)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
