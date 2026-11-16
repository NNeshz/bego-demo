import { describe, expect, it } from "vitest";
import { evaluateChain, planChains } from "./chains";
import { recommend } from "./recommend";
import { hoursAfter, makeLoad, makeTruck, places, T0 } from "./test/fixtures";

const market = [
  makeLoad({ origin: places.laredo, destination: places.queretaro, rateMxn: 32_000 }),
  makeLoad({ origin: places.laredo, destination: places.monterrey, rateMxn: 9_000 }),
  makeLoad({ origin: places.monterrey, destination: places.slp, rateMxn: 18_000 }),
  makeLoad({ origin: places.monterrey, destination: places.cdmx, rateMxn: 40_000 }),
  makeLoad({ origin: places.saltillo, destination: places.guadalajara, rateMxn: 30_000 }),
  makeLoad({
    origin: places.slp,
    destination: places.queretaro,
    rateMxn: 9_000,
    pickupEnd: hoursAfter(T0, 72),
  }),
  makeLoad({
    origin: places.laredo,
    destination: places.cdmx,
    rateMxn: 38_000,
    unitType: "reefer_53",
  }),
  makeLoad({ origin: places.hermosillo, destination: places.queretaro, rateMxn: 80_000 }),
  // Pays almost nothing: should lose against going home empty.
  makeLoad({
    origin: places.laredo,
    destination: places.hermosillo,
    rateMxn: 1_000,
    pickupEnd: hoursAfter(T0, 72),
  }),
];

describe("recommend", () => {
  const truck = makeTruck();
  const result = recommend(truck, market);

  it("returns at most `limit` results, best first", () => {
    expect(recommend(truck, market, { limit: 2 }).recommendations).toHaveLength(2);
    const scores = result.recommendations.map((r) => r.scorePerHour);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("only recommends loads that beat going home empty", () => {
    for (const rec of result.recommendations) expect(rec.gainVsEmptyMxn).toBeGreaterThanOrEqual(0);
    expect(result.stats.rejected.not_worth_it).toBeGreaterThan(0);
  });

  it("accounts for every load in the stats", () => {
    const rejected = Object.values(result.stats.rejected).reduce((a, b) => a + b, 0);
    expect(result.stats.feasible + rejected).toBe(result.stats.evaluated);
    expect(result.stats.rejected.incompatible_unit).toBe(1);
    // Hermosillo and San Luis Potosí are both > 450 road km from Nuevo Laredo.
    expect(result.stats.rejected.too_far).toBe(2);
  });

  it("reports the empty-return baseline", () => {
    expect(result.emptyReturn.km).toBeGreaterThan(800);
    expect(result.emptyReturn.costMxn).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    expect(recommend(truck, market)).toEqual(result);
  });

  it("returns an empty list (not an error) when nothing fits", () => {
    const none = recommend(makeTruck({ unitType: "torton" }), market);
    expect(none.recommendations).toEqual([]);
    expect(none.stats.rejected.incompatible_unit).toBe(market.length);
  });
});

describe("planChains", () => {
  const truck = makeTruck();
  const chains = planChains(truck, market);

  it("finds chains of two different loads", () => {
    expect(chains.length).toBeGreaterThan(0);
    for (const { legs } of chains) expect(legs[0].load.id).not.toBe(legs[1].load.id);
  });

  it("starts the second leg after the first one is delivered", () => {
    for (const { legs } of chains) {
      expect(Date.parse(legs[1].pickupArrival)).toBeGreaterThanOrEqual(
        Date.parse(legs[0].deliveredAt),
      );
    }
  });

  it("adds up money and compares against going home empty", () => {
    const emptyNow = recommend(truck, market).emptyReturn.costMxn;
    for (const chain of chains) {
      const [a, b] = chain.legs;
      expect(chain.netProfitMxn).toBeCloseTo(
        a.breakdown.netProfitMxn + b.breakdown.netProfitMxn,
        6,
      );
      expect(chain.gainVsEmptyMxn).toBeCloseTo(
        chain.netProfitMxn - chain.returnHomeCostMxn + emptyNow,
        6,
      );
      expect(chain.gainVsEmptyMxn).toBeGreaterThanOrEqual(0);
    }
  });

  it("respects the beam width", () => {
    expect(planChains(truck, market, { beamWidth: 1, limit: 50 }).length).toBeLessThanOrEqual(1);
  });

  it("is sorted best first", () => {
    const scores = chains.map((c) => c.scorePerHour);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});

describe("evaluateChain", () => {
  const truck = makeTruck();

  it("rebuilds exactly the chain planChains found", () => {
    const [best] = planChains(truck, market);
    const rebuilt = evaluateChain(truck, best!.legs[0].load, best!.legs[1].load);
    expect(rebuilt).toEqual(best);
  });

  it("returns null for infeasible or repeated legs", () => {
    const [a] = market;
    expect(evaluateChain(truck, a!, a!)).toBeNull();
    const farAway = market.find((l) => l.origin.cityId === "hermosillo")!;
    expect(evaluateChain(truck, farAway, a!)).toBeNull();
  });
});
