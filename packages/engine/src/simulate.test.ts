import { describe, expect, it } from "vitest";
import { roadKm } from "./geo";
import { compareWeek, simulateWeek, type FleetTruck } from "./simulate";
import { hoursAfter, makeLoad, places, T0 } from "./test/fixtures";

const fleet: FleetTruck[] = [
  { id: "T-1", unitType: "dry_van_53", base: places.queretaro },
  { id: "T-2", unitType: "dry_van_53", base: places.monterrey },
];

// A small two-way market between Querétaro, Monterrey and the border, spread over the week.
const loads = Array.from({ length: 7 }).flatMap((_, day) => {
  const start = hoursAfter(T0, day * 24);
  const end = hoursAfter(start, 12);
  return [
    makeLoad({
      origin: places.queretaro,
      destination: places.laredo,
      rateMxn: 34_000,
      pickupStart: start,
      pickupEnd: end,
    }),
    makeLoad({
      origin: places.laredo,
      destination: places.queretaro,
      rateMxn: 30_000,
      pickupStart: hoursAfter(start, 14),
      pickupEnd: hoursAfter(start, 30),
    }),
    makeLoad({
      origin: places.monterrey,
      destination: places.cdmx,
      rateMxn: 36_000,
      pickupStart: start,
      pickupEnd: end,
    }),
    makeLoad({
      origin: places.cdmx,
      destination: places.monterrey,
      rateMxn: 33_000,
      pickupStart: hoursAfter(start, 14),
      pickupEnd: hoursAfter(start, 30),
    }),
  ];
});

const options = { start: T0, days: 7 };

describe("simulateWeek", () => {
  it("is deterministic", () => {
    expect(simulateWeek(fleet, loads, "recommended", options)).toEqual(
      simulateWeek(fleet, loads, "recommended", options),
    );
  });

  it("never hauls the same load twice", () => {
    for (const policy of ["empty_return", "recommended"] as const) {
      const ids = simulateWeek(fleet, loads, policy, options)
        .segments.filter((s) => s.kind === "loaded")
        .map((s) => s.loadId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("keeps each truck's timeline contiguous and non-overlapping", () => {
    const { segments } = simulateWeek(fleet, loads, "recommended", options);
    for (const truck of fleet) {
      const own = segments.filter((s) => s.truckId === truck.id);
      for (let i = 1; i < own.length; i++) {
        expect(own[i]!.startMs).toBeCloseTo(own[i - 1]!.endMs, 0);
        expect(own[i]!.from.cityId).toBe(own[i - 1]!.to.cityId);
      }
    }
  });

  it("baseline only picks up loads near base", () => {
    const { segments } = simulateWeek(fleet, loads, "empty_return", options);
    const bases = new Map(fleet.map((t) => [t.id, t.base]));
    for (const s of segments.filter((x) => x.kind === "loaded")) {
      expect(roadKm(s.from, bases.get(s.truckId)!, 1.25)).toBeLessThanOrEqual(80);
    }
  });

  it("produces an hourly cumulative series that ends at the totals", () => {
    const result = simulateWeek(fleet, loads, "recommended", options);
    expect(result.series).toHaveLength(7 * 24 + 1);
    const last = result.series.at(-1)!;
    expect(last.netMxn).toBeCloseTo(result.totals.netMxn, 6);
    for (let i = 1; i < result.series.length; i++) {
      expect(result.series[i]!.loadedKm).toBeGreaterThanOrEqual(result.series[i - 1]!.loadedKm);
    }
  });

  it("following recommendations cuts empty km and earns more on a two-way market", () => {
    const { baseline, recommended, delta } = compareWeek(fleet, loads, options);
    expect(recommended.totals.emptyKmPct).toBeLessThan(baseline.totals.emptyKmPct);
    expect(delta.emptyKmPctPoints).toBeGreaterThan(0);
    expect(delta.netMxn).toBeGreaterThan(0);
  });
});
