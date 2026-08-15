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

const { data, error } = await supabase.from("spots").insert(spots).select();

if (error) {
  console.error("Seed failed:", error.message);
  process.exit(1);
}

console.log(`Seeded ${data.length} spots.`);
