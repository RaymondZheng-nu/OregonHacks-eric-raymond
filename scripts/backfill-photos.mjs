// One-time backfill: resolves real photos for existing OSM-sourced `spots`
// rows from tags already captured in a prior area-backfill run — no fresh
// Overpass query needed, since `wikimedia_commons`/`wikipedia`/`image` tags
// were already persisted locally alongside area/rings. Only ~3.8% of rows
// carry one of these tags (checked directly against the live table before
// writing this: 258 of 6,738 osm rows), so this closes a small real gap,
// not the whole photo-coverage problem — most spots still won't have one,
// and that's an honest reflection of what OSM itself has, not a bug here.
//
// Resolution, per tag (never fabricated — every URL is checked live for a
// real image response before being accepted):
//   - `image`: used directly if it already points at an image file; if it's
//     a commons.wikimedia.org/wiki/File: page link, converted to the actual
//     file URL via Special:FilePath. Anything else (an article/page link,
//     not a photo) is skipped.
//   - `wikimedia_commons`: `File:X` is resolved via Special:FilePath.
//     `Category:X` is skipped — picking "the" representative image for a
//     whole category reliably needs another API round-trip and judgment
//     call this pass doesn't make; a candidate for a later pass.
//   - `wikipedia`: `lang:Title` is resolved via Wikipedia's REST summary API
//     (`.../page/summary/Title`), using `thumbnail.source` — not the higher-
//     res `originalimage.source`, which Wikimedia's CDN 429s automated
//     clients for and explicitly says to request a thumbnail size instead
//     (confirmed live). Articles with no lead image (stubs, disambiguation
//     pages) are skipped, not guessed at.
//
// Read-only against Supabase (only reads current status/photo_url to avoid
// clobbering anything already set, or a row that's since been rejected/
// merged) and against Wikimedia's own public APIs. Writes only a local
// report + generated SQL — never applied automatically.
//
// Usage: node --env-file=.env.local scripts/backfill-photos.mjs [--areas=backups/area-backfill-....json] [--skip-resolved=backups/photo-backfill-....json] [--pause-ms=150]

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backupsDir = path.join(__dirname, "../backups");

const USER_AGENT = "NearbyNature/1.0 (OregonHacks hackathon project, photo backfill)";
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 5000;
const IMAGE_EXTENSION_RE = /\.(jpe?g|png|gif|webp)(?:[?#].*)?$/i;

const areasArg = process.argv.find((arg) => arg.startsWith("--areas="));
const skipResolvedArg = process.argv.find((arg) => arg.startsWith("--skip-resolved="));
const pauseMsArg = process.argv.find((arg) => arg.startsWith("--pause-ms="));
const PAUSE_BETWEEN_CALLS_MS = pauseMsArg ? Number(pauseMsArg.replace("--pause-ms=", "")) : 150;

function resolveAreasFile() {
  if (areasArg) return areasArg.replace("--areas=", "");
  const files = readdirSync(backupsDir)
    .filter((f) => f.startsWith("area-backfill-") && f.endsWith(".json"))
    .sort();
  if (files.length === 0) {
    console.error("No backups/area-backfill-*.json found. Run `npm run backfill:area` first.");
    process.exit(1);
  }
  return path.join(backupsDir, files[files.length - 1]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sqlEscape(str) {
  return String(str).replace(/'/g, "''");
}

// Special:FilePath serves the actual file with a redirect, works for any
// Commons filename regardless of which wiki tagged it. `width` caps the
// transferred size to something reasonable for a card photo, not the
// full-resolution original.
function commonsFilePathUrl(filename) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=1024`;
}

async function fetchWithRetry(url, options = {}, attempt = 1) {
  let res;
  try {
    res = await fetch(url, {
      ...options,
      headers: { "User-Agent": USER_AGENT, ...options.headers },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    if (attempt > MAX_RETRIES) throw err;
    await sleep(RETRY_BASE_DELAY_MS * attempt);
    return fetchWithRetry(url, options, attempt + 1);
  }

  if (res.status === 429 || res.status >= 500) {
    // A long Retry-After (seen live: 600s on unscaled-image requests) means
    // this specific URL/endpoint isn't going to succeed on any timescale
    // this script should wait around for — better to log it as unresolved
    // and move on than stall the whole run on one candidate.
    const retryAfterSeconds = Number(res.headers.get("retry-after"));
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 30) return res;
    if (attempt <= MAX_RETRIES) {
      await sleep(RETRY_BASE_DELAY_MS * attempt);
      return fetchWithRetry(url, options, attempt + 1);
    }
  }

  return res;
}

// The only thing that actually earns a row a `photo_url` — every candidate
// URL, regardless of which tag produced it, must round-trip as a real image
// before being accepted. Catches renamed/deleted Commons files, broken
// thumbnails, and non-image "image" tag values (article links etc.) alike.
async function isRealImage(url) {
  const res = await fetchWithRetry(url, { method: "HEAD", redirect: "follow" });
  if (!res.ok) return false;
  const contentType = res.headers.get("content-type") ?? "";
  return contentType.startsWith("image/");
}

async function resolveWikipediaImage(tagValue) {
  const match = /^([a-z-]+):(.+)$/.exec(tagValue);
  const lang = match ? match[1] : "en";
  const title = match ? match[2] : tagValue;

  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) return null;

  // `thumbnail.source`, not `originalimage.source` — the "unscaled" original
  // is exactly what Wikimedia's CDN rate-limits automated clients for
  // (confirmed live: it 429s immediately with "use thumbnail images
  // instead"). The pre-sized thumbnail is the one their API docs actually
  // recommend for this.
  const data = await res.json();
  return data.thumbnail?.source ?? null;
}

async function resolveCandidate(spot) {
  const tags = spot.tags ?? {};

  if (tags.image) {
    if (IMAGE_EXTENSION_RE.test(tags.image)) return tags.image;
    const fileMatch = /commons\.wikimedia\.org\/wiki\/(File:.+)$/.exec(tags.image);
    if (fileMatch) return commonsFilePathUrl(decodeURIComponent(fileMatch[1]));
    return null; // article/page link, not a photo — not usable
  }

  if (tags.wikimedia_commons?.startsWith("File:")) {
    return commonsFilePathUrl(tags.wikimedia_commons.slice("File:".length));
  }
  // Category: entries skipped — see file header.

  if (tags.wikipedia) {
    return resolveWikipediaImage(tags.wikipedia);
  }

  return null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (run with --env-file=.env.local)");
    process.exit(1);
  }
  const supabase = createClient(url, anonKey);

  const areasPath = resolveAreasFile();
  console.log(`Reading ${areasPath}...`);
  const { areas } = JSON.parse(readFileSync(areasPath, "utf-8"));

  let candidates = areas.filter((a) => {
    const t = a.tags ?? {};
    return Boolean(t.image || t.wikimedia_commons?.startsWith("File:") || t.wikipedia);
  });
  console.log(`${candidates.length} rows carry a resolvable image tag (image/wikimedia_commons File:/wikipedia).`);

  // Retry mode: skip whatever a previous run already resolved, so re-running
  // with gentler pacing only spends time (and Wikimedia's patience) on the
  // ones that actually failed last time.
  if (skipResolvedArg) {
    const prevPath = skipResolvedArg.replace("--skip-resolved=", "");
    const prev = JSON.parse(readFileSync(prevPath, "utf-8"));
    const alreadyResolved = new Set(prev.results.map((r) => r.id));
    const before = candidates.length;
    candidates = candidates.filter((c) => !alreadyResolved.has(c.id));
    console.log(`Skipping ${before - candidates.length} already resolved by ${prevPath} — ${candidates.length} left to retry.`);
  }

  // Cross-check against the live table so this never clobbers a photo set
  // since the area-backfill snapshot was taken, or touches a row that's no
  // longer verified — the snapshot could be stale by the time this runs.
  const ids = candidates.map((c) => c.id);
  const liveById = new Map();
  const PAGE = 500;
  for (let i = 0; i < ids.length; i += PAGE) {
    const { data, error } = await supabase
      .from("spots")
      .select("id, status, photo_url")
      .in("id", ids.slice(i, i + PAGE));
    if (error) throw new Error(`Live lookup failed: ${error.message}`);
    for (const row of data ?? []) liveById.set(row.id, row);
  }

  const results = [];
  let resolved = 0;
  let skippedAlreadyHasPhoto = 0;
  let skippedNotVerified = 0;
  let skippedNoImageFound = 0;
  let skippedFailedValidation = 0;

  for (const [index, candidate] of candidates.entries()) {
    const live = liveById.get(candidate.id);
    if (!live || live.status !== "verified") {
      skippedNotVerified++;
      continue;
    }
    if (live.photo_url) {
      skippedAlreadyHasPhoto++;
      continue;
    }

    process.stdout.write(`  [${index + 1}/${candidates.length}] ${candidate.id}... `);

    let photoUrl = null;
    try {
      photoUrl = await resolveCandidate(candidate);
    } catch (err) {
      console.log(`error resolving: ${err.message}`);
      skippedNoImageFound++;
      await sleep(PAUSE_BETWEEN_CALLS_MS);
      continue;
    }

    if (!photoUrl) {
      console.log("no image found");
      skippedNoImageFound++;
      await sleep(PAUSE_BETWEEN_CALLS_MS);
      continue;
    }

    let valid = false;
    try {
      valid = await isRealImage(photoUrl);
    } catch {
      valid = false;
    }

    if (!valid) {
      console.log(`candidate URL didn't validate as an image: ${photoUrl}`);
      skippedFailedValidation++;
      await sleep(PAUSE_BETWEEN_CALLS_MS);
      continue;
    }

    console.log("resolved");
    resolved++;
    results.push({
      id: candidate.id,
      category: candidate.category,
      photo_url: photoUrl,
      source_tag: candidate.tags.image
        ? "image"
        : candidate.tags.wikimedia_commons
          ? "wikimedia_commons"
          : "wikipedia",
    });

    await sleep(PAUSE_BETWEEN_CALLS_MS);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const reportPath = path.join(backupsDir, `photo-backfill-${timestamp}.json`);
  writeFileSync(
    reportPath,
    JSON.stringify({ generated_at: new Date().toISOString(), source_areas: areasPath, results }, null, 2)
  );

  const sqlLines = results.map(
    (r) => `update spots set photo_url = '${sqlEscape(r.photo_url)}' where id = '${r.id}'; -- ${r.source_tag}`
  );
  const sqlPath = path.join(backupsDir, `photo-backfill-${timestamp}.sql`);
  writeFileSync(
    sqlPath,
    `-- Generated by scripts/backfill-photos.mjs from ${areasPath}\n` +
      `-- Every URL below was verified live to return a real image response\n` +
      `-- (HTTP 200, content-type image/*) before being included.\n` +
      `-- Not applied automatically — review, then paste into the Supabase SQL Editor.\n\n` +
      sqlLines.join("\n") +
      "\n"
  );

  console.log("");
  console.log(`Resolved: ${resolved}`);
  console.log(`Skipped — already had a photo: ${skippedAlreadyHasPhoto}`);
  console.log(`Skipped — no longer verified live: ${skippedNotVerified}`);
  console.log(`Skipped — no image found: ${skippedNoImageFound}`);
  console.log(`Skipped — candidate URL failed validation: ${skippedFailedValidation}`);
  console.log("");
  console.log(`Report: ${reportPath}`);
  console.log(`Generated SQL (${sqlLines.length} statements, not applied): ${sqlPath}`);
}

main();
