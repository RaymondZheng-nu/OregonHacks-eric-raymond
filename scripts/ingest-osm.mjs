// Pulls parks/gardens/climbing/birdwatching spots from OpenStreetMap via the
// Overpass API for a given bounding box and inserts them as verified spots.
//
// Usage: node --env-file=.env.local scripts/ingest-osm.mjs --bbox=south,west,north,east
//
// No API key needed. The public Overpass instance has informal fair-use limits
// (not a hard quota) — this script queries once per run, not repeatedly.

import { createClient } from "@supabase/supabase-js";
import { boundingBox, haversineDistanceMeters, polygonAreaM2, ringCentroidLatLng } from "../src/lib/geo.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (run with --env-file=.env.local)");
  process.exit(1);
}

const bboxArg = process.argv.find((arg) => arg.startsWith("--bbox="));
if (!bboxArg) {
  console.error("Missing --bbox=south,west,north,east");
  process.exit(1);
}

const [south, west, north, east] = bboxArg.replace("--bbox=", "").split(",").map(Number);
if ([south, west, north, east].some((n) => !Number.isFinite(n))) {
  console.error("Invalid --bbox — expected four comma-separated numbers: south,west,north,east");
  process.exit(1);
}
if (south < -90 || north > 90 || south >= north) {
  console.error("Invalid --bbox — expected -90 <= south < north <= 90");
  process.exit(1);
}
if (west < -180 || west > 180 || east < -180 || east > 180) {
  console.error("Invalid --bbox — longitude must be within -180..180");
  process.exit(1);
}
if (west >= east) {
  console.error("Invalid --bbox — antimeridian-crossing boxes (west >= east) aren't supported");
  process.exit(1);
}

const supabase = createClient(url, secretKey);

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const DEDUP_RADIUS_METERS = 30;
const FETCH_TIMEOUT_MS = 120_000;

// Per-category minimum area to count as a "meaningfully visitable green
// space" rather than a street planter or median — mirrors the thresholds
// validated in scripts/dedup-cleanup.mjs against the real live dataset.
// climbing/birdwatching/tree are exempt entirely (legitimately point-scale,
// and the app's curated niche categories); any node-derived element has no
// area to evaluate and is always exempt too, category aside.
// TODO(Tier 2, geo-dedup.ts): duplicated from dedup-cleanup.mjs's constants
// — extract to a shared module if this drifts, per the plan's Part D.
const JUNK_AREA_THRESHOLD_M2 = { park: 2000, garden: 300, other: 2000 };
const MERGEABLE_CATEGORIES = new Set(["park", "garden", "other"]);
const CONTAINMENT_RADIUS_FLOOR_M = 150;
const CONTAINMENT_RADIUS_CAP_M = 600;
const CONTAINMENT_RADIUS_AREA_FACTOR = 1.4;
const RELATIVE_SIZE_RATIO = 3;
const PARENT_MAX_AREA_M2 = 500_000;

function effectiveRadiusM(parentAreaM2) {
  const circularRadius = Math.sqrt(parentAreaM2 / Math.PI) * CONTAINMENT_RADIUS_AREA_FACTOR;
  return Math.min(Math.max(circularRadius, CONTAINMENT_RADIUS_FLOOR_M), CONTAINMENT_RADIUS_CAP_M);
}

function buildQuery() {
  const box = `${south},${west},${north},${east}`;
  return `
[out:json][timeout:90];
(
  nwr["leisure"~"^(park|garden|nature_reserve|bird_hide)$"](${box});
  nwr["landuse"="allotments"](${box});
  nwr["natural"="wood"](${box});
  nwr["sport"="climbing"](${box});
  nwr["amenity"="bird_hide"](${box});
);
out geom;
`.trim();
}

function mapCategory(tags = {}) {
  if (tags.sport === "climbing") return "climbing";
  if (tags.amenity === "bird_hide" || tags.leisure === "bird_hide") return "birdwatching";
  if (tags.leisure === "garden" || tags.landuse === "allotments") return "garden";
  if (tags.leisure === "park") return "park";
  return "other"; // nature_reserve, wood, anything else matched
}

// `out geom` (needed for area) can't be combined with `out center` — Overpass
// rejects the combined query outright — so the placement point has to be
// derived from the same geometry used for area, not requested separately.
function wayRing(element) {
  if (!element.geometry) return null;
  return element.geometry.map((p) => ({ lat: p.lat, lng: p.lon }));
}

function relationOuterRings(element) {
  return (element.members ?? [])
    .filter((m) => m.type === "way" && m.role === "outer" && m.geometry)
    .map((m) => m.geometry.map((p) => ({ lat: p.lat, lng: p.lon })));
}

// Returns both the pin placement point and, for ways/relations, the area
// used by the size filter below. Nodes are simple points with no area by
// definition — area_m2 stays null, which is what exempts them from the
// size filter (see runSizeFilter's twin in dedup-cleanup.mjs).
function elementGeometry(element) {
  if (element.type === "node") {
    return { coords: { lat: element.lat, lng: element.lon }, area_m2: null };
  }

  if (element.type === "way") {
    const ring = wayRing(element);
    if (!ring || ring.length === 0) return { coords: null, area_m2: null };
    const area = polygonAreaM2(ring);
    return { coords: ringCentroidLatLng(ring), area_m2: area > 0 ? area : null };
  }

  if (element.type === "relation") {
    const rings = relationOuterRings(element);
    if (rings.length === 0) return { coords: null, area_m2: null };
    const area = rings.reduce((sum, ring) => sum + polygonAreaM2(ring), 0);
    return { coords: ringCentroidLatLng(rings.flat()), area_m2: area > 0 ? area : null };
  }

  return { coords: null, area_m2: null };
}

async function findNearbyVerifiedSpot(lat, lng, radiusMeters) {
  const box = boundingBox(lat, lng, radiusMeters);
  const { data } = await supabase
    .from("spots")
    .select("id, lat, lng")
    .eq("status", "verified")
    .gte("lat", box.minLat)
    .lte("lat", box.maxLat)
    .gte("lng", box.minLng)
    .lte("lng", box.maxLng);

  return (data ?? []).some(
    (row) => haversineDistanceMeters(lat, lng, row.lat, row.lng) <= radiusMeters
  );
}

// Mirrors dedup-cleanup.mjs's tier-1 (area-based) containment match, so a
// fresh ingest doesn't recreate a duplicate pin inside an already-known
// larger green space of a compatible category (e.g. a new "Rose Garden" POI
// inside an already-ingested Prospect Park). Deliberately skips the batch
// job's tier-2 (no-area density clustering) — that needs the whole local
// cluster in view at once, which a per-row streaming insert doesn't have;
// see the plan's Part D for why this is scoped as v1-simple on purpose.
//
// Reads the live `area_m2` column, which does not exist until
// supabase/schema.sql's migration has been pasted into the Supabase SQL
// Editor. Guarded so a pre-migration run (e.g. Raymond running this before
// that paste happens) degrades to "containment check finds nothing" instead
// of crashing the whole ingestion run.
let containmentColumnMissing = false;

async function findContainingParent(lat, lng, category, areaM2) {
  if (containmentColumnMissing) return null;
  if (!MERGEABLE_CATEGORIES.has(category)) return null; // niche categories never merge

  const box = boundingBox(lat, lng, CONTAINMENT_RADIUS_CAP_M);
  const { data, error } = await supabase
    .from("spots")
    .select("id, name, lat, lng, area_m2")
    .eq("status", "verified")
    .in("category", [...MERGEABLE_CATEGORIES])
    .gte("lat", box.minLat)
    .lte("lat", box.maxLat)
    .gte("lng", box.minLng)
    .lte("lng", box.maxLng);

  if (error) {
    containmentColumnMissing = true;
    console.error(
      `  containment check disabled for the rest of this run (${error.message}) — is supabase/schema.sql's area_m2 column live yet?`
    );
    return null;
  }

  for (const candidate of data ?? []) {
    if (candidate.area_m2 == null || candidate.area_m2 > PARENT_MAX_AREA_M2) continue;
    const radius = effectiveRadiusM(candidate.area_m2);
    const distance = haversineDistanceMeters(lat, lng, candidate.lat, candidate.lng);
    if (distance > radius) continue;
    const sizeQualifies = areaM2 == null || candidate.area_m2 >= RELATIVE_SIZE_RATIO * areaM2;
    if (sizeQualifies) return candidate;
  }

  return null;
}

async function main() {
  console.log(`Querying Overpass for bbox ${south},${west},${north},${east}...`);

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "User-Agent": "NearbyNature/1.0 (OregonHacks hackathon project)",
    },
    body: buildQuery(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    console.error(`Overpass request failed: HTTP ${res.status}`);
    process.exit(1);
  }

  const json = await res.json();
  const elements = json.elements ?? [];
  console.log(`Overpass returned ${elements.length} elements.`);

  let inserted = 0;
  let deduped = 0;
  let skippedNoName = 0;
  let skippedNoCoords = 0;
  let skippedTooSmall = 0;
  let skippedNearParent = 0;

  for (const element of elements) {
    const name = element.tags?.name;
    if (!name) {
      skippedNoName++;
      continue;
    }

    const { coords, area_m2 } = elementGeometry(element);
    if (!coords) {
      skippedNoCoords++;
      continue;
    }

    const category = mapCategory(element.tags);
    const threshold = JUNK_AREA_THRESHOLD_M2[category];
    if (threshold !== undefined && area_m2 !== null && area_m2 < threshold) {
      skippedTooSmall++;
      continue;
    }

    const nearby = await findNearbyVerifiedSpot(coords.lat, coords.lng, DEDUP_RADIUS_METERS);
    if (nearby) {
      deduped++;
      continue;
    }

    const parent = await findContainingParent(coords.lat, coords.lng, category, area_m2);
    if (parent) {
      skippedNearParent++;
      continue;
    }

    // area_m2 is deliberately not written here yet: adding it to this insert
    // payload before supabase/schema.sql's migration is live would fail
    // every single insert (unknown column), not just this feature — and
    // this script runs independently and concurrently on Raymond's machine
    // too, so it must keep working unmodified in the gap before that paste
    // happens. Once the column is live, a scoped backfill pass (same shape
    // as scripts/backfill-area.mjs) can pick up rows inserted in the
    // meantime — computing area here and discarding it costs nothing today.
    const { data, error } = await supabase
      .from("spots")
      .upsert(
        {
          name,
          description: element.tags?.description ?? null,
          category,
          source: "osm",
          status: "verified",
          lat: coords.lat,
          lng: coords.lng,
          photo_url: null,
          external_id: `${element.type}/${element.id}`,
        },
        { onConflict: "source,external_id", ignoreDuplicates: true }
      )
      .select();

    if (error) {
      console.error(`  failed to insert "${name}": ${error.message}`);
      continue;
    }

    if (data && data.length > 0) inserted++;
    else deduped++;
  }

  console.log(
    `Done. inserted=${inserted} deduped=${deduped} near_parent=${skippedNearParent} skipped(no name)=${skippedNoName} skipped(no coords)=${skippedNoCoords} skipped(too small)=${skippedTooSmall} total=${elements.length}`
  );
}

main();
