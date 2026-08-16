// Offline dry-run for the spots data-quality cleanup: junk-sized spots,
// nested/duplicate spots, and tag-schema backfill (see plan doc). Reads ONLY
// local backup files — never touches the live database, reads or writes.
// Produces a human-readable report and a generated SQL file of targeted,
// id-keyed UPDATE statements for later review and manual paste into the
// Supabase SQL Editor — this script does not apply anything.
//
// Usage: node scripts/dedup-cleanup.mjs
//   [--backup=backups/spots-backup-....json]
//   [--areas=backups/area-backfill-....json]

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { haversineDistanceMeters, pointInPolygon } from "../src/lib/geo.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backupsDir = path.join(__dirname, "../backups");

// --- tunable constants -----------------------------------------------

// Two tiers, replacing a single delete-or-keep floor: below the (much
// lower) reject floor is genuine junk — a street planter, a median, roughly
// Sherman-Square scale (33 m², confirmed junk). Above it, up to the old
// higher floor, is a real small place (a pocket park, a community garden)
// that gets RECATEGORIZED (size_class='small'), not deleted. `garden` has
// no reject floor at all — community gardens are never junk, per explicit
// instruction, taken at face value rather than second-guessed here.
const HARD_REJECT_FLOOR_M2 = { park: 150, other: 150 };

// size_class bands, independent of the reject decision — computed for every
// spot with known area, not just ones near a threshold. Gardens are
// categorically smaller places even at their high end, so their bands sit
// lower than park/other's.
const SIZE_CLASS_BANDS = {
  park: { small: 2000, medium: 20000 },
  other: { small: 2000, medium: 20000 },
  garden: { small: 300, medium: 3000 },
};

// Categories eligible to merge into each other as containment parent/child.
// climbing/birdwatching/tree are deliberately excluded in both directions —
// confirmed with the user: these are the app's curated niche pins and stay
// their own pin even when spatially inside a larger green space.
const MERGEABLE_CATEGORIES = new Set(["park", "garden", "other"]);

// Radius is now only a cheap PRE-FILTER before the real point-in-polygon
// containment test below, not the containment decision itself — testing
// every spot against every polygon directly would be ~38M pairs on this
// dataset. A generous buffer here just bounds the candidate set; missing a
// genuinely contained point on a very elongated polygon because it falls
// outside this buffer is an acceptable false negative given this whole pass
// errs toward under-merging, not over-merging.
const CONTAINMENT_RADIUS_FLOOR_M = 150;
const CONTAINMENT_RADIUS_CAP_M = 600;
const CONTAINMENT_RADIUS_AREA_FACTOR = 1.4;

function effectiveRadiusM(parentAreaM2) {
  const circularRadius = Math.sqrt(parentAreaM2 / Math.PI) * CONTAINMENT_RADIUS_AREA_FACTOR;
  return Math.min(Math.max(circularRadius, CONTAINMENT_RADIUS_FLOOR_M), CONTAINMENT_RADIUS_CAP_M);
}

// Secondary check, cheap defense-in-depth now that polygon containment is
// the primary gate — a contained point should almost never fail this too.
const RELATIVE_SIZE_RATIO = 3;
// Above this, a single named OSM relation is something like a national
// forest or wilderness area — excluded from parent-candidacy entirely, same
// reasoning as before (its own bulk doesn't change; only the containment
// test changed).
const PARENT_MAX_AREA_M2 = 500_000; // 50 hectares

// Second matching tier for the exact Brooklyn Botanic Garden case: BBG
// itself is Socrata-sourced (`official`), which never gets OSM polygon
// geometry, and its named sub-gardens are OSM *nodes* (points), which never
// get area either — so neither side of that pair has area_m2 or a polygon
// to test containment against. Local density substitutes for the missing
// signal. Confirmed correct by the user — unchanged from the prior pass.
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

// --- name similarity (containment guard + report annotation) ------------

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
  return String(str).replace(/'/g, "''");
}

function sqlString(str) {
  return str == null ? "null" : `'${sqlEscape(str)}'`;
}

function sqlArray(arr) {
  if (!arr || arr.length === 0) return "null";
  return `array[${arr.map((v) => `'${sqlEscape(v)}'`).join(", ")}]`;
}

// --- tag schema computation -----------------------------------------------
// Every field here is either a direct measurement (size_class, from area),
// a direct 1:1 OSM tag mapping (amenities, accessibility), or category
// itself (activity_fit for climbing/birdwatching). Nothing is invented —
// see the plan's Part E table for the source of each field and why `mood`
// has no column at all.

function computeSizeClass(category, areaM2) {
  const bands = SIZE_CLASS_BANDS[category];
  if (!bands || areaM2 == null) return null;
  if (areaM2 < bands.small) return "small";
  if (areaM2 < bands.medium) return "medium";
  return "large";
}

// Structurally sparse by design: benches/restrooms are almost always mapped
// as separate point features inside a polygon in OSM, not tags on the
// polygon itself, so they stay null for nearly every row — that's an honest
// reflection of what the data has, not a bug.
function computeAmenities(tags, category) {
  if (!tags) return null;
  const amenities = [];
  if (tags.natural === "water" || tags.water) amenities.push("water_feature");
  if (tags.surface === "grass") amenities.push("open_lawn");
  // leisure=sports_centre is OSM's tag for an indoor commercial facility —
  // distinguishes climbing gyms from outdoor crags/boulders, which don't
  // carry this tag. Gated to category === "climbing": sports_centre also
  // covers non-climbing facilities (pools, general fitness centres) that
  // would otherwise get mislabeled "indoor_gym" too.
  if (category === "climbing" && tags.leisure === "sports_centre") amenities.push("indoor_gym");
  return amenities.length > 0 ? amenities : null;
}

function computeAccessibility(tags) {
  if (!tags || !tags.wheelchair) return null;
  return tags.wheelchair; // 'yes' | 'no' | 'limited', straight from OSM
}

// Size is the backbone (a real measurement, so it's the default); real OSM
// tags override it where they'd contradict it, so this never asserts
// something a known tag disproves. See the plan's "Activity model" section.
const SIZE_ACTIVITY_DEFAULTS = {
  small: ["lounge"],
  medium: ["walk"],
  large: ["walk", "sports"],
};

function computeActivityFit(category, sizeClass, tags) {
  if (category === "climbing") return ["climb"];
  if (category === "birdwatching") return ["birdwatch"];
  if (category === "tree") return null; // no vocabulary entry, no area to derive from either

  let result = sizeClass ? [...SIZE_ACTIVITY_DEFAULTS[sizeClass]] : [];

  const hasSportTag = tags && (tags.sport || tags.leisure === "playground" || tags.leisure === "pitch");
  const isProtectedNature =
    tags && (tags.leisure === "nature_reserve" || tags.natural === "wetland" || tags.boundary === "protected_area");

  if (hasSportTag && !result.includes("sports")) result.push("sports");
  if (isProtectedNature) result = result.filter((a) => a !== "sports");

  return result.length > 0 ? result : null;
}

// --- size filter + tagging -------------------------------------------------

// `excludeIds` are rows already claimed as a merge child by the containment
// pass — a positively-identified real sub-feature is a stronger signal than
// "under the area floor," and preserving it via the parent's features list
// takes precedence over independently rejecting or tagging the same row.
function runSizeAndTagging(spots, excludeIds) {
  const rejected = [];
  const tagged = [];
  let noAreaDataCount = 0;
  const byCategory = {};

  for (const spot of spots) {
    if (spot.status !== "verified") continue;
    if (excludeIds.has(spot.id)) continue;

    const rejectFloor = HARD_REJECT_FLOOR_M2[spot.category];
    if (rejectFloor !== undefined) {
      if (spot.area_m2 == null) {
        noAreaDataCount++;
      } else {
        byCategory[spot.category] ??= { reject_floor_m2: rejectFloor, rejected: 0, evaluated: 0 };
        byCategory[spot.category].evaluated++;
        if (spot.area_m2 < rejectFloor) {
          byCategory[spot.category].rejected++;
          rejected.push(spot);
          continue; // rejected spots aren't tagged — they won't render anyway
        }
      }
    }

    const size_class = computeSizeClass(spot.category, spot.area_m2);
    const amenities = computeAmenities(spot.tags, spot.category);
    const accessibility = computeAccessibility(spot.tags);
    const activity_fit = computeActivityFit(spot.category, size_class, spot.tags);

    if (size_class || amenities || accessibility || activity_fit) {
      tagged.push({ ...spot, size_class, amenities, accessibility, activity_fit });
    }
  }

  return { rejected, tagged, noAreaDataCount, byCategory };
}

// --- containment / duplicate collapsing ------------------------------------

function isContained(candidate, parent) {
  if (!parent.rings || parent.rings.length === 0) return false;
  const point = { lat: candidate.lat, lng: candidate.lng };
  return parent.rings.some((ring) => pointInPolygon(point, ring));
}

// Was this candidate a match under the OLD (radius + relative-size only)
// logic? Used purely to find the specific rows the fix corrects, for the
// would_reject_by_containment_examples report section — not a gate.
function matchedByOldRadiusLogic(parent, candidate) {
  const radius = effectiveRadiusM(parent.area_m2);
  const distance = haversineDistanceMeters(parent.lat, parent.lng, candidate.lat, candidate.lng);
  if (distance > radius) return false;
  const candidateArea = candidate.area_m2 ?? null;
  return candidateArea === null || parent.area_m2 >= RELATIVE_SIZE_RATIO * candidateArea;
}

function runContainment(spots) {
  const mergeable = spots.filter((s) => s.status === "verified" && MERGEABLE_CATEGORIES.has(s.category));
  const childOf = new Map(); // childId -> { parent, distance_m, matched_by }
  const ambiguous = new Map(); // childId -> [parentId, ...] beyond the first
  const correctedExamples = []; // rows the old logic would have merged, the new logic correctly excludes

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

  // Tier 1: real point-in-polygon containment (radius is only a pre-filter
  // now, see the constant's comment above). Handles the ordinary
  // OSM-way-vs-OSM-way case (Jordan Park absorbing its named sub-gardens)
  // while correctly excluding independent neighbors that used to slip in on
  // proximity alone (Brooklyn Bridge Park / Squibb Park etc.).
  const areaParents = mergeable
    .filter((s) => s.area_m2 !== null && s.area_m2 !== undefined && s.area_m2 <= PARENT_MAX_AREA_M2)
    .sort((a, b) => b.area_m2 - a.area_m2);

  for (const parent of areaParents) {
    if (childOf.has(parent.id)) continue; // a child can't also be a parent in this pass

    for (const candidate of mergeable) {
      if (candidate.id === parent.id) continue;
      if (!matchedByOldRadiusLogic(parent, candidate)) continue; // cheap pre-filter

      const contained = isContained(candidate, parent);
      const candidateArea = candidate.area_m2 ?? null;
      const similarity = nameSimilarity(parent.name, candidate.name);
      // Same-name/independent-parcel guard: an identical administrative
      // label (e.g. "MRCA Open Space") plus the candidate having its own
      // independently-surveyed area is evidence of a separate peer parcel,
      // not a sub-feature — never merge these into each other even if their
      // polygons happen to touch or overlap at an edge.
      const samePeerParcel = similarity === "high" && candidateArea !== null;

      if (!contained || samePeerParcel) {
        if (correctedExamples.length < 15) {
          correctedExamples.push({
            parent: parent.name,
            candidate: candidate.name,
            category: candidate.category,
            distance_m: Math.round(haversineDistanceMeters(parent.lat, parent.lng, candidate.lat, candidate.lng)),
            reason: !contained ? "outside_polygon" : "same_name_peer_parcel",
          });
        }
        continue;
      }

      const sizeQualifies = candidateArea === null || parent.area_m2 >= RELATIVE_SIZE_RATIO * candidateArea;
      if (!sizeQualifies) continue;

      assignChild(candidate, parent, haversineDistanceMeters(parent.lat, parent.lng, candidate.lat, candidate.lng), "area");
    }
  }

  // Tier 2: neither side has area data or a polygon to test — the BBG case.
  // Unchanged from the prior pass, confirmed correct by the user.
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
      contained: matched_by === "area" ? true : null,
      name_similarity: nameSimilarity(parent.name, child.name),
    });
  }

  // Niche categories deliberately excluded from merging, even when spatially
  // contained inside a qualifying parent's polygon — sampled here so the
  // report can confirm the exclusion rule is actually behaving as intended.
  const excludedExamples = [];
  const niche = spots.filter((s) => s.status === "verified" && !MERGEABLE_CATEGORIES.has(s.category));
  for (const spot of niche) {
    if (excludedExamples.length >= 10) break;

    const containingParent = areaParents.find((parent) => isContained(spot, parent));
    if (containingParent) {
      excludedExamples.push({
        id: spot.id,
        name: spot.name,
        category: spot.category,
        near_parent: containingParent.name,
        distance_m: Math.round(haversineDistanceMeters(containingParent.lat, containingParent.lng, spot.lat, spot.lng)),
      });
      continue;
    }

    const nearHub = hubCandidates.find(
      ({ spot: hub }) => haversineDistanceMeters(hub.lat, hub.lng, spot.lat, spot.lng) <= NO_AREA_CLUSTER_RADIUS_M
    );
    if (nearHub) {
      excludedExamples.push({
        id: spot.id,
        name: spot.name,
        category: spot.category,
        near_parent: nearHub.spot.name,
        distance_m: Math.round(haversineDistanceMeters(nearHub.spot.lat, nearHub.spot.lng, spot.lat, spot.lng)),
      });
    }
  }

  return {
    groups: [...groups.values()],
    ambiguousCount: ambiguous.size,
    excludedExamples,
    correctedExamples,
  };
}

// --- main -------------------------------------------------------------

function main() {
  const backupPath = resolveLatest("spots-backup-", backupArg);
  const areasPath = resolveLatest("area-backfill-", areasArg);
  console.log(`Backup: ${backupPath}`);
  console.log(`Areas:  ${areasPath}`);

  const backup = JSON.parse(readFileSync(backupPath, "utf-8"));
  const areas = JSON.parse(readFileSync(areasPath, "utf-8"));
  const areaById = new Map(areas.areas.map((a) => [a.id, a]));

  const spots = backup.spots.map((s) => {
    const info = areaById.get(s.id);
    return {
      ...s,
      area_m2: info?.area_m2 ?? null,
      rings: info?.rings ?? [],
      tags: info?.tags ?? {},
    };
  });

  // Containment runs first: its output (which rows are merge children) feeds
  // into the size/tag pass as an exclusion set, so the passes produce a
  // disjoint, ordering-independent result.
  const containmentResult = runContainment(spots);
  const childIds = new Set(containmentResult.groups.flatMap((g) => g.children.map((c) => c.id)));
  const totalChildren = childIds.size;

  const taggingResult = runSizeAndTagging(spots, childIds);

  // --- report ---
  const report = {
    generated_at: new Date().toISOString(),
    source_backup: backupPath,
    source_areas: areasPath,
    total_rows_scanned: spots.length,
    size_filter: {
      would_reject_count: taggingResult.rejected.length,
      would_tag_count: taggingResult.tagged.length,
      by_category: taggingResult.byCategory,
      no_area_data_count: taggingResult.noAreaDataCount,
      reject_examples: taggingResult.rejected.slice(0, REPORT_EXAMPLE_CAP).map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        area_m2: s.area_m2,
        lat: s.lat,
        lng: s.lng,
        external_id: s.external_id,
        amenities: computeAmenities(s.tags, s.category),
      })),
      tag_examples: taggingResult.tagged.slice(0, REPORT_EXAMPLE_CAP).map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        area_m2: s.area_m2,
        size_class: s.size_class,
        activity_fit: s.activity_fit,
        amenities: s.amenities,
        accessibility: s.accessibility,
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
      would_reject_by_containment_examples: containmentResult.correctedExamples,
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
  lines.push("## Size filter (recategorize, not delete)");
  lines.push(`Would reject as junk (status -> 'rejected'): ${taggingResult.rejected.length}`);
  for (const [cat, stats] of Object.entries(taggingResult.byCategory)) {
    lines.push(`  ${cat}: ${stats.rejected}/${stats.evaluated} below ${stats.reject_floor_m2} m² (hard-junk floor)`);
  }
  lines.push(`Would tag with size_class/activity_fit/amenities/accessibility: ${taggingResult.tagged.length}`);
  lines.push(`No area data (not evaluated for reject): ${taggingResult.noAreaDataCount}`);
  lines.push("");
  lines.push("### Reject examples (first 30) — genuine junk only");
  for (const s of report.size_filter.reject_examples) {
    lines.push(`  - [${s.category}] "${s.name}" — ${Math.round(s.area_m2)} m² (${s.lat}, ${s.lng}, ${s.external_id})${s.amenities ? ` amenities=${s.amenities.join(",")}` : ""}`);
  }
  lines.push("");
  lines.push("### Tagged examples (first 30) — kept, recategorized");
  for (const s of report.size_filter.tag_examples) {
    lines.push(
      `  - [${s.category}] "${s.name}" — size_class=${s.size_class ?? "—"} activity_fit=${s.activity_fit ? s.activity_fit.join(",") : "—"} amenities=${s.amenities ? s.amenities.join(",") : "—"} accessibility=${s.accessibility ?? "—"}`
    );
  }
  lines.push("");
  lines.push("## Containment / duplicate collapsing");
  lines.push(`Would collapse into: ${containmentResult.groups.length} parent groups`);
  lines.push(`Total children merged (status -> 'merged'): ${totalChildren}`);
  lines.push(`Ambiguous multi-parent matches (kept largest, flagged here for review): ${containmentResult.ambiguousCount}`);
  lines.push("");
  lines.push("### Groups (largest first)");
  for (const g of report.containment.groups) {
    const parentArea = g.parent.area_m2 != null ? `${Math.round(g.parent.area_m2)} m²` : "area unknown (density match)";
    lines.push(`  - "${g.parent.name}" [${g.parent.category}, ${parentArea}] absorbs:`);
    for (const c of g.children) {
      lines.push(`      - "${c.name}" [${c.category}] ${c.distance_m}m away, matched_by=${c.matched_by}, contained=${c.contained}, name_similarity=${c.name_similarity}`);
    }
  }
  lines.push("");
  lines.push("### Corrected by the containment fix (would have merged before, correctly excluded now)");
  for (const e of containmentResult.correctedExamples) {
    lines.push(`  - "${e.candidate}" [${e.category}] ${e.distance_m}m from "${e.parent}" — ${e.reason}`);
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
  sqlLines.push(`-- Requires supabase/schema.sql's area_m2/features/merged_into/size_class/`);
  sqlLines.push(`-- activity_fit/amenities/accessibility columns and 'rejected'/'merged' status`);
  sqlLines.push(`-- values to already exist live.`);
  sqlLines.push(`-- Not applied automatically — review this file and the .md report, then paste`);
  sqlLines.push(`-- into the Supabase SQL Editor after sign-off.`);
  sqlLines.push("");
  sqlLines.push("-- Junk spots (hard-junk floor only, real places recategorized instead below)");
  for (const s of taggingResult.rejected) {
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
  sqlLines.push("");
  sqlLines.push("-- Tag schema (size_class, activity_fit, amenities, accessibility)");
  for (const s of taggingResult.tagged) {
    sqlLines.push(
      `update spots set size_class = ${sqlString(s.size_class)}, activity_fit = ${sqlArray(s.activity_fit)}, amenities = ${sqlArray(s.amenities)}, accessibility = ${sqlString(s.accessibility)} where id = '${s.id}'; -- ${sqlEscape(s.name)}`
    );
  }
  const sqlPath = path.join(backupsDir, `dedup-cleanup-${timestamp}.sql`);
  writeFileSync(sqlPath, sqlLines.join("\n") + "\n");

  console.log("");
  console.log(`Rejected (genuine junk): ${taggingResult.rejected.length} (no area data for ${taggingResult.noAreaDataCount} rows)`);
  console.log(`Tagged (size_class/activity_fit/amenities/accessibility): ${taggingResult.tagged.length}`);
  console.log(`Merge groups: ${containmentResult.groups.length}, children: ${totalChildren}, ambiguous: ${containmentResult.ambiguousCount}`);
  console.log(`Corrected by containment fix: ${containmentResult.correctedExamples.length} example(s) shown`);
  console.log("");
  console.log(`Report (JSON): ${reportPath}`);
  console.log(`Report (readable): ${summaryPath}`);
  console.log(`Generated SQL (not applied): ${sqlPath}`);
}

main();
