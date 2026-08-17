"use client";

import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CATEGORY_META } from "@/lib/categories";
import { searchSpots } from "@/lib/supabase/queries.client";
import type { SpotSearchResult } from "@/lib/supabase/queries";

const SEARCH_DEBOUNCE_MS = 250;

// Jumps straight to a known spot by name — the map itself has no other way
// to find one besides panning/zooming or swiping through the whole deck.
// Reuses the same ?spot=&lat=&lng= contract the results list's "View on
// map" link already sets, which spot-map.tsx reads to focus + open a popup.
export function SpotSearchBox() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    let cancelled = false;
    const id = setTimeout(() => {
      searchSpots(trimmed).then((next) => {
        if (!cancelled) setResults(next);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function goToSpot(spot: SpotSearchResult) {
    // A full navigation, not router.push: SpotMap's center/zoom are mount-only
    // (react-leaflet doesn't re-center on prop changes), so a same-route
    // client nav would update the URL but leave the map exactly where it was.
    // The existing "View on map" links from / and /spot/[id] only work because
    // they cross routes into a fresh /explore mount — this matches that.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination, react-hooks/immutability -- deliberate hard nav, see comment above
    window.location.href = `/explore?spot=${spot.id}&lat=${spot.lat}&lng=${spot.lng}`;
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-[200px]">
      <div className="relative">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          placeholder="Search spots by name"
          aria-label="Search spots by name"
          className="pl-7"
        />
      </div>
      {open && query.trim() && results.length > 0 && (
        <ul className="absolute top-full z-[1100] mt-1 max-h-72 w-full min-w-[240px] overflow-y-auto rounded-md border bg-popover py-1 shadow-md">
          {results.map((spot) => (
            <li key={spot.id}>
              <button
                type="button"
                onClick={() => goToSpot(spot)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: CATEGORY_META[spot.category].color }}
                />
                <span className="truncate">{spot.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
