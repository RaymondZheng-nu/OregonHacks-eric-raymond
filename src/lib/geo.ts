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
