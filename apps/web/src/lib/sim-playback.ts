/**
 * Pure helpers to "play back" a week simulation at any instant t:
 * where each truck is, what it's doing, and the fleet KPIs so far.
 */
import type { Place, SegmentKind, SimSegment, SimSeriesPoint } from "@retorno/engine";
import { arcAt } from "./geo-arc";

const HOUR_MS = 3_600_000;

export function segmentsByTruck(segments: readonly SimSegment[]): Map<string, SimSegment[]> {
  const byTruck = new Map<string, SimSegment[]>();
  for (const segment of segments) {
    const list = byTruck.get(segment.truckId) ?? [];
    list.push(segment);
    byTruck.set(segment.truckId, list);
  }
  for (const list of byTruck.values()) list.sort((a, b) => a.startMs - b.startMs);
  return byTruck;
}

export interface TruckFrame {
  /** "base" = parked at home with nothing to do (before the first or after the last segment). */
  kind: SegmentKind | "base";
  lng: number;
  lat: number;
  segment?: SimSegment;
  /** Where the truck is (when idle) or heading (when driving). */
  place: Place;
}

export function frameAt(segments: readonly SimSegment[], t: number, base: Place): TruckFrame {
  const first = segments[0];
  if (!first || t < first.startMs)
    return { kind: "base", lng: base.lng, lat: base.lat, place: base };

  for (const segment of segments) {
    if (t >= segment.startMs && t < segment.endMs) {
      const f = (t - segment.startMs) / (segment.endMs - segment.startMs || 1);
      const [lng, lat] =
        segment.kind === "idle"
          ? [segment.from.lng, segment.from.lat]
          : arcAt(segment.from, segment.to, f);
      return {
        kind: segment.kind,
        lng,
        lat,
        segment,
        place: segment.kind === "idle" ? segment.from : segment.to,
      };
    }
  }
  const last = segments[segments.length - 1]!;
  if (t >= last.endMs) {
    const atBase = last.to.cityId === base.cityId;
    return { kind: atBase ? "base" : "idle", lng: last.to.lng, lat: last.to.lat, place: last.to };
  }
  // In a gap between segments (shouldn't happen: timelines are contiguous).
  const previous = [...segments].reverse().find((s) => s.endMs <= t) ?? first;
  return { kind: "idle", lng: previous.to.lng, lat: previous.to.lat, place: previous.to };
}

/** Linear interpolation between the hourly cumulative points. */
export function seriesAt(series: readonly SimSeriesPoint[], t: number): SimSeriesPoint {
  const first = series[0]!;
  const last = series[series.length - 1]!;
  if (t <= first.atMs) return first;
  if (t >= last.atMs) return last;
  const i = Math.floor((t - first.atMs) / HOUR_MS);
  const a = series[i]!;
  const b = series[i + 1] ?? a;
  const f = (t - a.atMs) / HOUR_MS;
  const lerp = (x: number, y: number) => x + (y - x) * f;
  const loadedKm = lerp(a.loadedKm, b.loadedKm);
  const emptyKm = lerp(a.emptyKm, b.emptyKm);
  const driven = loadedKm + emptyKm;
  return {
    hour: lerp(a.hour, b.hour),
    atMs: t,
    loadedKm,
    emptyKm,
    emptyKmPct: driven > 0 ? (emptyKm / driven) * 100 : 0,
    revenueMxn: lerp(a.revenueMxn, b.revenueMxn),
    costMxn: lerp(a.costMxn, b.costMxn),
    netMxn: lerp(a.netMxn, b.netMxn),
  };
}

/** Per-truck cumulative totals at t (segments prorated). */
export function truckTotalsAt(segments: readonly SimSegment[], t: number) {
  let emptyKm = 0;
  let loadedKm = 0;
  let netMxn = 0;
  for (const s of segments) {
    if (s.startMs >= t) break;
    const f = s.endMs <= t ? 1 : (t - s.startMs) / (s.endMs - s.startMs || 1);
    if (s.kind === "empty") emptyKm += s.km * f;
    if (s.kind === "loaded") loadedKm += s.km * f;
    netMxn += (s.revenueMxn - s.costMxn) * f;
  }
  return { emptyKm, loadedKm, netMxn };
}

export function deliveredBy(segments: readonly SimSegment[], t: number): number {
  return segments.reduce((count, s) => count + (s.kind === "loaded" && s.endMs <= t ? 1 : 0), 0);
}

export interface Corridor {
  from: Place;
  to: Place;
  km: number;
  trips: number;
}

/** Empty km aggregated per city pair (both directions together): where the fleet bleeds money. */
export function emptyCorridors(segments: readonly SimSegment[]): Corridor[] {
  const byPair = new Map<string, Corridor>();
  for (const s of segments) {
    if (s.kind !== "empty" || s.from.cityId === s.to.cityId) continue;
    const [a, b] = [s.from, s.to].sort((x, y) => x.cityId.localeCompare(y.cityId)) as [
      Place,
      Place,
    ];
    const key = `${a.cityId}|${b.cityId}`;
    const corridor = byPair.get(key) ?? { from: a, to: b, km: 0, trips: 0 };
    corridor.km += s.km;
    corridor.trips += 1;
    byPair.set(key, corridor);
  }
  return [...byPair.values()].sort((x, y) => y.km - x.km);
}
