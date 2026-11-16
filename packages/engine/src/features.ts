/**
 * Choice features: what a ranking model sees about each option shown to a trucker.
 *
 * They mirror the score exactly. The engine ranks by
 *
 *   score/h = (net + w_home·home − p_deadhead·deadhead − p_wait·wait) / hours
 *           = 1·net_per_hour + w_home·home_per_hour − p_deadhead·deadhead_per_hour − p_wait·wait_per_hour
 *
 * so a logistic model trained on the four *_per_hour columns learns coefficients
 * β whose ratios to β_net ARE the engine weights, in MXN:
 *   w_home = β_home / β_net,  p_deadhead = −β_deadhead / β_net,  p_wait = −β_wait / β_net
 */
import type { Chain, Recommendation } from "./types";

export const MODEL_FEATURES = [
  "net_per_hour",
  "home_per_hour",
  "deadhead_per_hour",
  "wait_per_hour",
] as const;
export type ModelFeature = (typeof MODEL_FEATURES)[number];

export interface ChoiceFeatures extends Record<ModelFeature, number> {
  /** Raw components, kept for analysis and reports. */
  net_profit_mxn: number;
  /** Cost of the empty km you avoid by ending closer to base: emptyNow − emptyAfter (MXN). */
  home_savings_mxn: number;
  deadhead_km: number;
  wait_hours: number;
  total_hours: number;
  legs: number;
}

function build(parts: {
  net: number;
  home: number;
  deadhead: number;
  wait: number;
  hours: number;
  legs: number;
}): ChoiceFeatures {
  const h = parts.hours;
  return {
    net_profit_mxn: parts.net,
    home_savings_mxn: parts.home,
    deadhead_km: parts.deadhead,
    wait_hours: parts.wait,
    total_hours: h,
    legs: parts.legs,
    net_per_hour: parts.net / h,
    home_per_hour: parts.home / h,
    deadhead_per_hour: parts.deadhead / h,
    wait_per_hour: parts.wait / h,
  };
}

export function choiceFeatures(rec: Recommendation): ChoiceFeatures {
  return build({
    net: rec.breakdown.netProfitMxn,
    // gainVsEmpty = net − emptyAfter + emptyNow  ⇒  emptyNow − emptyAfter = gainVsEmpty − net
    home: rec.gainVsEmptyMxn - rec.breakdown.netProfitMxn,
    deadhead: rec.deadheadKm,
    wait: rec.waitHours,
    hours: rec.totalHours,
    legs: 1,
  });
}

export function chainChoiceFeatures(chain: Chain): ChoiceFeatures {
  return build({
    net: chain.netProfitMxn,
    home: chain.gainVsEmptyMxn - chain.netProfitMxn,
    deadhead: chain.totalEmptyKm,
    wait: chain.legs[0].waitHours + chain.legs[1].waitHours,
    hours: chain.totalHours,
    legs: 2,
  });
}
