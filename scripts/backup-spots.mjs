// Exports the full `spots` table to a timestamped local JSON file before any
// data-quality cleanup (size filtering / dedup collapsing) touches live data.
// Read-only against Supabase. Run this again immediately before any live
// UPDATE paste, since the table keeps changing from concurrent ingestion.
//
// Usage: node --env-file=.env.local scripts/backup-spots.mjs

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (run with --env-file=.env.local)");
  process.exit(1);
}

const supabase = createClient(url, secretKey);

// Matches PostgREST's 1000-row cap per request (see fetchVerifiedSpots in
// src/lib/supabase/queries.ts) — this script has no status filter, so it
// must paginate the same way to avoid silently truncating the export.
const PAGE_SIZE = 1000;

async function fetchAllSpots() {
  const allSpots = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("spots")
      .select("*")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`Backup fetch failed at offset ${from}: ${error.message}`);
      process.exit(1);
    }

    const page = data ?? [];
    allSpots.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allSpots;
}

function summarize(spots) {
  const byStatus = {};
  const bySource = {};
  const byCategory = {};

  for (const spot of spots) {
    byStatus[spot.status] = (byStatus[spot.status] ?? 0) + 1;
    bySource[spot.source] = (bySource[spot.source] ?? 0) + 1;
    byCategory[spot.category] = (byCategory[spot.category] ?? 0) + 1;
  }

  return { byStatus, bySource, byCategory };
}

async function main() {
  console.log("Fetching all spots from Supabase...");
  const spots = await fetchAllSpots();

  const backupsDir = path.join(__dirname, "../backups");
  mkdirSync(backupsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(backupsDir, `spots-backup-${timestamp}.json`);

  writeFileSync(
    outPath,
    JSON.stringify({ exported_at: new Date().toISOString(), count: spots.length, spots }, null, 2)
  );

  const { byStatus, bySource, byCategory } = summarize(spots);
  console.log(`Backed up ${spots.length} rows to ${outPath}`);
  console.log("By status:", byStatus);
  console.log("By source:", bySource);
  console.log("By category:", byCategory);
}

main();
