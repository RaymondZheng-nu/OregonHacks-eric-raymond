// One-off retry for cities that failed on the first ingest-osm-cities.mjs
// pass (transient Overpass/resource issues, not real errors — confirmed by
// rerunning Milwaukee standalone and it succeeding fine).
import { execFileSync } from "node:child_process";

const CITIES = [
  { name: "Los Angeles", bbox: "33.7037,-118.6682,34.3373,-118.1553" },
  { name: "Houston", bbox: "29.5230,-95.7910,30.1100,-95.0140" },
  { name: "Phoenix", bbox: "33.2903,-112.3238,33.7846,-111.9256" },
  { name: "Austin", bbox: "30.0986,-97.9383,30.5168,-97.5684" },
  { name: "Seattle", bbox: "47.4810,-122.4596,47.7341,-122.2244" },
  { name: "Boston", bbox: "42.2279,-71.1912,42.3969,-70.9860" },
  { name: "Las Vegas", bbox: "35.9531,-115.3866,36.3336,-114.9862" },
  { name: "Detroit", bbox: "42.2554,-83.2875,42.4505,-82.9105" },
  { name: "Miami", bbox: "25.6480,-80.3730,25.8557,-80.1246" },
  { name: "Charlotte", bbox: "35.0353,-81.0130,35.3822,-80.6803" },
  { name: "Jacksonville", bbox: "30.1000,-81.8800,30.5800,-81.3900" },
  { name: "Columbus", bbox: "39.8300,-83.1500,40.1600,-82.8100" },
  { name: "Fort Worth", bbox: "32.5500,-97.5300,32.9200,-97.0700" },
  { name: "San Jose", bbox: "37.1200,-122.0450,37.4700,-121.7300" },
  { name: "Indianapolis", bbox: "39.6300,-86.3500,39.9300,-85.9400" },
  { name: "Baltimore", bbox: "39.1970,-76.7100,39.3720,-76.5300" },
  { name: "Milwaukee", bbox: "42.9200,-88.0700,43.1900,-87.8300" },
  { name: "Sacramento", bbox: "38.4400,-121.5700,38.6800,-121.3400" },
  { name: "Kansas City", bbox: "38.8600,-94.7300,39.3600,-94.3500" },
  { name: "Colorado Springs", bbox: "38.7500,-104.9200,38.9900,-104.6300" },
  { name: "Raleigh", bbox: "35.7300,-78.7500,35.9500,-78.5300" },
  { name: "Cleveland", bbox: "41.3800,-81.8800,41.6100,-81.5500" },
  { name: "Buffalo", bbox: "42.8300,-78.9200,42.9700,-78.7500" },
  { name: "Spokane", bbox: "47.5900,-117.5300,47.7700,-117.2900" },
];

const PAUSE_MS = 8000; // longer pause than the first pass — give Overpass more breathing room

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const failed = [];
  for (const [i, city] of CITIES.entries()) {
    console.log(`\n=== [${i + 1}/${CITIES.length}] ${city.name} ===`);
    try {
      execFileSync("node", ["scripts/ingest-osm.mjs", `--bbox=${city.bbox}`], { stdio: "inherit" });
    } catch (err) {
      console.error(`Failed on ${city.name}, continuing: ${err.message}`);
      failed.push(city.name);
    }
    if (i < CITIES.length - 1) await sleep(PAUSE_MS);
  }
  console.log(`\nDone. ${CITIES.length - failed.length}/${CITIES.length} cities succeeded.`);
  if (failed.length) console.log(`Failed: ${failed.join(", ")}`);
}

main();
