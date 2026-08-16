// One-time backfill: looks up climbing grade tags for existing OSM-sourced
// climbing `spots` rows via targeted Overpass ID lookups (scoped to the ids
// we already have, mirrors scripts/backfill-area.mjs's approach), and writes
// a generated SQL file of `UPDATE spots SET climbing_grade = ...` statements
// — not applied here, and not applicable until supabase/schema.sql's
// climbing_grade column exists live (paste that migration first).
//
// Read-only against Supabase (only reads the local backup JSON, no DB call)
// and against Overpass (a public read API) — zero write risk to the live
// shared DB.
//
// Usage: node scripts/backfill-climbing-grade.mjs [--file=backups/spots-backup-....json]

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backupsDir = path.join(__dirname, "../backups");

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const FETCH_TIMEOUT_MS = 120_000;
const BATCH_SIZE = 300;
const PAUSE_BETWEEN_BATCHES_MS = 5000;
const MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 15_000;

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

// Same preference order as scripts/ingest-osm.mjs's extractClimbingGrade —
// French sport grades and YDS aren't a clean conversion, so this takes
// whichever tag is present rather than normalizing to one scale.
function extractClimbingGrade(tags = {}) {
  return tags["climbing:grade:french"] ?? tags["climbing:grade:yds"] ?? tags["climbing:grade"] ?? null;
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

// Same retry-on-429/504 policy as backfill-area.mjs's queryOverpass — the
// public Overpass instance's informal fair-use limits produce these under
// sustained use, not as hard failures.
async function queryOverpass(query, attempt = 1) {
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "User-Agent": "NearbyNature/1.0 (OregonHacks hackathon project, climbing grade backfill)",
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

// `out tags;` returns just id + tags, no geometry — lighter than
// backfill-area.mjs's `out geom;` since grade is a plain tag lookup, not a
// polygon computation. Crags are commonly nodes in OSM (unlike parks, which
// are almost always ways/relations), so this covers all three element types
// rather than only way/relation like the area backfill does.
async function backfillGrades(type, ids) {
  const results = new Map(); // osmId (string) -> grade string | null
  const batches = chunk(ids, BATCH_SIZE);

  for (const [index, batch] of batches.entries()) {
    const idList = batch.join(",");
    const query = `[out:json][timeout:90];${type}(id:${idList});out tags;`;

    console.log(`  ${type} batch ${index + 1}/${batches.length} (${batch.length} ids)...`);

    let elements;
    try {
      elements = await queryOverpass(query);
    } catch (err) {
      console.error(`  batch failed, skipping: ${err.message}`);
      continue;
    }

    for (const element of elements) {
      const grade = extractClimbingGrade(element.tags);
      if (grade !== null) results.set(String(element.id), grade);
    }

    if (index < batches.length - 1) await sleep(PAUSE_BETWEEN_BATCHES_MS);
  }

  return results;
}

function sqlEscape(str) {
  return String(str).replace(/'/g, "''");
}

async function main() {
  const startedAt = Date.now();
  const backupPath = resolveBackupFile();
  console.log(`Reading ${backupPath}...`);
  const backup = JSON.parse(readFileSync(backupPath, "utf-8"));

  const climbingSpots = backup.spots.filter((s) => s.source === "osm" && s.category === "climbing");
  const idsByType = { node: [], way: [], relation: [] };
  let unparseable = 0;

  for (const spot of climbingSpots) {
    const parsed = parseExternalId(spot.external_id);
    if (!parsed) {
      unparseable++;
      continue;
    }
    idsByType[parsed.type].push(parsed.id);
  }

  console.log(
    `${climbingSpots.length} osm climbing rows: ${idsByType.node.length} node, ${idsByType.way.length} way, ${idsByType.relation.length} relation, ${unparseable} unparseable external_id (skipped).`
  );

  const gradesByType = {};
  for (const type of ["node", "way", "relation"]) {
    if (idsByType[type].length === 0) {
      gradesByType[type] = new Map();
      continue;
    }
    console.log(`Looking up ${type} grade tags...`);
    gradesByType[type] = await backfillGrades(type, idsByType[type]);
  }

  const enriched = [];
  let resolvedCount = 0;

  for (const spot of climbingSpots) {
    const parsed = parseExternalId(spot.external_id);
    const grade = parsed ? gradesByType[parsed.type]?.get(parsed.id) ?? null : null;
    if (grade !== null) resolvedCount++;
    enriched.push({ id: spot.id, external_id: spot.external_id, climbing_grade: grade });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonOutPath = path.join(backupsDir, `climbing-grade-backfill-${timestamp}.json`);
  writeFileSync(
    jsonOutPath,
    JSON.stringify(
      { generated_at: new Date().toISOString(), source_backup: backupPath, grades: enriched },
      null,
      2
    )
  );

  const sqlLines = enriched
    .filter((e) => e.climbing_grade !== null)
    .map((e) => `update spots set climbing_grade = '${sqlEscape(e.climbing_grade)}' where id = '${e.id}';`);
  const sqlOutPath = path.join(backupsDir, `climbing-grade-backfill-${timestamp}.sql`);
  writeFileSync(
    sqlOutPath,
    `-- Generated by scripts/backfill-climbing-grade.mjs from ${backupPath}\n` +
      `-- Requires supabase/schema.sql's climbing_grade column to already exist live.\n` +
      `-- Not applied automatically — review, then paste into the Supabase SQL Editor.\n\n` +
      sqlLines.join("\n") +
      "\n"
  );

  console.log(
    `Done in ${((Date.now() - startedAt) / 1000).toFixed(0)}s. resolved=${resolvedCount}/${climbingSpots.length}`
  );
  console.log(`Enriched grades: ${jsonOutPath}`);
  console.log(`Generated SQL (${sqlLines.length} statements, not applied): ${sqlOutPath}`);
}

main();
