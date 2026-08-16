// Offline dry-run for the spots data-quality cleanup: junk-sized spots +
// nested/duplicate spots (see plan doc). Reads ONLY local backup files —
// never touches the live database, reads or writes. Produces a human-
// readable report and a generated SQL file of targeted, id-keyed UPDATE
// statements for later review and manual paste into the Supabase SQL
// Editor — this script does not apply anything.
//
// Usage: node scripts/dedup-cleanup.mjs
//   [--backup=backups/spots-backup-....json]
//   [--areas=backups/area-backfill-....json]

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { haversineDistanceMeters } from "../src/lib/geo.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backupsDir = path.join(__dirname, "../backups");

// --- tunable constants -----------------------------------------------

// Per-category minimum area to count as a "meaningfully visitable green
// space" rather than a street planter or median. climbing/birdwatching/tree
// are exempt entirely — legitimately point-scale by nature, and the app's
// curated niche categories. Starting estimates, meant to be refined against
// this report's example lists, not treated as ground truth on the first run.
const JUNK_AREA_THRESHOLD_M2 = {
  park: 2000,
  garden: 300,
  other: 2000,
};

// Categories eligible to merge into each other as containment parent/child.
// climbing/birdwatching/tree are deliberately excluded in both directions —
// confirmed with the user: these are the app's curated niche pins and stay
// their own pin even when spatially inside a larger green space.
const MERGEABLE_CATEGORIES = new Set(["park", "garden", "other"]);

// A fixed radius undershoots for genuinely large complexes: Brooklyn Botanic
// Garden's own sub-gardens (Cherry Esplanade, Rock Garden, etc.) range up to
// ~575m from BBG's centroid — a flat 200-300m only catches half of them.
// Scale the radius with the parent's own footprint instead: treat its area
// as a circle and add a buffer, floored so small/mid parks keep a sane
// minimum reach and capped so PARENT_MAX_AREA_M2-sized parents don't sprawl
// into unrelated neighborhoods.
const CONTAINMENT_RADIUS_FLOOR_M = 150;
const CONTAINMENT_RADIUS_CAP_M = 600;
const CONTAINMENT_RADIUS_AREA_FACTOR = 1.4;

function effectiveRadiusM(parentAreaM2) {
  const circularRadius = Math.sqrt(parentAreaM2 / Math.PI) * CONTAINMENT_RADIUS_AREA_FACTOR;
  return Math.min(Math.max(circularRadius, CONTAINMENT_RADIUS_FLOOR_M), CONTAINMENT_RADIUS_CAP_M);
}

// Parent must be at least this many times larger than the child by area —
// the primary "relative size" signal (see plan: name similarity alone would
// miss the motivating case, since sub-feature names like "Rose Garden" don't
// share a substring with their parent's name).
const RELATIVE_SIZE_RATIO = 3;
// Above this, a single named OSM relation is something like a national
// forest or wilderness area, not a compact "park" a centroid-radius check
// can meaningfully reason about — its centroid isn't a reliable proxy for
// "things spatially inside it," so it's excluded from parent-candidacy
// entirely rather than risk falsely swallowing unrelated nearby spots.
const PARENT_MAX_AREA_M2 = 500_000; // 50 hectares

// Second matching tier for the exact Brooklyn Botanic Garden case: BBG
// itself is Socrata-sourced (`official`), which never gets OSM polygon
// geometry, and its named sub-gardens are OSM *nodes* (points), which never
// get area either — so neither side of that pair has area_m2 at all, and
// the relative-size signal above has nothing to compare. Fall back to local
// density: whichever unclaimed no-area spot has the most same-category
// neighbors within radius is treated as the cluster's hub/parent, with a
// same-source='official' preference (a curated named entity is a much more
// plausible real parent than another anonymous OSM POI). Flat radius, wider
// than the area-scaled floor above, since this case is specifically aimed
// at larger named landmark complexes, not small unrelated pairs — the
// MIN_SIZE gate (a real cluster, not a coincidental pair) is what keeps
// this from over-triggering.
const NO_AREA_CLUSTER_RADIUS_M = 400;
const NO_AREA_CLUSTER_MIN_SIZE = 3;
const OFFICIAL_SOURCE_HUB_BONUS = 2;

const REPORT_EXAMPLE_CAP = 30;

// --- file resolution ----------------------------------------------------

function resolveLatest(prefix, explicitArg) {
  if (explicitArg) return explicitArg;
  const files = readdirSync(backupsDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort();
  if (files.length === 0) {
    console.error(`No backups/${prefix}*.json found.`);
    process.exit(1);
  }
  return path.join(backupsDir, files[files.length - 1]);
}

const backupArg = process.argv.find((a) => a.startsWith("--backup="))?.replace("--backup=", "");
const areasArg = process.argv.find((a) => a.startsWith("--areas="))?.replace("--areas=", "");

// --- name similarity (report annotation only, never a merge gate) -------

function normalizeName(name) {
  return (name ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function nameSimilarity(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return "low";
  if (na === nb || na.includes(nb) || nb.includes(na)) return "high";

  const wa = new Set(na.split(/\s+/).filter((w) => w.length > 2));
  const wb = new Set(nb.split(/\s+/).filter((w) => w.length > 2));
  const intersection = [...wa].filter((w) => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  const jaccard = union === 0 ? 0 : intersection / union;
  return jaccard >= 0.4 ? "medium" : "low";
}

function sqlEscape(str) {
  return str.replace(/'/g, "''");
}

// --- size filter ----------------------------------------------------------

function runSizeFilter(spots) {
  const flagged = [];
  let noAreaDataCount = 0;
  const byCategory = {};

  for (const spot of spots) {
    const threshold = JUNK_AREA_THRESHOLD_M2[spot.category];
    if (threshold === undefined) continue; // exempt category

    if (spot.area_m2 === null || spot.area_m2 === undefined) {
      noAreaDataCount++;
      continue;
    }

    byCategory[spot.category] ??= { threshold_m2: threshold, flagged: 0, evaluated: 0 };
    byCategory[spot.category].evaluated++;

    if (spot.area_m2 < threshold) {
      byCategory[spot.category].flagged++;
      flagged.push(spot);
    }
  }

  return { flagged, noAreaDataCount, byCategory };
}

// --- containment / duplicate collapsing ------------------------------------

function runContainment(spots) {
  const mergeable = spots.filter((s) => s.status === "verified" && MERGEABLE_CATEGORIES.has(s.category));
  const childOf = new Map(); // childId -> { parent, distance_m, matched_by }
  const ambiguous = new Map(); // childId -> [parentId, ...] beyond the first

  function assignChild(candidate, parent, distance, matchedBy) {
    if (childOf.has(candidate.id)) {
      ambiguous.set(candidate.id, [
        ...(ambiguous.get(candidate.id) ?? [childOf.get(candidate.id).parent.id]),
        parent.id,
      ]);
      return; // first (largest / highest-degree) parent wins, per the tie-break rule
    }
    childOf.set(candidate.id, { parent, distance_m: Math.round(distance), matched_by: matchedBy });
  }

  // Tier 1: area-based relative size, largest parent first. Handles the
  // ordinary OSM-way-vs-OSM-way case (e.g. Jordan Park absorbing its named
  // sub-gardens).
  const areaParents = mergeable
    .filter((s) => s.area_m2 !== null && s.area_m2 !== undefined && s.area_m2 <= PARENT_MAX_AREA_M2)
    .sort((a, b) => b.area_m2 - a.area_m2);

  for (const parent of areaParents) {
    if (childOf.has(parent.id)) continue; // a child can't also be a parent in this pass
    const radius = effectiveRadiusM(parent.area_m2);

    for (const candidate of mergeable) {
      if (candidate.id === parent.id) continue;
      const distance = haversineDistanceMeters(parent.lat, parent.lng, candidate.lat, candidate.lng);
      if (distance > radius) continue;

      const candidateArea = candidate.area_m2 ?? null;
      const sizeQualifies =
        candidateArea === null || parent.area_m2 >= RELATIVE_SIZE_RATIO * candidateArea;
      if (!sizeQualifies) continue;

      assignChild(candidate, parent, distance, "area");
    }
  }

  // Tier 2: neither side has area data — the Brooklyn Botanic Garden case.
  // BBG is `official`-sourced (no OSM polygon ever backfills it), and its
  // named sub-gardens are OSM *nodes* (points, no area by definition), so
  // tier 1 has nothing to compare. Local same-category density substitutes
  // for the missing size signal.
  const remaining = mergeable.filter((s) => (s.area_m2 === null || s.area_m2 === undefined) && !childOf.has(s.id));
  const degreeOf = (spot) =>
    remaining.filter(
      (other) => other.id !== spot.id && haversineDistanceMeters(spot.lat, spot.lng, other.lat, other.lng) <= NO_AREA_CLUSTER_RADIUS_M
    ).length;

  const hubCandidates = remaining
    .map((spot) => ({ spot, degree: degreeOf(spot) }))
    .filter((h) => h.degree >= NO_AREA_CLUSTER_MIN_SIZE)
    .sort(
      (a, b) =>
        b.degree + (b.spot.source === "official" ? OFFICIAL_SOURCE_HUB_BONUS : 0) -
        (a.degree + (a.spot.source === "official" ? OFFICIAL_SOURCE_HUB_BONUS : 0))
    );

  for (const { spot: parent } of hubCandidates) {
    if (childOf.has(parent.id)) continue;
    for (const candidate of remaining) {
      if (candidate.id === parent.id || childOf.has(candidate.id)) continue;
      const distance = haversineDistanceMeters(parent.lat, parent.lng, candidate.lat, candidate.lng);
      if (distance > NO_AREA_CLUSTER_RADIUS_M) continue;
      assignChild(candidate, parent, distance, "density");
    }
  }

  const groups = new Map(); // parentId -> { parent, children: [] }
  for (const [childId, { parent, distance_m, matched_by }] of childOf) {
    const child = mergeable.find((s) => s.id === childId);
    if (!groups.has(parent.id)) groups.set(parent.id, { parent, children: [] });
    groups.get(parent.id).children.push({
      id: child.id,
      name: child.name,
      category: child.category,
      area_m2: child.area_m2,
      distance_m,
      matched_by,
      name_similarity: nameSimilarity(parent.name, child.name),
    });
  }

  // Niche categories deliberately excluded from merging, even when spatially
  // close to a qualifying parent — sampled here so the report can confirm
  // the exclusion rule is actually behaving as intended, not silently doing
  // nothing.
  const excludedExamples = [];
  const allParentCandidates = [...areaParents, ...hubCandidates.map((h) => h.spot)];
  const niche = spots.filter((s) => s.status === "verified" && !MERGEABLE_CATEGORIES.has(s.category));
  for (const spot of niche) {
    if (excludedExamples.length >= 10) break;
    for (const parent of allParentCandidates) {
      const radius = parent.area_m2 != null ? effectiveRadiusM(parent.area_m2) : NO_AREA_CLUSTER_RADIUS_M;
      const distance = haversineDistanceMeters(parent.lat, parent.lng, spot.lat, spot.lng);
      if (distance <= radius) {
        excludedExamples.push({
          id: spot.id,
          name: spot.name,
          category: spot.category,
          near_parent: parent.name,
          distance_m: Math.round(distance),
        });
        break;
      }
    }
  }

  return { groups: [...groups.values()], ambiguousCount: ambiguous.size, excludedExamples };
}

// --- main -------------------------------------------------------------

function main() {
  const backupPath = resolveLatest("spots-backup-", backupArg);
  const areasPath = resolveLatest("area-backfill-", areasArg);
  console.log(`Backup: ${backupPath}`);
  console.log(`Areas:  ${areasPath}`);

  const backup = JSON.parse(readFileSync(backupPath, "utf-8"));
  const areas = JSON.parse(readFileSync(areasPath, "utf-8"));
  const areaById = new Map(areas.areas.map((a) => [a.id, a.area_m2]));

  const spots = backup.spots.map((s) => ({ ...s, area_m2: areaById.get(s.id) ?? null }));

  const sizeResult = runSizeFilter(spots);
  const containmentResult = runContainment(spots);

  const childIds = new Set(containmentResult.groups.flatMap((g) => g.children.map((c) => c.id)));
  const totalChildren = childIds.size;

  // --- report ---
  const report = {
    generated_at: new Date().toISOString(),
    source_backup: backupPath,
    source_areas: areasPath,
    total_rows_scanned: spots.length,
    size_filter: {
      would_flag_junk_count: sizeResult.flagged.length,
      by_category: sizeResult.byCategory,
      no_area_data_count: sizeResult.noAreaDataCount,
      examples: sizeResult.flagged.slice(0, REPORT_EXAMPLE_CAP).map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        area_m2: s.area_m2,
        lat: s.lat,
        lng: s.lng,
        external_id: s.external_id,
      })),
    },
    containment: {
      would_collapse_groups_count: containmentResult.groups.length,
      would_collapse_children_count: totalChildren,
      ambiguous_multi_parent_count: containmentResult.ambiguousCount,
      groups: containmentResult.groups
        .sort((a, b) => b.children.length - a.children.length)
        .map((g) => ({
          parent: {
            id: g.parent.id,
            name: g.parent.name,
            category: g.parent.category,
            area_m2: g.parent.area_m2,
            lat: g.parent.lat,
            lng: g.parent.lng,
          },
          children: g.children,
        })),
      excluded_by_category_examples: containmentResult.excludedExamples,
    },
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(backupsDir, `dedup-report-${timestamp}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // --- human-readable summary ---
  const lines = [];
  lines.push(`# Dedup cleanup dry-run — ${report.generated_at}`);
  lines.push("");
  lines.push(`Source: ${backupPath}`);
  lines.push(`Areas:  ${areasPath}`);
  lines.push(`Total rows scanned: ${report.total_rows_scanned}`);
  lines.push("");
  lines.push("## Size filter");
  lines.push(`Would flag as junk (status -> 'rejected'): ${sizeResult.flagged.length}`);
  for (const [cat, stats] of Object.entries(sizeResult.byCategory)) {
    lines.push(`  ${cat}: ${stats.flagged}/${stats.evaluated} below ${stats.threshold_m2} m²`);
  }
  lines.push(`No area data (exempt from size filter): ${sizeResult.noAreaDataCount}`);
  lines.push("");
  lines.push("### Junk examples (first 30)");
  for (const s of report.size_filter.examples) {
    lines.push(`  - [${s.category}] "${s.name}" — ${Math.round(s.area_m2)} m² (${s.lat}, ${s.lng}, ${s.external_id})`);
  }
  lines.push("");
  lines.push("## Containment / duplicate collapsing");
  lines.push(`Would collapse into: ${containmentResult.groups.length} parent groups`);
  lines.push(`Total children merged (status -> 'merged'): ${totalChildren}`);
  lines.push(`Ambiguous multi-parent matches (kept largest, flagged here for review): ${containmentResult.ambiguousCount}`);
  lines.push("");
  lines.push("### Groups (largest first)");
  for (const g of report.containment.groups) {
    lines.push(`  - "${g.parent.name}" [${g.parent.category}, ${Math.round(g.parent.area_m2)} m²] absorbs:`);
    for (const c of g.children) {
      lines.push(`      - "${c.name}" [${c.category}] ${c.distance_m}m away, matched_by=${c.matched_by}, name_similarity=${c.name_similarity}`);
    }
  }
  lines.push("");
  lines.push("### Excluded-by-category examples (niche spots deliberately NOT merged)");
  for (const e of containmentResult.excludedExamples) {
    lines.push(`  - [${e.category}] "${e.name}" ${e.distance_m}m from "${e.near_parent}" — kept separate`);
  }
  const summaryPath = path.join(backupsDir, `dedup-report-${timestamp}.md`);
  writeFileSync(summaryPath, lines.join("\n") + "\n");

  // --- generated SQL (not applied) ---
  const sqlLines = [];
  sqlLines.push(`-- Generated by scripts/dedup-cleanup.mjs from ${backupPath}`);
  sqlLines.push(`-- Requires supabase/schema.sql's area_m2/features/merged_into columns and`);
  sqlLines.push(`-- 'rejected'/'merged' status values to already exist live.`);
  sqlLines.push(`-- Not applied automatically — review this file and the .md report, then paste`);
  sqlLines.push(`-- into the Supabase SQL Editor after sign-off.`);
  sqlLines.push("");
  sqlLines.push("-- Junk spots (size filter)");
  for (const s of sizeResult.flagged) {
    sqlLines.push(`update spots set status = 'rejected' where id = '${s.id}'; -- ${sqlEscape(s.name)}, ${Math.round(s.area_m2)} m²`);
  }
  sqlLines.push("");
  sqlLines.push("-- Duplicate collapsing (children)");
  for (const g of report.containment.groups) {
    for (const c of g.children) {
      sqlLines.push(
        `update spots set status = 'merged', merged_into = '${g.parent.id}' where id = '${c.id}'; -- "${sqlEscape(c.name)}" into "${sqlEscape(g.parent.name)}"`
      );
    }
  }
  sqlLines.push("");
  sqlLines.push("-- Duplicate collapsing (parent features)");
  for (const g of report.containment.groups) {
    const featureList = g.children.map((c) => `'${sqlEscape(c.name)}'`).join(", ");
    sqlLines.push(`update spots set features = array[${featureList}] where id = '${g.parent.id}'; -- ${sqlEscape(g.parent.name)}`);
  }
  const sqlPath = path.join(backupsDir, `dedup-cleanup-${timestamp}.sql`);
  writeFileSync(sqlPath, sqlLines.join("\n") + "\n");

  console.log("");
  console.log(`Junk flagged: ${sizeResult.flagged.length} (no area data for ${sizeResult.noAreaDataCount} rows)`);
  console.log(`Merge groups: ${containmentResult.groups.length}, children: ${totalChildren}, ambiguous: ${containmentResult.ambiguousCount}`);
  console.log("");
  console.log(`Report (JSON): ${reportPath}`);
  console.log(`Report (readable): ${summaryPath}`);
  console.log(`Generated SQL (not applied): ${sqlPath}`);
}

main();
