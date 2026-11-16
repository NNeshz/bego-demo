import { resolveOptions, type EngineOptions } from "./config";
import { rankLoads } from "./recommend";
import { emptyReturnFrom, evaluateLoad } from "./score";
import type { Chain, Load, Recommendation, TruckState } from "./types";

export interface ChainOptions extends EngineOptions {
  /** How many chains to return. Default 5. */
  limit?: number;
  /** Candidates kept per leg. Default 20 → at most 20 × 20 = 400 combinations. */
  beamWidth?: number;
  /** Only return chains that beat going home empty by at least this much. Default 0. */
  minGainVsEmptyMxn?: number;
}

/**
 * Best 2-load chains (bounded beam search).
 *
 * Exhaustive search over pairs is O(n²) evaluations. Instead we keep the top
 * `beamWidth` first legs by score and, from each destination, the top
 * `beamWidth` second legs: O(beamWidth · n) evaluations + beamWidth² combos.
 *
 * First legs are NOT required to beat going home on their own: a load that
 * pulls you away from base can still be the best opening of a chain.
 */
export function planChains(
  truck: TruckState,
  loads: readonly Load[],
  options: ChainOptions = {},
): Chain[] {
  const { costs, weights } = resolveOptions(options);
  const beamWidth = options.beamWidth ?? 20;
  const minGain = options.minGainVsEmptyMxn ?? 0;
  const anyGain = { ...options, minGainVsEmptyMxn: Number.NEGATIVE_INFINITY };
  const emptyNow = emptyReturnFrom(truck.position, truck.base, costs);

  const firstLegs = rankLoads(truck, loads, anyGain).ranked.slice(0, beamWidth);
  const chains: Chain[] = [];

  for (const first of firstLegs) {
    const nextState: TruckState = {
      ...truck,
      position: first.load.destination,
      availableAt: first.deliveredAt,
    };
    const remaining = loads.filter((load) => load.id !== first.load.id);
    const secondLegs = rankLoads(nextState, remaining, anyGain).ranked.slice(0, beamWidth);

    for (const second of secondLegs) {
      const chain = combine(first, second, emptyNow.costMxn, weights.home, {
        deadhead: weights.deadheadPenaltyMxnPerKm,
        wait: weights.waitPenaltyMxnPerHour,
      });
      if (chain.gainVsEmptyMxn >= minGain) chains.push(chain);
    }
  }

  chains.sort((a, b) => b.scorePerHour - a.scorePerHour || chainKey(a).localeCompare(chainKey(b)));
  return chains.slice(0, options.limit ?? 5);
}

/**
 * Evaluate one specific chain (e.g. to rebuild it from two load ids in a URL).
 * Returns null if either leg is infeasible for the truck.
 */
export function evaluateChain(
  truck: TruckState,
  first: Load,
  second: Load,
  options: EngineOptions = {},
): Chain | null {
  if (first.id === second.id) return null;
  const resolved = resolveOptions(options);
  const firstEval = evaluateLoad(truck, first, resolved);
  if (!firstEval.ok) return null;
  const leg1 = firstEval.recommendation;
  const secondEval = evaluateLoad(
    { ...truck, position: first.destination, availableAt: leg1.deliveredAt },
    second,
    resolved,
  );
  if (!secondEval.ok) return null;
  const emptyNow = emptyReturnFrom(truck.position, truck.base, resolved.costs);
  return combine(leg1, secondEval.recommendation, emptyNow.costMxn, resolved.weights.home, {
    deadhead: resolved.weights.deadheadPenaltyMxnPerKm,
    wait: resolved.weights.waitPenaltyMxnPerHour,
  });
}

function chainKey(chain: Chain): string {
  return `${chain.legs[0].load.id}>${chain.legs[1].load.id}`;
}

function combine(
  first: Recommendation,
  second: Recommendation,
  emptyNowCostMxn: number,
  homeWeight: number,
  penalties: { deadhead: number; wait: number },
): Chain {
  const netProfitMxn = first.breakdown.netProfitMxn + second.breakdown.netProfitMxn;
  // Leg 2 starts exactly when leg 1 is delivered, so hours add up to elapsed time.
  const totalHours = first.totalHours + second.totalHours;
  const totalEmptyKm = first.deadheadKm + second.deadheadKm;
  const homeBonusMxn = homeWeight * (emptyNowCostMxn - second.returnHomeCostMxn);
  const scoreValue =
    netProfitMxn +
    homeBonusMxn -
    penalties.deadhead * totalEmptyKm -
    penalties.wait * (first.waitHours + second.waitHours);

  return {
    legs: [first, second],
    netProfitMxn,
    totalHours,
    totalEmptyKm,
    totalLoadedKm: first.loadedKm + second.loadedKm,
    returnHomeKm: second.returnHomeKm,
    returnHomeCostMxn: second.returnHomeCostMxn,
    homeBonusMxn,
    gainVsEmptyMxn: netProfitMxn - second.returnHomeCostMxn + emptyNowCostMxn,
    scorePerHour: scoreValue / totalHours,
  };
}
