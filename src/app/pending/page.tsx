import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSpotButton } from "@/components/confirm-spot-button";
import { CATEGORY_META } from "@/lib/categories";
import type { Spot } from "@/lib/types";

export default async function PendingPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("spots")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const spots = (data ?? []) as Spot[];

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
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/">Back to map</Link>}
        />
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
              <ConfirmSpotButton spotId={spot.id} />
            </CardHeader>
            <CardContent className="space-y-2">
              {spot.photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={spot.photo_url}
                  alt={spot.name}
                  className="h-40 w-full rounded object-cover"
                />
              )}
              {spot.description && (
                <p className="text-sm">{spot.description}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {spot.confirm_count}/2 confirmations · {spot.lat.toFixed(4)},{" "}
                {spot.lng.toFixed(4)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
