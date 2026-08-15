// Pulls parks/gardens/climbing/birdwatching spots from OpenStreetMap via the
// Overpass API for a given bounding box and inserts them as verified spots.
//
// Usage: node --env-file=.env.local scripts/ingest-osm.mjs --bbox=south,west,north,east
//
// No API key needed. The public Overpass instance has informal fair-use limits
// (not a hard quota) — this script queries once per run, not repeatedly.

import { createClient } from "@supabase/supabase-js";
import { boundingBox, haversineDistanceMeters } from "../src/lib/geo.ts";

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
out center tags;
`.trim();
}

function mapCategory(tags = {}) {
  if (tags.sport === "climbing") return "climbing";
  if (tags.amenity === "bird_hide" || tags.leisure === "bird_hide") return "birdwatching";
  if (tags.leisure === "garden" || tags.landuse === "allotments") return "garden";
  if (tags.leisure === "park") return "park";
  return "other"; // nature_reserve, wood, anything else matched
}

function elementCoords(element) {
  if (element.type === "node") return { lat: element.lat, lng: element.lon };
  if (element.center) return { lat: element.center.lat, lng: element.center.lon };
  return null;
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

  for (const element of elements) {
    const name = element.tags?.name;
    if (!name) {
      skippedNoName++;
      continue;
    }

    const coords = elementCoords(element);
    if (!coords) {
      skippedNoCoords++;
      continue;
    }

    const nearby = await findNearbyVerifiedSpot(coords.lat, coords.lng, DEDUP_RADIUS_METERS);
    if (nearby) {
      deduped++;
      continue;
    }

    const { data, error } = await supabase
      .from("spots")
      .upsert(
        {
          name,
          description: element.tags?.description ?? null,
          category: mapCategory(element.tags),
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
    `Done. inserted=${inserted} deduped=${deduped} skipped(no name)=${skippedNoName} skipped(no coords)=${skippedNoCoords} total=${elements.length}`
  );
}

main();
