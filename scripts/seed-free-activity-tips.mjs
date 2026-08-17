// Hand-curated starter tips for a handful of well-known spots, so the free
// activity tips feature isn't empty on first demo. Not scraped from
// anywhere — real, well-known recurring programs at real institutions,
// deliberately hedged ("check current schedule") instead of asserting
// specific dates we can't verify. Matched to spots by exact name + real-world
// coordinates (checked live against the DB before writing this list — several
// cities have a same-named park, e.g. ~10 "Central Park"s in the US).
//
// Inserted as status: 'verified' directly (bypassing the 2-confirm gate),
// same treatment official parks data already gets on ingestion — this is
// founder-seeded content, not a public submission working through moderation.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (run with --env-file=.env.local)");
  process.exit(1);
}
const supabase = createClient(url, secretKey);

const TIPS = [
  {
    spotId: "3ba5defa-a95d-4dcc-9146-803c5f00c861", // Central Park, Manhattan
    tip: "Free Shakespeare in the Park performances run some summers at the Delacorte Theater — check publictheater.org for the current season.",
    sourceUrl: "https://www.publictheater.org/programs/shakespeare-in-the-park/",
  },
  {
    spotId: "9a9d99f8-9054-4c98-980f-09779d6a2a9d", // Prospect Park, Brooklyn
    tip: "Celebrate Brooklyn! puts on free outdoor concerts and films at the bandshell most summers — check bricartsmedia.org for the current lineup.",
    sourceUrl: "https://www.bricartsmedia.org/celebrate-brooklyn",
  },
  {
    spotId: "ec9191f8-1e16-42bf-bcb3-564ea55aab8d", // International Rose Test Garden, Portland
    tip: "Always free to walk through, even at peak bloom — no admission charged.",
    sourceUrl: "https://www.portland.gov/parks/international-rose-test-garden",
  },
  {
    spotId: "62f4eb73-4bcd-42c0-8a0a-ed7ba866b903", // Forest Park, Portland
    tip: "Portland Parks & Recreation runs free guided nature walks through the park — check portland.gov/parks for the current schedule.",
    sourceUrl: "https://www.portland.gov/parks",
  },
  {
    spotId: "25be571d-9629-4f13-a072-67b7857f8965", // Governor Tom McCall Waterfront Park, Portland
    tip: "Hosts free public festivals and events along the waterfront through the year — check the city events calendar for what's on.",
    sourceUrl: "https://www.portland.gov/parks",
  },
];

async function main() {
  let inserted = 0;
  let skipped = 0;

  for (const { spotId, tip, sourceUrl } of TIPS) {
    // Confirms the spot id is still real/verified before attaching a tip to
    // it — ids are hardcoded above and could go stale if a spot gets merged.
    const { data: spot } = await supabase
      .from("spots")
      .select("id, name")
      .eq("id", spotId)
      .eq("status", "verified")
      .maybeSingle();

    if (!spot) {
      console.error(`Skipping — spot ${spotId} not found or not verified`);
      skipped++;
      continue;
    }

    const { error } = await supabase.from("free_activity_tips").insert({
      spot_id: spotId,
      tip,
      source_url: sourceUrl,
      status: "verified",
      confirm_count: 2,
    });

    if (error) {
      console.error(`Failed on ${spot.name}: ${error.message}`);
      skipped++;
      continue;
    }
    console.log(`Inserted tip for ${spot.name}`);
    inserted++;
  }

  console.log(`Done. inserted=${inserted} skipped=${skipped}`);
}

main();
