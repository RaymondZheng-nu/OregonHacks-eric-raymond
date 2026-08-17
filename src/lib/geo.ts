const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_DEGREE_LAT = 111_320;

// Shared cap for any user- or URL-supplied query radius (questionnaire travel
// time, /swipe and /explore's ?radius= param). Without this, an arbitrarily
// large value produces a near-global bounding box and an unbounded spot
// query; a negative value produces an inverted box and an incorrectly empty
// one. ~185mi (300km) comfortably covers "a long drive," not "the whole
// country."
export const MAX_QUERY_RADIUS_METERS = 300_000;

export function clampRadiusMeters(radiusMeters: number): number {
  if (!Number.isFinite(radiusMeters)) return MAX_QUERY_RADIUS_METERS;
  return Math.min(Math.max(radiusMeters, 1), MAX_QUERY_RADIUS_METERS);
}

// https://developers.google.com/maps/documentation/urls/get-started#directions-action
// Opens the Google Maps app if installed (iOS/Android), falls back to Google
// Maps web otherwise — same universal-link pattern used for "Get directions"
// wherever a spot needs one (spot-map.tsx's marker popup, /saved, the swipe
// deck's location preview), factored out once a third call site needed it.
export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export type BoundingBox = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export function boundingBox(lat: number, lng: number, radiusMeters: number): BoundingBox {
  const latDelta = radiusMeters / METERS_PER_DEGREE_LAT;
  // Clamped away from exactly ±90: cos(lat) approaches 0 at the poles, so
  // metersPerDegreeLng approaches 0 and lngDelta blows up toward a
  // near-global box. No real query origin is ever actually at the pole
  // (isValidLatLng's range is a sanity check, not a guarantee of realistic
  // input), so this only guards the division, not correctness at normal
  // latitudes.
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(toRadians(Math.min(Math.abs(lat), 89.9)));
  const lngDelta = radiusMeters / metersPerDegreeLng;

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

export type LatLng = { lat: number; lng: number };

// Planar shoelace formula on an equirectangular projection centered at the
// ring's own latitude. Not geodesically exact, but the error at city/park
// scale is negligible relative to the area thresholds this feeds (hundreds
// to thousands of m²) — the same proportionate-rigor tradeoff as the
// haversine/boundingBox helpers above, not a survey-grade calculation.
export function polygonAreaM2(ring: LatLng[]): number {
  if (ring.length < 3) return 0;

  const refLat = ring[0].lat;
  const metersPerDegLng = METERS_PER_DEGREE_LAT * Math.cos(toRadians(refLat));
  const points = ring.map((point) => ({
    x: point.lng * metersPerDegLng,
    y: point.lat * METERS_PER_DEGREE_LAT,
  }));

  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    twiceArea += points[i].x * points[j].y - points[j].x * points[i].y;
  }

  return Math.abs(twiceArea) / 2;
}

// Unweighted average of a {lat,lng}-shaped ring's vertices — same
// good-enough-for-a-pin approximation as ringCentroid below, but for OSM's
// point shape rather than GeoJSON's [lng,lat] tuples (used when Overpass
// geometry replaces the `center` field, which can't be requested together
// with `out geom`).
export function ringCentroidLatLng(ring: LatLng[]): LatLng | null {
  if (!ring || ring.length === 0) return null;
  const lat = ring.reduce((sum, point) => sum + point.lat, 0) / ring.length;
  const lng = ring.reduce((sum, point) => sum + point.lng, 0) / ring.length;
  return { lat, lng };
}

// Standard even-odd ray-casting test: does `point` fall inside `ring`? Used
// to gate the containment/dedup merge on real polygon containment instead of
// a radius guess — a park 300m from another park's centroid but outside its
// actual boundary is a neighbor, not a sub-feature. Same planar-projection
// tradeoff as polygonAreaM2 above (park/city scale, not survey-grade), and
// the same ring shape it already produces.
export function pointInPolygon(point: LatLng, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng;
    const yi = ring[i].lat;
    const xj = ring[j].lng;
    const yj = ring[j].lat;

    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export type GeoJsonGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

// Unweighted average of a ring's vertices. An approximation, not a true
// area-weighted centroid, but good enough for placing a map pin.
function ringCentroid(ring: number[][]): LatLng | null {
  if (!ring || ring.length === 0) return null;
  const lng = ring.reduce((sum, point) => sum + point[0], 0) / ring.length;
  const lat = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
  return { lat, lng };
}

// Open-data portals commonly return GeoJSON geometry (a park's boundary)
// instead of a single lat/lng, since that's what they collect natively.
// This reduces any of the three shapes down to one point for the map.
// MultiPolygon averages each part's centroid rather than every raw vertex,
// so a park split across several disconnected parcels isn't skewed toward
// whichever parcel happens to have the most vertices in its boundary.
export function geometryCentroid(geometry: GeoJsonGeometry | null | undefined): LatLng | null {
  if (!geometry) return null;

  if (geometry.type === "Point") {
    const [lng, lat] = geometry.coordinates;
    return { lat, lng };
  }

  if (geometry.type === "Polygon") {
    return ringCentroid(geometry.coordinates[0]);
  }

  if (geometry.type === "MultiPolygon") {
    const centroids = geometry.coordinates
      .map((polygon) => ringCentroid(polygon[0]))
      .filter((centroid): centroid is LatLng => centroid !== null);
    if (centroids.length === 0) return null;
    return {
      lat: centroids.reduce((sum, c) => sum + c.lat, 0) / centroids.length,
      lng: centroids.reduce((sum, c) => sum + c.lng, 0) / centroids.length,
    };
  }

  return null;
}
