const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_DEGREE_LAT = 111_320;

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
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(toRadians(lat));
  const lngDelta = radiusMeters / metersPerDegreeLng;

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

export type LatLng = { lat: number; lng: number };

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
