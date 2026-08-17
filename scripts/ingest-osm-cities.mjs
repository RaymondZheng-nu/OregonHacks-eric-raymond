// Runs ingest-osm.mjs sequentially across a fixed list of major US city
// bounding boxes. Sequential + paused between requests, not parallel, to
// respect the public Overpass instance's informal fair-use limits.
//
// Usage: node --env-file=.env.local scripts/ingest-osm-cities.mjs

import { execFileSync } from "node:child_process";

// NYC already has ~2858 osm-sourced rows from an earlier run — skipped here
// to avoid re-querying and re-deduping a city that's already covered.
// Portland skipped too — already ingested separately by a teammate.
const CITIES = [
  { name: "Los Angeles", bbox: "33.7037,-118.6682,34.3373,-118.1553" },
  { name: "Chicago", bbox: "41.6445,-87.9401,42.0230,-87.5237" },
  { name: "Houston", bbox: "29.5230,-95.7910,30.1100,-95.0140" },
  { name: "Phoenix", bbox: "33.2903,-112.3238,33.7846,-111.9256" },
  { name: "Philadelphia", bbox: "39.8670,-75.2803,40.1379,-74.9557" },
  { name: "San Antonio", bbox: "29.2141,-98.7920,29.6841,-98.2698" },
  { name: "San Diego", bbox: "32.5343,-117.2819,33.1140,-116.9059" },
  { name: "Dallas", bbox: "32.6177,-96.9989,32.9977,-96.5560" },
  { name: "Austin", bbox: "30.0986,-97.9383,30.5168,-97.5684" },
  { name: "San Francisco", bbox: "37.7025,-122.5270,37.8324,-122.3477" },
  { name: "Seattle", bbox: "47.4810,-122.4596,47.7341,-122.2244" },
  { name: "Denver", bbox: "39.6144,-105.1099,39.9142,-104.6002" },
  { name: "Boston", bbox: "42.2279,-71.1912,42.3969,-70.9860" },
  { name: "Nashville", bbox: "36.0198,-87.0492,36.3378,-86.5849" },
  { name: "Las Vegas", bbox: "35.9531,-115.3866,36.3336,-114.9862" },
  { name: "Detroit", bbox: "42.2554,-83.2875,42.4505,-82.9105" },
  { name: "Miami", bbox: "25.6480,-80.3730,25.8557,-80.1246" },
  { name: "Atlanta", bbox: "33.6478,-84.5511,33.8868,-84.2891" },
  { name: "Minneapolis", bbox: "44.8903,-93.3290,45.0512,-93.1938" },
  { name: "New Orleans", bbox: "29.8654,-90.1400,30.1993,-89.6254" },
  { name: "Washington DC", bbox: "38.7916,-77.1197,38.9955,-76.9094" },
  { name: "Pittsburgh", bbox: "40.3608,-80.0958,40.5028,-79.8654" },
  { name: "Charlotte", bbox: "35.0353,-81.0130,35.3822,-80.6803" },
  { name: "Salt Lake City", bbox: "40.6198,-112.0410,40.8025,-111.7397" },
  { name: "Jacksonville", bbox: "30.1000,-81.8800,30.5800,-81.3900" },
  { name: "Columbus", bbox: "39.8300,-83.1500,40.1600,-82.8100" },
  { name: "Fort Worth", bbox: "32.5500,-97.5300,32.9200,-97.0700" },
  { name: "San Jose", bbox: "37.1200,-122.0450,37.4700,-121.7300" },
  { name: "Indianapolis", bbox: "39.6300,-86.3500,39.9300,-85.9400" },
  { name: "Baltimore", bbox: "39.1970,-76.7100,39.3720,-76.5300" },
  // Second wave — filling gaps between the original 30 metros.
  { name: "Milwaukee", bbox: "42.9200,-88.0700,43.1900,-87.8300" },
  { name: "Albuquerque", bbox: "34.9800,-106.7900,35.2300,-106.4700" },
  { name: "Tucson", bbox: "32.0500,-111.1400,32.3600,-110.7300" },
  { name: "Fresno", bbox: "36.6500,-119.9300,36.9200,-119.6800" },
  { name: "Sacramento", bbox: "38.4400,-121.5700,38.6800,-121.3400" },
  { name: "Kansas City", bbox: "38.8600,-94.7300,39.3600,-94.3500" },
  { name: "Long Beach", bbox: "33.7500,-118.2400,33.8700,-118.0700" },
  { name: "Colorado Springs", bbox: "38.7500,-104.9200,38.9900,-104.6300" },
  { name: "Raleigh", bbox: "35.7300,-78.7500,35.9500,-78.5300" },
  { name: "Omaha", bbox: "41.1600,-96.1500,41.3600,-95.8900" },
  { name: "Oakland", bbox: "37.7000,-122.3500,37.8500,-122.1100" },
  { name: "Tulsa", bbox: "35.9700,-96.1100,36.2500,-95.7900" },
  { name: "Cleveland", bbox: "41.3800,-81.8800,41.6100,-81.5500" },
  { name: "Tampa", bbox: "27.8500,-82.5900,28.0700,-82.3200" },
  { name: "St. Louis", bbox: "38.5300,-90.3200,38.7700,-90.1600" },
  { name: "Cincinnati", bbox: "39.0500,-84.7100,39.2100,-84.4300" },
  { name: "Orlando", bbox: "28.4200,-81.4900,28.6100,-81.2600" },
  { name: "Buffalo", bbox: "42.8300,-78.9200,42.9700,-78.7500" },
  { name: "St. Paul", bbox: "44.8900,-93.2100,45.0500,-92.9900" },
  { name: "Lincoln", bbox: "40.7500,-96.8200,40.9200,-96.5900" },
  { name: "Richmond", bbox: "37.4500,-77.5700,37.6100,-77.3600" },
  { name: "Spokane", bbox: "47.5900,-117.5300,47.7700,-117.2900" },
  { name: "Tacoma", bbox: "47.1600,-122.5500,47.3200,-122.3600" },
  { name: "Des Moines", bbox: "41.5100,-93.7500,41.6800,-93.5000" },
  { name: "Rochester", bbox: "43.0800,-77.7100,43.2200,-77.5300" },
];

// Gives the public Overpass instance breathing room between back-to-back
// city queries — polite pacing, not a hard rate-limit requirement.
const PAUSE_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const failed = [];

  for (const [i, city] of CITIES.entries()) {
    console.log(`\n=== [${i + 1}/${CITIES.length}] ${city.name} ===`);
    try {
      execFileSync("node", ["scripts/ingest-osm.mjs", `--bbox=${city.bbox}`], {
        stdio: "inherit",
      });
    } catch (err) {
      console.error(`Failed on ${city.name}, continuing: ${err.message}`);
      failed.push(city.name);
    }

    if (i < CITIES.length - 1) await sleep(PAUSE_MS);
  }

  console.log(`\nDone. ${CITIES.length - failed.length}/${CITIES.length} cities succeeded.`);
  if (failed.length) {
    console.log(`Failed: ${failed.join(", ")}`);
    process.exit(1);
  }
}

main();
