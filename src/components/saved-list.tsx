"use client";

import { useEffect, useState } from "react";
import { MapPinIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORY_META } from "@/lib/categories";
import { directionsUrl } from "@/lib/geo";
import { getSavedSpots, removeSavedSpot, type SavedSpot } from "@/lib/saved-spots";

// Extracted from /saved's page so the same list can render both there (a
// real, bookmarkable route) and inside SavedModal (an in-place popup opened
// from the homepage header or the swipe deck's nav bar) without duplicating
// the localStorage read/remove logic twice.
export function SavedList() {
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

  if (saved === null) return null;

  if (saved.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nothing saved yet. Swipe right on a spot to add it here.
      </div>
    );
  }

  return (
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
              <a
                href={directionsUrl(spot.lat, spot.lng)}
                target="_blank"
                rel="noopener noreferrer"
              >
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
  );
}
