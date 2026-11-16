/**
 * Property-based tests: instead of hand-picked examples, fast-check generates
 * hundreds of random trucks and loads and checks invariants that must ALWAYS hold.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveOptions } from "./config";
import { planChains } from "./chains";
import { evaluateLoad } from "./score";
import { recommend } from "./recommend";
import type { Load, Place, TruckState } from "./types";
import { UNIT_TYPES } from "./types";
import { canHaul } from "./units";

const BASE_MS = Date.parse("2026-11-16T12:00:00.000Z");
const DAY_MS = 86_400_000;

// Points inside a bounding box around Mexico.
const placeArb: fc.Arbitrary<Place> = fc.record({
  cityId: fc.constantFrom("a", "b", "c", "d", "e", "f"),
  name: fc.constant("Somewhere"),
  lat: fc.double({ min: 15, max: 32, noNaN: true }),
  lng: fc.double({ min: -117, max: -87, noNaN: true }),
});

const isoArb = (minOffsetMs: number, maxOffsetMs: number) =>
  fc
    .integer({ min: minOffsetMs, max: maxOffsetMs })
    .map((o) => new Date(BASE_MS + o).toISOString());

const loadArb: fc.Arbitrary<Load> = fc
  .record({
    id: fc.uuid(),
    origin: placeArb,
    destination: placeArb,
    unitType: fc.constantFrom(...UNIT_TYPES),
    startOffset: fc.integer({ min: -DAY_MS, max: 5 * DAY_MS }),
    windowMs: fc.integer({ min: 0, max: 2 * DAY_MS }),
    weightKg: fc.integer({ min: 1_000, max: 60_000 }),
    rateMxn: fc.integer({ min: 0, max: 150_000 }),
  })
  .map(({ startOffset, windowMs, ...rest }) => ({
    ...rest,
    pickupStart: new Date(BASE_MS + startOffset).toISOString(),
    pickupEnd: new Date(BASE_MS + startOffset + windowMs).toISOString(),
    shipper: "Shipper",
    commodity: "carga general",
  }));

const truckArb: fc.Arbitrary<TruckState> = fc.record({
  unitType: fc.constantFrom(...UNIT_TYPES),
  position: placeArb,
  base: placeArb,
  availableAt: isoArb(0, DAY_MS),
});

const options = resolveOptions();

describe("engine invariants", () => {
  it("net profit never exceeds the rate and costs are never negative", () => {
    fc.assert(
      fc.property(truckArb, loadArb, (truck, load) => {
        const result = evaluateLoad(truck, load, options);
        if (!result.ok) return;
        const b = result.recommendation.breakdown;
        expect(b.netProfitMxn).toBeLessThanOrEqual(b.rateMxn);
        for (const cost of [b.deadheadFuelMxn, b.loadedFuelMxn, b.tollsMxn, b.maintenanceMxn]) {
          expect(cost).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });

  it("hard filters are never bypassed", () => {
    fc.assert(
      fc.property(truckArb, loadArb, (truck, load) => {
        const result = evaluateLoad(truck, load, options);
        if (!result.ok) return;
        const rec = result.recommendation;
        expect(canHaul(truck.unitType, load.unitType)).toBe(true);
        expect(rec.deadheadKm).toBeLessThanOrEqual(options.costs.maxDeadheadKm);
        expect(Date.parse(rec.pickupArrival)).toBeLessThanOrEqual(Date.parse(load.pickupEnd));
      }),
    );
  });

  it("time flows forward and the score is finite", () => {
    fc.assert(
      fc.property(truckArb, loadArb, (truck, load) => {
        const result = evaluateLoad(truck, load, options);
        if (!result.ok) return;
        const rec = result.recommendation;
        expect(rec.waitHours).toBeGreaterThanOrEqual(0);
        expect(Date.parse(rec.deliveredAt)).toBeGreaterThan(Date.parse(truck.availableAt));
        expect(Number.isFinite(rec.scorePerHour)).toBe(true);
      }),
    );
  });

  it("recommendations are sorted and never worse than going home empty", () => {
    fc.assert(
      fc.property(truckArb, fc.array(loadArb, { maxLength: 40 }), (truck, loads) => {
        const { recommendations, stats } = recommend(truck, loads, { limit: 10 });
        const rejected = Object.values(stats.rejected).reduce((a, b) => a + b, 0);
        expect(stats.feasible + rejected).toBe(loads.length);
        recommendations.forEach((rec, i) => {
          expect(rec.gainVsEmptyMxn).toBeGreaterThanOrEqual(0);
          if (i > 0)
            expect(rec.scorePerHour).toBeLessThanOrEqual(recommendations[i - 1]!.scorePerHour);
        });
      }),
      { numRuns: 50 },
    );
  });

  it("chains never reuse a load and never time-travel", () => {
    fc.assert(
      fc.property(truckArb, fc.array(loadArb, { maxLength: 30 }), (truck, loads) => {
        for (const { legs } of planChains(truck, loads, { beamWidth: 5 })) {
          expect(legs[0].load.id).not.toBe(legs[1].load.id);
          expect(Date.parse(legs[1].pickupArrival)).toBeGreaterThanOrEqual(
            Date.parse(legs[0].deliveredAt),
          );
        }
      }),
      { numRuns: 50 },
    );
  });
});
