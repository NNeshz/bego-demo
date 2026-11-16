import type { GeoPoint } from "./types";

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two points in km (haversine formula).
 * This is the "as the crow flies" distance over the Earth's surface.
 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Estimated road distance: haversine × a detour factor.
 *
 * Limitation: a single factor ignores geography (mountain passes, coastlines,
 * the lack of a direct road). Good enough to rank options between ~20 cities;
 * a routing engine (OSRM) is the documented next step.
 */
export function roadKm(a: GeoPoint, b: GeoPoint, roadFactor: number): number {
  return haversineKm(a, b) * roadFactor;
}
