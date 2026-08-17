// Shared with city-picker-modal.tsx and landing-highlights.tsx — the set of
// cities this hand-seeded demo data covers.
export type EventCity = "portland" | "nyc";

// Hand-seeded for the demo — deliberately not a live API integration (zero
// runtime fetch, zero third-party dependency on the landing page's first
// screen). Every field here is traceable to a source page fetched and read
// during this session; nothing is inferred or filled in. `dateLabel` is
// authored by hand rather than formatted from `expiresAt` at render time —
// the Smith and Bybee listing's Facebook page renders its own time in a
// different (wrong-reading) timezone, so this avoids the same class of bug
// by never running these through a runtime timezone conversion at all.
export type EventCost = { type: "free" } | { type: "paid"; label: string };

export type NatureEvent = {
  id: string;
  title: string;
  city: EventCity;
  venueName: string;
  dateLabel: string;
  // ISO datetime (end of the event's last valid day, in its own local
  // offset). Null means recurring — never filtered out by getActiveEvents.
  expiresAt: string | null;
  cost: EventCost;
  description: string;
  sourceUrl: string;
  // Links to an existing row in `spots` so "View on map" can jump straight
  // to it (see explore/page.tsx's `?spot=` param) — null where no confident
  // match exists in the DB, per event-carousel research (2026-08-17).
  matchedSpotId: string | null;
  // A real photo of the venue, not of the event itself (nobody's photographed
  // these specific happenings yet) — user-supplied photos of the actual
  // place, shipped as static files under public/events/ so there's no
  // third-party host in the loop at all (an earlier pass sourced these from
  // Wikimedia Commons; dropped after live testing showed Commons rate-limits
  // bursts of concurrent requests, which is exactly the kind of runtime
  // failure risk this carousel exists to avoid). EventSpotlightCarousel
  // falls back to a plain green card if this is ever null or fails to load.
  photoUrl: string | null;
};

export const EVENTS: NatureEvent[] = [
  {
    id: "walk-and-roll-smith-bybee",
    title: "Walk and Roll — Smith and Bybee Wetlands",
    city: "portland",
    venueName: "Smith and Bybee Wetlands Natural Area",
    dateLabel: "Wed, Aug 19 · 10:00 AM–12:00 PM PT",
    expiresAt: "2026-08-19T23:59:00-07:00",
    cost: { type: "paid", label: "$5 ($10 for all of August)" },
    description:
      "Accessible, family-friendly birdwatching walk with light snacks and a craft activity. Meets at the parking lot; fully accessible path.",
    sourceUrl: "https://www.zeffy.com/en-US/ticketing/summer-walk-and-roll-august",
    matchedSpotId: "ec17bf57-4431-4a5c-a653-d68a40f21366",
    photoUrl: "/events/smith-bybee-wetlands.png",
  },
  {
    id: "hike-with-hoyt-08-22",
    title: "Hike with Hoyt",
    city: "portland",
    venueName: "Hoyt Arboretum",
    dateLabel: "Sat, Aug 22 · 10:00 AM–12:00 PM PT",
    expiresAt: "2026-08-22T23:59:00-07:00",
    cost: { type: "free" },
    description:
      "Guided volunteer-led hike through Hoyt Arboretum's trails, up to 4 miles, rain or shine.",
    sourceUrl: "https://www.hoytarboretum.org/events/hike-with-hoyt-08-22-26/",
    matchedSpotId: "5e0ac05f-a56f-4cca-8644-25a5f8399852",
    photoUrl: "/events/hoyt-arboretum.png",
  },
  {
    id: "cool-runnings-summer-free-for-all",
    title: "Watch Cool Runnings — Summer Free for All",
    city: "portland",
    venueName: "Sewallcrest Park",
    dateLabel: "Sat, Aug 22 · 7:30–10:00 PM PT",
    expiresAt: "2026-08-22T23:59:00-07:00",
    cost: { type: "free" },
    description:
      "Outdoor movie night on the lawn with free popcorn, part of Portland Parks & Rec's Summer Free for All.",
    sourceUrl:
      "https://pdxparent.com/event-single/watch-cool-runnings-portland-parks-and-rec-summer-free-for-all/",
    matchedSpotId: "ff15e81f-d8a4-428c-982a-46a72a52ad12",
    photoUrl: "/events/sewallcrest-park.png",
  },
  {
    id: "pop-up-nature-cones",
    title: "Pop-Up Nature: Cones",
    city: "portland",
    venueName: "Hoyt Arboretum",
    dateLabel: "Thu–Sat, Aug 20–22 · 9:30 AM–12:30 PM PT",
    expiresAt: "2026-08-22T23:59:00-07:00",
    cost: { type: "free" },
    description:
      "Free drop-in nature exploration stations for kids and families, themed around conifer cones.",
    sourceUrl: "https://www.hoytarboretum.org/visit/events/",
    matchedSpotId: "5e0ac05f-a56f-4cca-8644-25a5f8399852",
    photoUrl: "/events/hoyt-arboretum.png",
  },
  {
    id: "concerts-in-the-park-ants-ants-ants",
    title: "Concerts in the Park: Ants Ants Ants",
    city: "portland",
    venueName: "Grant Park",
    dateLabel: "Thu, Aug 20 · 6:30 PM PT",
    expiresAt: "2026-08-20T23:59:00-07:00",
    cost: { type: "free" },
    description:
      "Free outdoor family concert from Portland kids' band Ants Ants Ants, part of Summer Free for All.",
    sourceUrl: "https://icanradio.org/blog/free-concert-in-the-park-2026/",
    matchedSpotId: null,
    photoUrl: "/events/grant-park.png",
  },
  {
    id: "porch-concert-series-08-22",
    title: "Porch Concert Series",
    city: "portland",
    venueName: "Cathedral Park Performing Arts Collective",
    dateLabel: "Sat, Aug 22 · 10:00 AM–12:30 PM PT",
    expiresAt: "2026-08-22T23:59:00-07:00",
    cost: { type: "free" },
    description:
      "Free live music on the lawn — two sets, David Pollack then The Heirlooms.",
    sourceUrl: "https://cathedralparkarts.org/porch-concert-series/",
    matchedSpotId: "baa47855-38d6-42b2-93fa-3afc7d74f08f",
    photoUrl: "/events/cathedral-park.png",
  },
  {
    id: "memory-garden-live-music-08-22",
    title: "Live Music in the Garden",
    city: "portland",
    venueName: "Portland Memory Garden",
    dateLabel: "Sat, Aug 22 · 11:30 AM–1:00 PM PT",
    expiresAt: "2026-08-22T23:59:00-07:00",
    cost: { type: "free" },
    description:
      "Free guitar performance in the garden, hosted by Friends of Portland Memory Garden.",
    sourceUrl:
      "https://www.portland.gov/parks/events/2026/8/22/guitar-music-garden-friends-portland-memory-garden",
    matchedSpotId: null,
    photoUrl: "/events/memory-garden.png",
  },
  {
    id: "brooklyn-bridge-parkrun",
    title: "Brooklyn Bridge parkrun",
    city: "nyc",
    venueName: "Brooklyn Bridge Park (Pier 1)",
    dateLabel: "Every Saturday · 8:00 AM",
    expiresAt: null,
    cost: { type: "free" },
    description:
      "Free, timed weekly 5K through Brooklyn Bridge Park, open to all ages.",
    sourceUrl: "https://www.parkrun.us/brooklynbridge/",
    matchedSpotId: "19e73f30-c4d2-4f91-b5a4-468d504c45d1",
    photoUrl: "/events/brooklyn-bridge-parkrun.png",
  },
  {
    id: "big-city-fishing-pier-51",
    title: "Big City Fishing — Pier 51",
    city: "nyc",
    venueName: "Pier 51, Hudson River Greenway",
    dateLabel: "Sat, Aug 22 · 11:00 AM–3:00 PM ET",
    expiresAt: "2026-08-22T23:59:00-04:00",
    cost: { type: "free" },
    description:
      "Catch-and-release fishing on the Hudson with NYC Parks educators. Equipment and tutorial provided.",
    sourceUrl: "https://www.kidonthetown.com/events/big-city-fishing-2/2026-08-22/",
    matchedSpotId: null,
    photoUrl: "/events/pier-51-fishing.png",
  },
  {
    id: "downtown-boathouse-kayaking",
    title: "Downtown Boathouse Free Kayaking",
    city: "nyc",
    venueName: "Hudson River Park, north of Pier 26",
    dateLabel: "Sat–Sun 10AM–4:30PM · Tue & Thu 5:30–7:15PM, through Oct 4",
    expiresAt: "2026-10-04T23:59:00-04:00",
    cost: { type: "free" },
    description:
      "Volunteer-run kayaking on the Hudson in sit-on-top boats. Must know how to swim; waiver required each visit.",
    sourceUrl: "https://www.downtownboathouse.org/free-kayaking",
    matchedSpotId: null,
    photoUrl: "/events/kayak.png",
  },
];

export function getActiveEvents(now: Date): NatureEvent[] {
  return EVENTS.filter(
    (event) => event.expiresAt === null || new Date(event.expiresAt) >= now,
  );
}
