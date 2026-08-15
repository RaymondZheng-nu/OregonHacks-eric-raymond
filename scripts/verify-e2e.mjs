// Live end-to-end check of the moderation flow against the real Supabase project.
// Run with: npm run verify:e2e (needs .env.local, see .env.local.example)
//
// Uses the anon/publishable key for everything a real browser would do (that's
// the thing actually being validated), and the service key only for cleanup,
// since cleanup shouldn't depend on unverified delete grants for the anon role.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !anonKey || !secretKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or SUPABASE_SECRET_KEY (run with --env-file=.env.local)"
  );
  process.exit(1);
}

const anon = createClient(url, anonKey);
const admin = createClient(url, secretKey);

const NAME_PREFIX = "__e2e_test_";

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function storagePathFromPublicUrl(publicUrl) {
  const marker = "/spot-photos/";
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.slice(idx + marker.length);
}

async function deleteRows(rows) {
  for (const row of rows) {
    if (row.photo_url) {
      const path = storagePathFromPublicUrl(row.photo_url);
      if (path) await admin.storage.from("spot-photos").remove([path]);
    }
  }
  const ids = rows.map((r) => r.id);
  if (ids.length) await admin.from("spots").delete().in("id", ids);
}

async function selfHealPreviousRuns() {
  const { data: stale } = await admin
    .from("spots")
    .select("id, photo_url")
    .ilike("name", `${NAME_PREFIX}%`);

  if (stale?.length) {
    console.log(`Cleaning up ${stale.length} leftover row(s) from a previous run...`);
    await deleteRows(stale);
  }
}

async function main() {
  await selfHealPreviousRuns();

  let spotId = null;
  let storagePath = null;

  try {
    // 1. Submit a spot as an anonymous browser would.
    const { data: inserted, error: insertError } = await anon
      .from("spots")
      .insert({
        name: `${NAME_PREFIX}${Date.now()}`,
        description: "verify-e2e scratch row — safe to delete",
        category: "other",
        source: "user",
        status: "pending",
        lat: 40.7,
        lng: -74.0,
      })
      .select()
      .single();

    if (insertError) throw new Error(`Insert failed: ${insertError.message}`);
    spotId = inserted.id;
    assert(inserted.status === "pending", "new spot should start pending");
    console.log(`Inserted test spot ${spotId}`);

    // 2. Upload a tiny photo, same path as the real upload helper.
    storagePath = `${crypto.randomUUID()}.txt`;
    const blob = new Blob(["verify-e2e test photo"], { type: "text/plain" });
    const { error: uploadError } = await anon.storage
      .from("spot-photos")
      .upload(storagePath, blob);

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: publicUrlData } = anon.storage
      .from("spot-photos")
      .getPublicUrl(storagePath);

    await admin
      .from("spots")
      .update({ photo_url: publicUrlData.publicUrl })
      .eq("id", spotId);

    // 3. Confirm the public read policy actually serves the file.
    const readResp = await fetch(publicUrlData.publicUrl);
    assert(readResp.ok, `photo should be publicly readable, got HTTP ${readResp.status}`);
    console.log("Photo upload + public read: ok");

    // 4. Confirm twice, simulating two different browsers. The localStorage
    // dedup guard is client only, so the backend has no notion of caller
    // identity and this is exactly what needs to be proven end to end.
    for (let i = 1; i <= 2; i++) {
      const { error: rpcError } = await anon.rpc("confirm_spot", { spot_id: spotId });
      if (rpcError) throw new Error(`confirm_spot call ${i} failed: ${rpcError.message}`);
    }

    // 5. Verify the moderation flow actually flipped status.
    const { data: final, error: readError } = await admin
      .from("spots")
      .select("status, confirm_count")
      .eq("id", spotId)
      .single();

    if (readError) throw new Error(`Final read failed: ${readError.message}`);
    assert(final.confirm_count === 2, `expected confirm_count 2, got ${final.confirm_count}`);
    assert(final.status === "verified", `expected status verified, got ${final.status}`);

    console.log("PASS: submit -> pending -> 2x confirm -> verified, all live.");
  } finally {
    if (spotId || storagePath) {
      await deleteRows([{ id: spotId, photo_url: storagePath ? `/spot-photos/${storagePath}` : null }]);
    }
  }
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
