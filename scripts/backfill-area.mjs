// One-time backfill: looks up polygon/way geometry for existing OSM-sourced
// `spots` rows via targeted Overpass ID lookups (scoped to the ids we already
// have, not a fresh spatial re-query per city — see HANDOFF/plan for why),
// computes each one's area, and writes:
//   1. an enriched JSON (base backup + area_m2 per row) for the offline
//      dedup-cleanup script to consume
//   2. a generated SQL file of `UPDATE spots SET area_m2 = ...` statements,
//      queued for the live paste alongside the rest of the cleanup — not
//      applied here, and not applicable until schema.sql's area_m2 column
//      exists live anyway.
//
// Read-only against Supabase (only reads the local backup JSON, no DB call)
// and against Overpass (a public read API) — zero write risk to the live
// shared DB. Time-boxed: pass --minutes=N to cap wall-clock time; on cutoff
// it stops cleanly and writes out whatever was resolved so far rather than
// leaving no output.
//
// Usage: node scripts/backfill-area.mjs [--minutes=10] [--file=backups/spots-backup-....json]

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { polygonAreaM2 } from "../src/lib/geo.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backupsDir = path.join(__dirname, "../backups");

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const FETCH_TIMEOUT_MS = 120_000;
const WAY_BATCH_SIZE = 300;
const RELATION_BATCH_SIZE = 50;
const PAUSE_BETWEEN_BATCHES_MS = 5000;
const MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 15_000;

const minutesArg = process.argv.find((arg) => arg.startsWith("--minutes="));
const timeBudgetMs = (minutesArg ? Number(minutesArg.replace("--minutes=", "")) : 10) * 60_000;

const fileArg = process.argv.find((arg) => arg.startsWith("--file="));

function resolveBackupFile() {
  if (fileArg) return fileArg.replace("--file=", "");
  const files = readdirSync(backupsDir)
    .filter((f) => f.startsWith("spots-backup-") && f.endsWith(".json"))
    .sort();
  if (files.length === 0) {
    console.error("No backups/spots-backup-*.json found. Run `npm run backup:spots` first.");
    process.exit(1);
  }
  return path.join(backupsDir, files[files.length - 1]);
}

function parseExternalId(externalId) {
  const match = /^(node|way|relation)\/(\d+)$/.exec(externalId ?? "");
  if (!match) return null;
  return { type: match[1], id: match[2] };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Overpass's public instance has informal fair-use limits, not a hard quota
// — 429 (rate limited) and 504 (query timed out, seen on the larger relation
// batches) are both expected under sustained use, not failures to give up
// on immediately. Retry those with backoff; anything else (4xx other than
// 429, network error) is treated as non-retryable and skipped by the caller.
async function queryOverpass(query, attempt = 1) {
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "User-Agent": "NearbyNature/1.0 (OregonHacks hackathon project, area backfill)",
    },
    body: query,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (res.status === 429 || res.status === 504) {
    if (attempt > MAX_RETRIES) {
      throw new Error(`Overpass request failed after ${MAX_RETRIES} retries: HTTP ${res.status}`);
    }
    const delay = RETRY_BASE_DELAY_MS * attempt;
    console.log(`    HTTP ${res.status}, retrying in ${delay / 1000}s (attempt ${attempt}/${MAX_RETRIES})...`);
    await sleep(delay);
    return queryOverpass(query, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`Overpass request failed: HTTP ${res.status}`);
  }

  const json = await res.json();
  return json.elements ?? [];
}

// `out geom;` on a way returns element.geometry as an ordered [{lat,lon},...]
// ring directly.
function wayRing(element) {
  if (!element.geometry) return null;
  return element.geometry.map((p) => ({ lat: p.lat, lng: p.lon }));
}

// `out geom;` on a relation includes full geometry per member (way members
// carry their own geometry array, same shape as a standalone way). Only the
// "outer"-role members are real boundary — ignoring inner rings (holes) is a
// deliberate overestimate for the area math (never wrongly filters something
// out for being too small), and each outer ring is also what the point-in-
// polygon containment check in dedup-cleanup.mjs tests candidates against.
function relationRings(element) {
  return (element.members ?? [])
    .filter((m) => m.type === "way" && m.role === "outer" && m.geometry)
    .map((m) => m.geometry.map((p) => ({ lat: p.lat, lng: p.lon })));
}

function relationAreaM2(rings) {
  if (rings.length === 0) return null;
  const total = rings.reduce((sum, ring) => sum + polygonAreaM2(ring), 0);
  return total > 0 ? total : null;
}

async function backfillType(type, ids, batchSize, startedAt) {
  const results = new Map(); // osmId (string) -> { area_m2, rings, tags }
  const batches = chunk(ids, batchSize);

  for (const [index, batch] of batches.entries()) {
    if (Date.now() - startedAt > timeBudgetMs) {
      console.log(
        `Time budget exceeded — stopping ${type} lookups after ${index}/${batches.length} batches.`
      );
      break;
    }

    const idList = batch.join(",");
    const query =
      type === "way"
        ? `[out:json][timeout:90];way(id:${idList});out geom;`
        : `[out:json][timeout:90];relation(id:${idList});out geom;`;

    console.log(`  ${type} batch ${index + 1}/${batches.length} (${batch.length} ids)...`);

    let elements;
    try {
      elements = await queryOverpass(query);
    } catch (err) {
      console.error(`  batch failed, skipping: ${err.message}`);
      continue;
    }

    for (const element of elements) {
      let rings, area;
      if (type === "way") {
        const ring = wayRing(element);
        rings = ring ? [ring] : [];
        area = ring ? polygonAreaM2(ring) : null;
      } else {
        rings = relationRings(element);
        area = relationAreaM2(rings);
      }

      results.set(String(element.id), {
        area_m2: area && area > 0 ? area : null,
        rings,
        tags: element.tags ?? {},
      });
    }

    if (index < batches.length - 1) await sleep(PAUSE_BETWEEN_BATCHES_MS);
  }

  return results;
}

async function main() {
  const startedAt = Date.now();
  const backupPath = resolveBackupFile();
  console.log(`Reading ${backupPath}...`);
  const backup = JSON.parse(readFileSync(backupPath, "utf-8"));

  const osmSpots = backup.spots.filter((s) => s.source === "osm");
  const wayIds = [];
  const relationIds = [];
  let nodeCount = 0;
  let unparseable = 0;

  for (const spot of osmSpots) {
    const parsed = parseExternalId(spot.external_id);
    if (!parsed) {
      unparseable++;
      continue;
    }
    if (parsed.type === "node") nodeCount++;
    else if (parsed.type === "way") wayIds.push(parsed.id);
    else if (parsed.type === "relation") relationIds.push(parsed.id);
  }

  console.log(
    `${osmSpots.length} osm rows: ${nodeCount} node (exempt, no area), ${wayIds.length} way, ${relationIds.length} relation, ${unparseable} unparseable external_id (skipped).`
  );

  console.log(`Looking up way geometry (budget ${timeBudgetMs / 60_000} min total)...`);
  const wayAreas = await backfillType("way", wayIds, WAY_BATCH_SIZE, startedAt);

  console.log("Looking up relation geometry...");
  const relationAreas = await backfillType("relation", relationIds, RELATION_BATCH_SIZE, startedAt);

  const enriched = [];
  let resolvedCount = 0;
  let noGeometryCount = 0;

  for (const spot of osmSpots) {
    const parsed = parseExternalId(spot.external_id);
    let resolved = null;

    if (parsed?.type === "way" && wayAreas.has(parsed.id)) {
      resolved = wayAreas.get(parsed.id);
    } else if (parsed?.type === "relation" && relationAreas.has(parsed.id)) {
      resolved = relationAreas.get(parsed.id);
    }

    if (resolved?.area_m2 != null) resolvedCount++;
    else if (parsed?.type === "way" || parsed?.type === "relation") noGeometryCount++;

    enriched.push({
      id: spot.id,
      external_id: spot.external_id,
      category: spot.category,
      area_m2: resolved?.area_m2 ?? null,
      // Rings feed dedup-cleanup.mjs's point-in-polygon containment check.
      // Tags feed the size-filter's amenity/accessibility context and the
      // activity_fit tag overrides — local intermediate data only, never
      // written to the live DB.
      rings: resolved?.rings ?? [],
      tags: resolved?.tags ?? {},
    });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonOutPath = path.join(backupsDir, `area-backfill-${timestamp}.json`);
  writeFileSync(
    jsonOutPath,
    JSON.stringify(
      { generated_at: new Date().toISOString(), source_backup: backupPath, areas: enriched },
      null,
      2
    )
  );

  const sqlLines = enriched
    .filter((e) => e.area_m2 !== null)
    .map((e) => `update spots set area_m2 = ${e.area_m2} where id = '${e.id}';`);
  const sqlOutPath = path.join(backupsDir, `area-backfill-${timestamp}.sql`);
  writeFileSync(
    sqlOutPath,
    `-- Generated by scripts/backfill-area.mjs from ${backupPath}\n` +
      `-- Requires supabase/schema.sql's area_m2 column to already exist live.\n` +
      `-- Not applied automatically — review, then paste into the Supabase SQL Editor.\n\n` +
      sqlLines.join("\n") +
      "\n"
  );

  console.log(
    `Done in ${((Date.now() - startedAt) / 1000).toFixed(0)}s. resolved=${resolvedCount} no_geometry=${noGeometryCount} node_exempt=${nodeCount}`
  );
  console.log(`Enriched areas: ${jsonOutPath}`);
  console.log(`Generated SQL (${sqlLines.length} statements, not applied): ${sqlOutPath}`);
}

main();
