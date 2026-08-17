// Searches Reddit's public (unauthenticated) search endpoint for a mention
// of each spot and attaches the top real match as a citation — a permalink
// + snippet, never a fabricated quote. Enriches existing rows, doesn't
// insert new ones.
//
// Usage: node --env-file=.env.local scripts/ingest-reddit-citations.mjs --limit=25

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (run with --env-file=.env.local)");
  process.exit(1);
}

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.replace("--limit=", "")) : 25;
if (!Number.isFinite(limit) || limit <= 0) {
  console.error("Invalid --limit — expected a positive number");
  process.exit(1);
}

const supabase = createClient(url, secretKey);

const REDDIT_SEARCH_URL = "https://www.reddit.com/search.json";
const FETCH_TIMEOUT_MS = 30_000;
const USER_AGENT = "NearbyNature/1.0 (OregonHacks hackathon project)";

// Stopwords stripped before the overlap check — otherwise "Park"/"Garden"
// alone would count as a match against nearly anything.
const STOPWORDS = new Set(["park", "garden", "the", "of", "and", "at", "trail", "preserve", "reserve"]);

function significantWords(name) {
  return name
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// Real match, not a guess: require at least one non-generic word from the
// spot name to actually appear in the post title. A hit on "park" alone
// isn't enough to cite — too many false positives.
function isRelevantMatch(spotName, postTitle) {
  const words = significantWords(spotName);
  if (words.length === 0) return false;
  const title = postTitle.toLowerCase();
  return words.some((w) => title.includes(w));
}

let citationColumnsMissing = false;

async function searchReddit(query) {
  const params = new URLSearchParams({ q: query, limit: "5", sort: "relevance" });
  const res = await fetch(`${REDDIT_SEARCH_URL}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`reddit search failed: HTTP ${res.status}`);
  const json = await res.json();
  return (json.data?.children ?? []).map((c) => c.data);
}

async function main() {
  const { data: spots, error } = await supabase
    .from("spots")
    .select("id, name, confirm_count")
    .eq("status", "verified")
    .is("reddit_citation_url", null)
    .order("confirm_count", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`Failed to fetch candidate spots: ${error.message}`);
    process.exit(1);
  }

  console.log(`Checking ${spots.length} spots for Reddit mentions...`);

  let cited = 0;
  let noMatch = 0;
  let skippedSearchError = 0;

  for (const spot of spots) {
    if (citationColumnsMissing) break;

    let posts;
    try {
      posts = await searchReddit(spot.name);
    } catch (err) {
      console.error(`  skipping "${spot.name}": ${err.message}`);
      skippedSearchError++;
      continue;
    }

    const match = posts.find((p) => isRelevantMatch(spot.name, p.title));
    if (!match) {
      noMatch++;
      continue;
    }

    const { error: updateError } = await supabase
      .from("spots")
      .update({
        reddit_citation_url: `https://reddit.com${match.permalink}`,
        reddit_citation_snippet: match.title,
        reddit_citation_subreddit: match.subreddit,
      })
      .eq("id", spot.id);

    // PGRST204: columns not migrated yet — stop trying for the rest of this run.
    if (updateError?.code === "PGRST204") {
      citationColumnsMissing = true;
      console.error(`  citation columns not live yet (${updateError.message}) — has the migration run?`);
      break;
    }

    if (updateError) {
      console.error(`  failed to save citation for "${spot.name}": ${updateError.message}`);
      continue;
    }

    console.log(`  cited "${spot.name}" -> r/${match.subreddit}`);
    cited++;
  }

  console.log(`Done. cited=${cited} no_match=${noMatch} skipped(search error)=${skippedSearchError} checked=${spots.length}`);
  console.log("Spot-check these before the demo — fuzzy title matching can surface an irrelevant thread.");
}

main();
