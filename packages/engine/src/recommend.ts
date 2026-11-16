import { resolveOptions, type EngineOptions } from "./config";
import { emptyReturnFrom, evaluateLoad } from "./score";
import type { Load, Recommendation, RecommendResult, RejectionReason, TruckState } from "./types";

export interface RecommendOptions extends EngineOptions {
  /** How many recommendations to return. Default 5. */
  limit?: number;
  /**
   * Only recommend loads that beat driving home empty by at least this much (MXN).
   * Default 0: never recommend something worse than going home empty.
   */
  minGainVsEmptyMxn?: number;
}

/** Highest score first; ties broken by load id so results are fully deterministic. */
export function byScoreDesc(a: Recommendation, b: Recommendation): number {
  return b.scorePerHour - a.scorePerHour || a.load.id.localeCompare(b.load.id);
}

/** Evaluate every load and return all feasible, worthwhile ones, best first. */
export function rankLoads(
  truck: TruckState,
  loads: readonly Load[],
  options: RecommendOptions = {},
): { ranked: Recommendation[]; stats: RecommendResult["stats"] } {
  const resolved = resolveOptions(options);
  const minGain = options.minGainVsEmptyMxn ?? 0;
  const rejected: Record<RejectionReason, number> = {
    incompatible_unit: 0,
    too_far: 0,
    window_missed: 0,
    not_worth_it: 0,
  };
  const ranked: Recommendation[] = [];

  for (const load of loads) {
    const evaluation = evaluateLoad(truck, load, resolved);
    if (!evaluation.ok) {
      rejected[evaluation.reason]++;
    } else if (evaluation.recommendation.gainVsEmptyMxn < minGain) {
      rejected.not_worth_it++;
    } else {
      ranked.push(evaluation.recommendation);
    }
  }

  ranked.sort(byScoreDesc);
  return { ranked, stats: { evaluated: loads.length, feasible: ranked.length, rejected } };
}

/** Top return loads for a truck that just unloaded. */
export function recommend(
  truck: TruckState,
  loads: readonly Load[],
  options: RecommendOptions = {},
): RecommendResult {
  const { costs } = resolveOptions(options);
  const { ranked, stats } = rankLoads(truck, loads, options);
  return {
    recommendations: ranked.slice(0, options.limit ?? 5),
    emptyReturn: emptyReturnFrom(truck.position, truck.base, costs),
    stats,
  };
}
