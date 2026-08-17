"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPinIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORY_META } from "@/lib/categories";
import { directionsUrl } from "@/lib/geo";
import { getSavedSpots, removeSavedSpot, type SavedSpot } from "@/lib/saved-spots";

export default function SavedPage() {
  // Starts empty and loads in an effect, not lazy useState(getSavedSpots) —
  // localStorage isn't available during SSR, so reading it synchronously in
  // render would mismatch between server and client hydration.
  const [saved, setSaved] = useState<SavedSpot[] | null>(null);

  useEffect(() => {
    // One-time hydration from a browser-only external system (localStorage)
    // — not a case the "subscribe and update on change" pattern this rule
    // wants applies to; there's no ongoing subscription to set up for a
    // read that only needs to happen once, after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(getSavedSpots());
  }, []);

  function handleRemove(id: string) {
    removeSavedSpot(id);
    setSaved((prev) => prev?.filter((s) => s.id !== id) ?? null);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-logo text-2xl tracking-tight text-green-700">Saved Spots</h1>
          <p className="text-sm text-muted-foreground">
            Spots you swiped right on — saved to this device only.
          </p>
        </div>
        <Link
          href="/swipe"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Back to swiping
        </Link>
      </div>

      {saved === null ? null : saved.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nothing saved yet — swipe right on a spot to add it here.
        </div>
      ) : (
        <ul className="space-y-3">
          {saved.map((spot) => (
            <li
              key={spot.id}
              className="flex items-center gap-3 rounded-lg border bg-card p-3 ring-1 ring-foreground/10"
            >
              {spot.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={spot.photo_url}
                  alt={spot.name}
                  className="size-14 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div
                  className="size-14 shrink-0 rounded-md"
                  style={{ backgroundColor: `${CATEGORY_META[spot.category].color}26` }}
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium leading-tight">{spot.name}</p>
                <p className="text-xs text-muted-foreground">
                  {CATEGORY_META[spot.category].label}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={
                  <a href={directionsUrl(spot.lat, spot.lng)} target="_blank" rel="noopener noreferrer">
                    <MapPinIcon aria-hidden="true" />
                    Directions
                  </a>
                }
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${spot.name} from saved`}
                onClick={() => handleRemove(spot.id)}
              >
                <TrashIcon aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
