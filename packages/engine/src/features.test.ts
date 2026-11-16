import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { planChains } from "./chains";
import { resolveOptions } from "./config";
import { chainChoiceFeatures, choiceFeatures } from "./features";
import { rankLoads } from "./recommend";
import { makeLoad, makeTruck, places } from "./test/fixtures";

const market = [
  makeLoad({ origin: places.laredo, destination: places.queretaro, rateMxn: 32_000 }),
  makeLoad({ origin: places.laredo, destination: places.monterrey, rateMxn: 9_000 }),
  makeLoad({ origin: places.monterrey, destination: places.slp, rateMxn: 18_000 }),
  makeLoad({ origin: places.saltillo, destination: places.guadalajara, rateMxn: 30_000 }),
  makeLoad({ origin: places.slp, destination: places.queretaro, rateMxn: 9_000 }),
];

const weightsArb = fc.record({
  home: fc.double({ min: 0, max: 3, noNaN: true }),
  deadheadPenaltyMxnPerKm: fc.double({ min: 0, max: 20, noNaN: true }),
  waitPenaltyMxnPerHour: fc.double({ min: 0, max: 800, noNaN: true }),
});

/** score/h rebuilt from features and weights: the identity the ML service relies on. */
const linearScore = (
  f: ReturnType<typeof choiceFeatures>,
  w: ReturnType<typeof resolveOptions>["weights"],
) =>
  f.net_per_hour +
  w.home * f.home_per_hour -
  w.deadheadPenaltyMxnPerKm * f.deadhead_per_hour -
  w.waitPenaltyMxnPerHour * f.wait_per_hour;

describe("choiceFeatures", () => {
  it("reproduces the engine score exactly for any weights", () => {
    fc.assert(
      fc.property(weightsArb, (weights) => {
        const { ranked } = rankLoads(makeTruck(), market, {
          weights,
          minGainVsEmptyMxn: Number.NEGATIVE_INFINITY,
        });
        expect(ranked.length).toBeGreaterThan(0);
        for (const rec of ranked) {
          expect(linearScore(choiceFeatures(rec), resolveOptions({ weights }).weights)).toBeCloseTo(
            rec.scorePerHour,
            6,
          );
        }
      }),
      { numRuns: 50 },
    );
  });

  it("does the same for 2-load chains", () => {
    fc.assert(
      fc.property(weightsArb, (weights) => {
        for (const chain of planChains(makeTruck(), market, {
          weights,
          minGainVsEmptyMxn: Number.NEGATIVE_INFINITY,
        })) {
          const f = chainChoiceFeatures(chain);
          expect(f.legs).toBe(2);
          expect(linearScore(f, resolveOptions({ weights }).weights)).toBeCloseTo(
            chain.scorePerHour,
            6,
          );
        }
      }),
      { numRuns: 30 },
    );
  });

  it("home savings is the empty trip home you avoid", () => {
    const [rec] = rankLoads(makeTruck(), market).ranked;
    const f = choiceFeatures(rec!);
    expect(f.home_savings_mxn).toBeCloseTo(rec!.homeBonusMxn, 6); // default w_home = 1
    expect(Object.values(f).every(Number.isFinite)).toBe(true);
  });
});
