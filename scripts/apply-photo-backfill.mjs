// Applies the most recent backups/photo-backfill-*.json directly via the
// service key, instead of the manual copy-SQL-into-the-editor step
// backfill-photos.mjs normally leaves for a human. Every URL in that JSON
// was already verified live as a real image response by backfill-photos.mjs
// — this script just writes them, nothing new to validate.
//
// Usage: node --env-file=.env.local scripts/apply-photo-backfill.mjs [--file=backups/photo-backfill-....json]

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backupsDir = path.join(__dirname, "../backups");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (run with --env-file=.env.local)");
  process.exit(1);
}
const supabase = createClient(url, secretKey);

const fileArg = process.argv.find((arg) => arg.startsWith("--file="));
function resolveFile() {
  if (fileArg) return fileArg.replace("--file=", "");
  const files = readdirSync(backupsDir)
    .filter((f) => f.startsWith("photo-backfill-") && f.endsWith(".json"))
    .sort();
  if (files.length === 0) {
    console.error("No backups/photo-backfill-*.json found. Run `npm run backfill:photos` first.");
    process.exit(1);
  }
  return path.join(backupsDir, files[files.length - 1]);
}

async function main() {
  const filePath = resolveFile();
  const { results } = JSON.parse(readFileSync(filePath, "utf-8"));
  console.log(`Applying ${results.length} photo_url updates from ${filePath}...`);

  let applied = 0;
  let failed = 0;
  for (const r of results) {
    // Re-check live status/photo_url at write time too — same reasoning as
    // backfill-photos.mjs's own live cross-check, just closer to the actual write.
    const { data, error } = await supabase
      .from("spots")
      .update({ photo_url: r.photo_url })
      .eq("id", r.id)
      .eq("status", "verified")
      .is("photo_url", null)
      .select();

    if (error) {
      console.error(`  failed on ${r.id}: ${error.message}`);
      failed++;
      continue;
    }
    if (data && data.length > 0) applied++;
  }

  console.log(`Done. applied=${applied} failed=${failed} total=${results.length}`);
}

main();
