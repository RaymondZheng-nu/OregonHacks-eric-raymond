import { boundingBox, type BoundingBox } from "@/lib/geo";
import {
  DEFAULT_CENTER,
  DEFAULT_VIEWPORT_RADIUS_METERS,
  PORTLAND_CENTER,
} from "@/lib/search-params";

// The only two regions with cleaned, deduped data. dedup-cleanup.mjs ran on a
// snapshot from before the wider ~30-city ingest, and no schema column marks
// cleaned rows — so geography is the only proxy for "trust this density reading."
// Reuses the app's existing center/radius constants, not a boundary invented here.
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
