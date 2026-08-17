import { boundingBox, type BoundingBox } from "@/lib/geo";
import {
  DEFAULT_CENTER,
  DEFAULT_VIEWPORT_RADIUS_METERS,
  PORTLAND_CENTER,
} from "@/lib/search-params";

// The only two regions with cleaned, deduped spot data — everywhere else,
// real spots may exist (scripts/ingest-osm-cities.mjs ingested ~30 more US
// cities), but scripts/dedup-cleanup.mjs was run against a backup snapshot
// taken before that batch existed, so nothing outside these two regions has
// ever had its duplicates merged or its junk-sized ("park"/"other" polygons
// under 150m²) rows filtered. There's no schema column marking which rows
// were cleaned — dedup-cleanup.mjs isn't geography-scoped in code, it just
// happened to run before the wider ingest — so geography is the only
// available proxy for "trust this area's density reading."
//
// Reuses the same center points + radius the quiz's skip-address fallback
// already treats as "Portland" / the app's other default search area
// (src/lib/search-params.ts), rather than guessing a separate boundary —
// this is genuinely the same area the rest of the app already calls
// "Portland" or "the default region," not a boundary invented for this view.
export const COVERAGE_REGIONS: { name: string; bounds: BoundingBox }[] = [
  {
    name: "Portland",
    bounds: boundingBox(
      PORTLAND_CENTER.lat,
      PORTLAND_CENTER.lng,
      DEFAULT_VIEWPORT_RADIUS_METERS,
    ),
  },
  {
    name: "New York City",
    bounds: boundingBox(
      DEFAULT_CENTER.lat,
      DEFAULT_CENTER.lng,
      DEFAULT_VIEWPORT_RADIUS_METERS,
    ),
  },
];
