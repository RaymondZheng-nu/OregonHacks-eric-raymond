import { isValidLatLng } from "@/lib/geo";

export type LatLng = { lat: number; lng: number };

// Nominatim allows browser-origin requests, so this runs client-side directly.
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  // US-only: bare zips collide across countries ("10001" is also Algerian), and
  // all spot data is US anyway, so this avoids a foreign postcode outranking it.
  url.searchParams.set("countrycodes", "us");

  const res = await fetch(url.toString());
  if (!res.ok) return null;

  const results: { lat: string; lon: string }[] = await res.json();
  if (results.length === 0) return null;

  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
}

// Pulls coords from a pasted Google Maps URL. Prefers the pin's exact marker
// (!3d/!4d, which can differ from the panned viewport), then the @lat,lng
// viewport center, then older ?q=lat,lng links. Shortened links
// (maps.app.goo.gl) aren't CORS-readable, so they fall through to null.
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
    // not a URL — callers try other formats next
  }

  return null;
}

// Raw "lat, lng" pasted from a map tool's long-press popup.
export function parseLatLngPair(input: string): LatLng | null {
  const match = input.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  return isValidLatLng(lat, lng) ? { lat, lng } : null;
}

// Free-text entry point: try the no-network parses first, geocode only if those miss.
export async function resolveLocationInput(input: string): Promise<LatLng | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  return (
    parseGoogleMapsUrl(trimmed) ??
    parseLatLngPair(trimmed) ??
    (await geocodeAddress(trimmed))
  );
}
