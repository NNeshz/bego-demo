import { describe, expect, it } from "vitest";
import { resolveOptions } from "./config";
import { emptyReturnFrom, evaluateLoad } from "./score";
import { hoursAfter, makeLoad, makeTruck, places, T0 } from "./test/fixtures";
import type { Place, Recommendation } from "./types";

const options = resolveOptions();

function mustEvaluate(...args: Parameters<typeof evaluateLoad>): Recommendation {
  const result = evaluateLoad(...args);
  if (!result.ok) throw new Error(`expected feasible load, got ${result.reason}`);
  return result.recommendation;
}

describe("evaluateLoad · hard filters", () => {
  it("rejects incompatible units", () => {
    const load = makeLoad({
      origin: places.laredo,
      destination: places.queretaro,
      unitType: "flatbed_48",
    });
    expect(evaluateLoad(makeTruck(), load, options)).toEqual({
      ok: false,
      reason: "incompatible_unit",
    });
  });

  it("lets a reefer haul dry freight, but not the other way around", () => {
    const dry = makeLoad({
      origin: places.laredo,
      destination: places.queretaro,
      unitType: "dry_van_53",
    });
    const cold = makeLoad({
      origin: places.laredo,
      destination: places.queretaro,
      unitType: "reefer_53",
    });
    expect(evaluateLoad(makeTruck({ unitType: "reefer_53" }), dry, options).ok).toBe(true);
    expect(evaluateLoad(makeTruck({ unitType: "dry_van_53" }), cold, options).ok).toBe(false);
  });

  it("rejects pickups beyond the max deadhead distance", () => {
    const load = makeLoad({ origin: places.hermosillo, destination: places.queretaro });
    expect(evaluateLoad(makeTruck(), load, options)).toEqual({ ok: false, reason: "too_far" });
  });

  it("rejects loads whose pickup window closes before the truck can arrive", () => {
    // Monterrey is ~4.6 h of driving from Nuevo Laredo; the window closes in 2 h.
    const load = makeLoad({
      origin: places.monterrey,
      destination: places.queretaro,
      pickupStart: T0,
      pickupEnd: hoursAfter(T0, 2),
    });
    expect(evaluateLoad(makeTruck(), load, options)).toEqual({
      ok: false,
      reason: "window_missed",
    });
  });

  it("waits when arriving before the window opens", () => {
    const load = makeLoad({
      origin: places.laredo,
      destination: places.queretaro,
      pickupStart: hoursAfter(T0, 5),
      pickupEnd: hoursAfter(T0, 10),
    });
    const rec = mustEvaluate(makeTruck(), load, options);
    expect(rec.waitHours).toBeCloseTo(5, 6);
  });
});

describe("evaluateLoad · money", () => {
  it("net profit is the rate minus every cost", () => {
    const load = makeLoad({ origin: places.monterrey, destination: places.queretaro });
    const { breakdown: b } = mustEvaluate(makeTruck(), load, options);
    expect(b.netProfitMxn).toBeCloseTo(
      b.rateMxn - b.deadheadFuelMxn - b.loadedFuelMxn - b.tollsMxn - b.maintenanceMxn,
      6,
    );
  });

  it("gain vs empty compares against driving home empty right now", () => {
    const truck = makeTruck();
    const load = makeLoad({ origin: places.monterrey, destination: places.queretaro });
    const rec = mustEvaluate(truck, load, options);
    const emptyNow = emptyReturnFrom(truck.position, truck.base, options.costs);
    // Delivering at base: no return cost left, so the gain is net + what we saved by not driving home empty.
    expect(rec.returnHomeKm).toBe(0);
    expect(rec.gainVsEmptyMxn).toBeCloseTo(rec.breakdown.netProfitMxn + emptyNow.costMxn, 6);
  });

  it("home weight 0 removes the home bonus but not the money comparison", () => {
    const load = makeLoad({ origin: places.laredo, destination: places.monterrey });
    const weighted = mustEvaluate(makeTruck(), load, options);
    const unweighted = mustEvaluate(makeTruck(), load, resolveOptions({ weights: { home: 0 } }));
    expect(unweighted.homeBonusMxn).toBe(0);
    expect(unweighted.gainVsEmptyMxn).toBeCloseTo(weighted.gainVsEmptyMxn, 6);
  });
});

describe("evaluateLoad · intuitive rankings", () => {
  it("same loaded leg and rate, closer pickup wins", () => {
    // Controlled geometry near the equator: both origins are exactly 2° from the
    // destination (equal loaded km), but one is where the truck already is.
    // With real cities the loaded legs differ, which can cancel out the deadhead.
    const hub: Place = { cityId: "hub", name: "Hub", lat: 0, lng: 0 };
    const here: Place = { cityId: "here", name: "Here", lat: 2, lng: 0 };
    const there: Place = { cityId: "there", name: "There", lat: 0, lng: 2 };
    const truck = makeTruck({ position: here, base: hub });
    const near = makeLoad({ origin: here, destination: hub });
    const far = makeLoad({ origin: there, destination: hub });
    const a = mustEvaluate(truck, near, options);
    const b = mustEvaluate(truck, far, options);
    expect(a.loadedKm).toBeCloseTo(b.loadedKm, 6);
    expect(a.scorePerHour).toBeGreaterThan(b.scorePerHour);
    expect(a.gainVsEmptyMxn).toBeGreaterThan(b.gainVsEmptyMxn);
  });

  it("same rate and distance, the load heading home wins", () => {
    // From Monterrey, Saltillo and Nuevo Laredo are similar distances; SLP is on the way to Querétaro.
    const truck = makeTruck({ position: places.monterrey });
    const towardHome = makeLoad({
      origin: places.monterrey,
      destination: places.slp,
      rateMxn: 20_000,
    });
    const awayFromHome = makeLoad({
      origin: places.monterrey,
      destination: places.laredo,
      rateMxn: 20_000,
    });
    const home = mustEvaluate(truck, towardHome, options);
    const away = mustEvaluate(truck, awayFromHome, options);
    expect(home.kmCloserToBase).toBeGreaterThan(0);
    expect(away.kmCloserToBase).toBeLessThan(0);
    expect(home.scorePerHour).toBeGreaterThan(away.scorePerHour);
  });

  it("a much better rate can beat a closer pickup", () => {
    const cheapNear = makeLoad({
      origin: places.laredo,
      destination: places.queretaro,
      rateMxn: 25_000,
    });
    const richFar = makeLoad({
      origin: places.monterrey,
      destination: places.queretaro,
      rateMxn: 45_000,
    });
    const a = mustEvaluate(makeTruck(), cheapNear, options);
    const b = mustEvaluate(makeTruck(), richFar, options);
    expect(b.scorePerHour).toBeGreaterThan(a.scorePerHour);
  });
});
