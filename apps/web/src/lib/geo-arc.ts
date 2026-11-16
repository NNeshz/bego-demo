/** Gentle quadratic curves between two points, so overlapping legs stay readable on a map. Not the real road. */
export interface LngLatPoint {
  lat: number;
  lng: number;
}

const BEND = 0.12;

function control(from: LngLatPoint, to: LngLatPoint): [number, number] {
  const dx = to.lng - from.lng;
  const dy = to.lat - from.lat;
  return [(from.lng + to.lng) / 2 - dy * BEND, (from.lat + to.lat) / 2 + dx * BEND];
}

/** Point at fraction `f` (0–1) along the curve, as [lng, lat]. */
export function arcAt(from: LngLatPoint, to: LngLatPoint, f: number): [number, number] {
  const [cx, cy] = control(from, to);
  const t = Math.min(1, Math.max(0, f));
  const u = 1 - t;
  return [
    u * u * from.lng + 2 * u * t * cx + t * t * to.lng,
    u * u * from.lat + 2 * u * t * cy + t * t * to.lat,
  ];
}

export function arcPoints(from: LngLatPoint, to: LngLatPoint, steps = 48): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, i) => arcAt(from, to, i / steps));
}
