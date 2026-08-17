const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_DEGREE_LAT = 111_320;

// Cap for any user/URL-supplied query radius. A huge value gives a near-global
// box (unbounded query); a negative one inverts the box. ~185mi covers "a long
// drive," not "the whole country."
export const MAX_QUERY_RADIUS_METERS = 300_000;

export function clampRadiusMeters(radiusMeters: number): number {
  if (!Number.isFinite(radiusMeters)) return MAX_QUERY_RADIUS_METERS;
  return Math.min(Math.max(radiusMeters, 1), MAX_QUERY_RADIUS_METERS);
}

// Google Maps directions universal link — opens the app if installed, else web.
// https://developers.google.com/maps/documentation/urls/get-started#directions-action
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

// spot_density_grid rejects anything over 70deg per axis (see schema.sql) —
// a wide/short browser window zoomed out to CONUS easily exceeds that on
// longitude alone. Clamp client-side, centered on the viewport, instead of
// letting the RPC 400 and the UI read it as "no spots here."
const MAX_DENSITY_BOUNDS_SPAN_DEGREES = 69;

export function clampBoundsSpan(bounds: BoundingBox): BoundingBox {
  const latSpan = bounds.maxLat - bounds.minLat;
  const lngSpan = bounds.maxLng - bounds.minLng;
  if (latSpan <= MAX_DENSITY_BOUNDS_SPAN_DEGREES && lngSpan <= MAX_DENSITY_BOUNDS_SPAN_DEGREES) {
    return bounds;
  }
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const centerLng = (bounds.minLng + bounds.maxLng) / 2;
  const halfLat = Math.min(latSpan, MAX_DENSITY_BOUNDS_SPAN_DEGREES) / 2;
  const halfLng = Math.min(lngSpan, MAX_DENSITY_BOUNDS_SPAN_DEGREES) / 2;
  return {
    minLat: centerLat - halfLat,
    maxLat: centerLat + halfLat,
    minLng: centerLng - halfLng,
    maxLng: centerLng + halfLng,
  };
}

export function boundingBox(lat: number, lng: number, radiusMeters: number): BoundingBox {
  const latDelta = radiusMeters / METERS_PER_DEGREE_LAT;
  // Clamp away from ±90: cos(lat)→0 at the poles, blowing lngDelta up to a
  // near-global box. Just guards the division; real origins are never polar.
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

// Shoelace formula on an equirectangular projection at the ring's latitude.
// Not geodesic, but negligible error at park scale vs the m² thresholds it feeds.
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

// Like ringCentroid below but for OSM's {lat,lng} shape, not GeoJSON [lng,lat]
// tuples — used when Overpass `out geom` replaces the `center` field.
export function ringCentroidLatLng(ring: LatLng[]): LatLng | null {
  if (!ring || ring.length === 0) return null;
  const lat = ring.reduce((sum, point) => sum + point.lat, 0) / ring.length;
  const lng = ring.reduce((sum, point) => sum + point.lng, 0) / ring.length;
  return { lat, lng };
}

// Even-odd ray-cast: is `point` inside `ring`? Gates the dedup merge on real
// containment instead of a radius guess — a park outside another's boundary is
// a neighbor, not a sub-feature.
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

// Vertex average — not area-weighted, but good enough for a map pin.
function ringCentroid(ring: number[][]): LatLng | null {
  if (!ring || ring.length === 0) return null;
  const lng = ring.reduce((sum, point) => sum + point[0], 0) / ring.length;
  const lat = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
  return { lat, lng };
}

// Reduce any GeoJSON geometry (as open-data portals return) to one map point.
// MultiPolygon averages each part's centroid, not raw vertices, so a park split
// across parcels isn't skewed toward the most-detailed parcel.
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
