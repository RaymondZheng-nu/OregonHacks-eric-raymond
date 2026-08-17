import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
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

const spots = JSON.parse(
  readFileSync(path.join(__dirname, "../supabase/seed-data.json"), "utf-8")
);

// Every other ingestion script (ingest-osm.mjs, ingest-socrata.mjs) upserts
// against the (source, external_id) unique index specifically so a re-run
// is safe — this was the one exception, a plain `.insert()` with no
// conflict target, so running it twice inserted full duplicate rows with
// fresh UUIDs. seed-data.json's rows have no external_id of their own
// (Postgres treats NULL as distinct in a unique index, so "source,
// external_id" with a real null wouldn't dedupe them anyway), so this
// derives a stable one from each row's name — same idempotency guarantee,
// consistent with how every other ingestion path establishes it.
const spotsWithExternalId = spots.map((spot) => ({
  ...spot,
  external_id: spot.external_id ?? `seed/${spot.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
}));

const { data, error } = await supabase
  .from("spots")
  .upsert(spotsWithExternalId, { onConflict: "source,external_id", ignoreDuplicates: true })
  .select();

if (error) {
  console.error("Seed failed:", error.message);
  process.exit(1);
}

console.log(`Seeded ${data.length} spots (${spots.length - data.length} already present, skipped).`);
