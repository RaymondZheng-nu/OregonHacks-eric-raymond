// Generic fetch+normalize adapter for Socrata open-data portals (NYC Open
// Data, data.oregon.gov, and any other city/state running the same
// platform). The code here is region-agnostic; per-region specifics (domain,
// dataset id, field names, category mapping) live in socrata-sources.mjs.
//
// Usage: node --env-file=.env.local scripts/ingest-socrata.mjs --region=nyc
//
// No app token needed for anonymous, demo-scale Socrata access.

import { createClient } from "@supabase/supabase-js";
import { boundingBox, geometryCentroid, haversineDistanceMeters } from "../src/lib/geo.ts";
import { SOCRATA_SOURCES } from "./socrata-sources.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (run with --env-file=.env.local)");
  process.exit(1);
}

const regionArg = process.argv.find((arg) => arg.startsWith("--region="));
if (!regionArg) {
  console.error(`Missing --region=<key>. Available regions: ${Object.keys(SOCRATA_SOURCES).join(", ")}`);
  process.exit(1);
}

const regionKey = regionArg.replace("--region=", "");
const region = SOCRATA_SOURCES[regionKey];
if (!region) {
  console.error(`Unknown region "${regionKey}". Available regions: ${Object.keys(SOCRATA_SOURCES).join(", ")}`);
  process.exit(1);
}

const supabase = createClient(url, secretKey);

const PAGE_SIZE = 1000;
const FETCH_TIMEOUT_MS = 120_000;

// Larger than OSM's 30m: these rows are area features (park boundaries)
// reduced to a centroid, not points, so the centroid can land noticeably
// away from a hand-placed landmark pin for the same park in the seed data.
const DEDUP_RADIUS_METERS = 150;

function resolveName(record) {
  for (const field of region.nameFields) {
    if (record[field]) return record[field];
  }
  return null;
}

function resolveCategory(record) {
  const raw = record[region.categoryField];
  return region.categoryMap[raw] ?? null;
}

async function fetchPage(offset) {
  // $order is required for paging to be deterministic: without it, Socrata's
  // default result order isn't guaranteed stable across requests, so rows
  // can shift between pages and get skipped or duplicated across runs.
  const endpoint = `https://${region.domain}/resource/${region.datasetId}.json?$limit=${PAGE_SIZE}&$offset=${offset}&$order=${region.idField}`;
  const res = await fetch(endpoint, {
    headers: { "User-Agent": "NearbyNature/1.0 (OregonHacks hackathon project)" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Socrata request failed: HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchAllRecords() {
  const all = [];
  let offset = 0;
  for (;;) {
    const page = await fetchPage(offset);
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

async function findNearbyVerifiedSpot(lat, lng, radiusMeters) {
  const box = boundingBox(lat, lng, radiusMeters);
  const { data, error } = await supabase
    .from("spots")
    .select("id, lat, lng")
    .eq("status", "verified")
    .gte("lat", box.minLat)
    .lte("lat", box.maxLat)
    .gte("lng", box.minLng)
    .lte("lng", box.maxLng);

  // A failed dedup lookup must never be read as "no duplicate" — that would
  // insert a live duplicate into the shared table on a transient network
  // blip. Throwing lets the caller skip this record instead of silently
  // corrupting the dataset.
  if (error) {
    throw new Error(`dedup lookup failed near ${lat},${lng}: ${error.message}`);
  }

  return (data ?? []).some(
    (row) => haversineDistanceMeters(lat, lng, row.lat, row.lng) <= radiusMeters
  );
}

async function main() {
  console.log(`Fetching Socrata dataset ${region.datasetId} from ${region.domain} (region=${regionKey})...`);

  const records = await fetchAllRecords();
  console.log(`Fetched ${records.length} records.`);

  let inserted = 0;
  let deduped = 0;
  let skippedCategory = 0;
  let skippedNoName = 0;
  let skippedNoCoords = 0;
  let skippedDedupError = 0;

  for (const record of records) {
    const category = resolveCategory(record);
    if (!category) {
      skippedCategory++;
      continue;
    }

    const name = resolveName(record);
    if (!name) {
      skippedNoName++;
      continue;
    }

    const coords = geometryCentroid(record[region.geometryField]);
    if (!coords) {
      skippedNoCoords++;
      continue;
    }

    // A failed dedup lookup must never fall through to the insert below —
    // that would risk writing a live duplicate on a transient network blip.
    // Skip just this record rather than aborting the whole run.
    let nearby;
    try {
      nearby = await findNearbyVerifiedSpot(coords.lat, coords.lng, DEDUP_RADIUS_METERS);
    } catch (err) {
      console.error(`  skipping "${name}": ${err.message}`);
      skippedDedupError++;
      continue;
    }
    if (nearby) {
      deduped++;
      continue;
    }

    const { data, error } = await supabase
      .from("spots")
      .upsert(
        {
          name,
          description: null,
          category,
          source: "official",
          status: "verified",
          lat: coords.lat,
          lng: coords.lng,
          photo_url: null,
          external_id: `${regionKey}/${record[region.idField]}`,
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
    `Done. inserted=${inserted} deduped=${deduped} skipped(category)=${skippedCategory} skipped(no name)=${skippedNoName} skipped(no coords)=${skippedNoCoords} skipped(dedup error)=${skippedDedupError} total=${records.length}`
  );
  if (skippedDedupError > 0) process.exitCode = 1;
}

main();
