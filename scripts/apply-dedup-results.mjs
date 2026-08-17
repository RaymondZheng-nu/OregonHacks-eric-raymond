// Applies a reviewed subset of a dedup-cleanup.mjs pass directly to the live
// DB via supabase-js UPDATE calls — no raw SQL execution needed, since these
// are all plain UPDATEs against already-live columns (not DDL). Two parts:
//
//   1. Containment merges, but ONLY groups where every child is a real
//      polygon-containment match (matched_by === "area" && contained ===
//      true) — the density-clustering fallback path produces false
//      positives (nearby-but-distinct real spots getting hidden), so those
//      groups are always skipped here regardless of what's in the report.
//   2. The full tag-schema pass (size_class/activity_fit/amenities/
//      accessibility) — parsed from the generated SQL file's "Tag schema"
//      section, since the JSON report only keeps truncated examples. This
//      part carries no risk of hiding a real spot, so it's always applied
//      in full.
//
// Usage: node --env-file=.env.local scripts/apply-dedup-results.mjs \
//          --report=backups/dedup-report-....json --sql=backups/dedup-cleanup-....sql

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (run with --env-file=.env.local)");
  process.exit(1);
}

const reportArg = process.argv.find((a) => a.startsWith("--report="))?.replace("--report=", "");
const sqlArg = process.argv.find((a) => a.startsWith("--sql="))?.replace("--sql=", "");
if (!reportArg || !sqlArg) {
  console.error("Usage: --report=backups/dedup-report-....json --sql=backups/dedup-cleanup-....sql");
  process.exit(1);
}

const supabase = createClient(url, secretKey);

// Bounded parallelism, not full sequential — 5000+ individual REST calls
// sequentially would take far too long, but unbounded Promise.all risks
// hammering Supabase with thousands of simultaneous connections at once.
const CONCURRENCY = 20;

async function runPool(items, worker) {
  let index = 0;
  let errors = 0;
  async function next() {
    while (index < items.length) {
      const i = index++;
      try {
        await worker(items[i], i);
      } catch (err) {
        errors++;
        console.error(`  row ${i} failed: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, next));
  return errors;
}

function parseTagLine(line) {
  const match =
    /^update spots set size_class = (null|'([^']*)'), activity_fit = (null|array\[([^\]]*)\]), amenities = (null|array\[([^\]]*)\]), accessibility = (null|'([^']*)') where id = '([0-9a-f-]+)';/.exec(
      line.trim()
    );
  if (!match) return null;

  function parseArrayLiteral(raw) {
    if (!raw) return null;
    return raw
      .split(",")
      .map((s) => s.trim().replace(/^'|'$/g, ""))
      .filter((s) => s.length > 0);
  }

  return {
    id: match[9],
    size_class: match[2] ?? null,
    activity_fit: parseArrayLiteral(match[4]),
    amenities: parseArrayLiteral(match[6]),
    accessibility: match[8] ?? null,
  };
}

async function main() {
  const report = JSON.parse(readFileSync(reportArg, "utf-8"));
  const sqlText = readFileSync(sqlArg, "utf-8");

  // --- Part 1: verified-only containment merges ---
  const verifiedGroups = (report.containment?.groups ?? []).filter((g) =>
    g.children.every((c) => c.matched_by === "area" && c.contained === true)
  );
  const skippedGroups = (report.containment?.groups ?? []).length - verifiedGroups.length;
  console.log(
    `Containment: ${verifiedGroups.length} verified group(s) to apply, ${skippedGroups} density-only group(s) skipped.`
  );

  // Children merged first, `features` written last from only the children
  // that actually succeeded — writing `features` up front (old order) would
  // list a child on the parent even if its own merge update then failed,
  // leaving that child still status='verified' (a visible duplicate) while
  // the parent's feature list falsely claimed it was absorbed.
  let mergedChildren = 0;
  for (const group of verifiedGroups) {
    const mergedNames = [];
    for (const child of group.children) {
      const { error } = await supabase
        .from("spots")
        .update({ status: "merged", merged_into: group.parent.id })
        .eq("id", child.id);
      if (error) {
        console.error(`  failed to merge "${child.name}": ${error.message}`);
        continue;
      }
      mergedChildren++;
      mergedNames.push(child.name);
      console.log(`  merged "${child.name}" into "${group.parent.name}"`);
    }

    if (mergedNames.length === 0) continue;
    const { error: featuresError } = await supabase
      .from("spots")
      .update({ features: mergedNames })
      .eq("id", group.parent.id);
    if (featuresError) {
      console.error(`  failed to set features on parent "${group.parent.name}": ${featuresError.message}`);
    }
  }

  // --- Part 2: full tag-schema pass ---
  const tagLines = sqlText
    .split("\n")
    .filter((line) => line.startsWith("update spots set size_class"));
  const tagRows = [];
  const unparsedLines = [];
  for (const line of tagLines) {
    const row = parseTagLine(line);
    if (row) tagRows.push(row);
    else unparsedLines.push(line);
  }
  console.log(`Tags: ${tagRows.length}/${tagLines.length} parsed, applying...`);
  for (const line of unparsedLines) console.error(`  unparsed tag line: ${line}`);

  const tagErrors = await runPool(tagRows, async (row) => {
    const { error } = await supabase
      .from("spots")
      .update({
        size_class: row.size_class,
        activity_fit: row.activity_fit,
        amenities: row.amenities,
        accessibility: row.accessibility,
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
  });

  console.log(
    `Done. merged_children=${mergedChildren} tags_applied=${tagRows.length - tagErrors} tag_errors=${tagErrors} unparsed=${unparsedLines.length}`
  );

  // Unparsed lines are rows that were silently never applied — that's just
  // as much a failure as a row that errored while applying, and must not
  // let this script report success while some tag updates never happened.
  if (tagErrors > 0 || unparsedLines.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
