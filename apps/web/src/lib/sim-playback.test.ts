import { createMemorySource } from "@retorno/db";
import { compareWeek, type Place, type SimSegment } from "@retorno/engine";
import { describe, expect, it } from "vitest";
import {
  deliveredBy,
  emptyCorridors,
  frameAt,
  segmentsByTruck,
  seriesAt,
  truckTotalsAt,
} from "./sim-playback";

const H = 3_600_000;
const qro: Place = { cityId: "queretaro", name: "Querétaro", lat: 20.5888, lng: -100.3899 };
const mty: Place = { cityId: "monterrey", name: "Monterrey", lat: 25.6866, lng: -100.3161 };

const seg = (
  kind: SimSegment["kind"],
  from: Place,
  to: Place,
  startH: number,
  endH: number,
  km = 100,
): SimSegment => ({
  truckId: "T",
  kind,
  from,
  to,
  startMs: startH * H,
  endMs: endH * H,
  km,
  revenueMxn: kind === "loaded" ? 10_000 : 0,
  costMxn: 1_000,
});

const timeline = [
  seg("loaded", qro, mty, 0, 10),
  seg("idle", mty, mty, 10, 12, 0),
  seg("empty", mty, qro, 12, 22),
];

describe("frameAt", () => {
  it("parks the truck at base before it starts", () => {
    expect(frameAt(timeline, -1, qro)).toMatchObject({ kind: "base", lat: qro.lat });
  });

  it("interpolates along the leg and reports the destination", () => {
    const start = frameAt(timeline, 0, qro);
    const mid = frameAt(timeline, 5 * H, qro);
    expect(start).toMatchObject({ kind: "loaded", place: mty });
    expect(start.lat).toBeCloseTo(qro.lat, 6);
    expect(mid.lat).toBeGreaterThan(qro.lat);
    expect(mid.lat).toBeLessThan(mty.lat);
  });

  it("is idle in place, then back at base after the last segment", () => {
    expect(frameAt(timeline, 11 * H, qro)).toMatchObject({ kind: "idle", place: mty });
    expect(frameAt(timeline, 30 * H, qro)).toMatchObject({ kind: "base", lat: qro.lat });
  });
});

describe("cumulative helpers", () => {
  it("prorates truck totals and counts deliveries", () => {
    expect(truckTotalsAt(timeline, 5 * H)).toMatchObject({
      loadedKm: 50,
      emptyKm: 0,
      netMxn: 4_500,
    });
    expect(truckTotalsAt(timeline, 100 * H)).toMatchObject({
      loadedKm: 100,
      emptyKm: 100,
      netMxn: 7_000,
    });
    expect(deliveredBy(timeline, 9 * H)).toBe(0);
    expect(deliveredBy(timeline, 10 * H)).toBe(1);
  });

  it("aggregates empty km per corridor in both directions", () => {
    const corridors = emptyCorridors([...timeline, seg("empty", qro, mty, 30, 40, 50)]);
    expect(corridors).toHaveLength(1);
    expect(corridors[0]).toMatchObject({ km: 150, trips: 2 });
  });
});

describe("on the real simulation", () => {
  const now = () => new Date("2026-11-16T16:00:00.000Z");
  const source = createMemorySource({ now });

  it("seriesAt matches the hourly points and the final totals", async () => {
    const [loads, trucks] = await Promise.all([source.listLoads(), source.listTrucks()]);
    const fleet = trucks.map(({ id, unitType, base }) => ({ id, unitType, base }));
    const { recommended } = compareWeek(fleet, loads, { start: source.marketStart() });
    const p = recommended.series[50]!;
    expect(seriesAt(recommended.series, p.atMs).netMxn).toBeCloseTo(p.netMxn, 6);
    expect(seriesAt(recommended.series, Number.MAX_SAFE_INTEGER).netMxn).toBeCloseTo(
      recommended.totals.netMxn,
      6,
    );

    // Every truck's frames are always finite, at any time.
    const byTruck = segmentsByTruck(recommended.segments);
    for (const truck of fleet) {
      for (let t = recommended.startMs; t < recommended.endMs; t += 7 * H) {
        const f = frameAt(byTruck.get(truck.id) ?? [], t, truck.base);
        expect(Number.isFinite(f.lat) && Number.isFinite(f.lng)).toBe(true);
      }
    }
  });
});
