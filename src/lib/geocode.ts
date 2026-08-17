import { isValidLatLng } from "@/lib/geo";

export type LatLng = { lat: number; lng: number };

// Nominatim's CORS policy allows direct browser-origin requests, so this runs
// from client components (the quiz's address step, the add-a-spot dialog)
// with no server round-trip needed.
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  // Bare zip codes are ambiguous across countries (e.g. "10001" is also a
  // real postcode in Algeria) — without this, Nominatim's global ranking can
  // put a same-numbered foreign postcode ahead of the US one. This app only
  // has spot data in the US, so restricting the search is always correct here.
  url.searchParams.set("countrycodes", "us");

  const res = await fetch(url.toString());
  if (!res.ok) return null;

  const results: { lat: string; lon: string }[] = await res.json();
  if (results.length === 0) return null;

  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
}

// Extracts coordinates straight out of a pasted Google Maps URL, no network
// call needed. Handles the two shapes a full (non-shortened) Google Maps URL
// carries: the pinned place's exact marker coordinates (`!3d<lat>!4d<lng>`,
// preferred when present — this is where the pin actually sits, which can
// drift from wherever the map was panned/zoomed to) and the viewport center
// (`@lat,lng`) as a fallback, plus the plain `?q=lat,lng` shape older share
// links use. Shortened links (maps.app.goo.gl, goo.gl/maps) can't be resolved
// client-side — Google's redirect isn't CORS-readable from the browser — so
// those fall through to null and the caller should ask for the full expanded
// link instead.
export function parseGoogleMapsUrl(input: string): LatLng | null {
  const pinMatch = input.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (pinMatch) {
    return { lat: parseFloat(pinMatch[1]), lng: parseFloat(pinMatch[2]) };
  }

  const viewportMatch = input.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (viewportMatch) {
    return { lat: parseFloat(viewportMatch[1]), lng: parseFloat(viewportMatch[2]) };
  }

  try {
    const q = new URL(input).searchParams.get("q");
    const qMatch = q?.match(/^(-?\d+\.\d+),(-?\d+\.\d+)$/);
    if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
  } catch {
    // Not a parseable URL at all — fine, callers try other formats next.
  }

  return null;
}

// Raw "lat, lng" pasted straight from somewhere else (Google Maps' own
// long-press popup, another map tool, etc.) — still the most direct format
// when someone already has it, so it stays supported alongside the two
// friendlier options above.
export function parseLatLngPair(input: string): LatLng | null {
  const match = input.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  return isValidLatLng(lat, lng) ? { lat, lng } : null;
}

// Single entry point a free-text location field can call: try the cheap,
// no-network parses first (Google Maps URL, raw coordinate pair), only fall
// back to a real geocoding request when the input reads as a plain address.
export async function resolveLocationInput(input: string): Promise<LatLng | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  return (
    parseGoogleMapsUrl(trimmed) ??
    parseLatLngPair(trimmed) ??
    (await geocodeAddress(trimmed))
  );
}
