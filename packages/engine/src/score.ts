import type { CostConfig, ResolvedOptions } from "./config";
import { roadKm } from "./geo";
import type {
  EmptyReturn,
  Load,
  Place,
  Recommendation,
  RejectionReason,
  TruckState,
} from "./types";
import { canHaul } from "./units";

const HOUR_MS = 3_600_000;
/** Guards against division by ~0 for degenerate inputs. */
const MIN_HOURS = 0.25;

export function emptyKmCostMxn(km: number, costs: CostConfig): number {
  const fuel = (km / costs.kmPerLiterEmpty) * costs.dieselMxnPerLiter;
  return fuel + km * (costs.tollMxnPerKm + costs.maintenanceMxnPerKm);
}

export function drivingHours(km: number, costs: CostConfig): number {
  return km / costs.avgSpeedKmh;
}

/** Baseline every recommendation is compared against: drive straight home empty. */
export function emptyReturnFrom(position: Place, base: Place, costs: CostConfig): EmptyReturn {
  const km = roadKm(position, base, costs.roadFactor);
  return { km, hours: drivingHours(km, costs), costMxn: emptyKmCostMxn(km, costs) };
}

export type Evaluation =
  { ok: true; recommendation: Recommendation } | { ok: false; reason: RejectionReason };

/**
 * Evaluate one load for one truck state.
 *
 * Hard filters (any failure discards the load):
 *   1. the truck's unit can haul the load's unit type;
 *   2. the pickup is within `maxDeadheadKm`;
 *   3. the truck can reach the pickup before the window closes.
 *
 * Money (all MXN):
 *   net profit    = rate − deadhead fuel − loaded fuel − tolls − maintenance
 *   gain vs empty = (net profit − cost to return home from destination)
 *                 − (−cost to return home right now)
 *
 * Ranking:
 *   score/hour = (net profit + home bonus − deadhead penalty − wait penalty) / total hours
 *   home bonus = weights.home × (empty-return cost now − empty-return cost after delivery)
 */
export function evaluateLoad(truck: TruckState, load: Load, options: ResolvedOptions): Evaluation {
  const { costs, weights } = options;

  if (!canHaul(truck.unitType, load.unitType)) return { ok: false, reason: "incompatible_unit" };

  const deadheadKm = roadKm(truck.position, load.origin, costs.roadFactor);
  if (deadheadKm > costs.maxDeadheadKm) return { ok: false, reason: "too_far" };

  const availableMs = Date.parse(truck.availableAt);
  const arrivalMs = availableMs + drivingHours(deadheadKm, costs) * HOUR_MS;
  const windowStartMs = Date.parse(load.pickupStart);
  const windowEndMs = Date.parse(load.pickupEnd);
  if (arrivalMs > windowEndMs) return { ok: false, reason: "window_missed" };

  const pickupMs = Math.max(arrivalMs, windowStartMs);
  const waitHours = (pickupMs - arrivalMs) / HOUR_MS;
  const loadedKm = roadKm(load.origin, load.destination, costs.roadFactor);
  const loadedHours = drivingHours(loadedKm, costs);
  const deliveredMs = pickupMs + (costs.handlingHours + loadedHours) * HOUR_MS;
  const totalHours = Math.max(MIN_HOURS, (deliveredMs - availableMs) / HOUR_MS);

  const deadheadFuelMxn = (deadheadKm / costs.kmPerLiterEmpty) * costs.dieselMxnPerLiter;
  const loadedFuelMxn = (loadedKm / costs.kmPerLiterLoaded) * costs.dieselMxnPerLiter;
  const totalKm = deadheadKm + loadedKm;
  const tollsMxn = totalKm * costs.tollMxnPerKm;
  const maintenanceMxn = totalKm * costs.maintenanceMxnPerKm;
  const netProfitMxn = load.rateMxn - deadheadFuelMxn - loadedFuelMxn - tollsMxn - maintenanceMxn;

  const now = emptyReturnFrom(truck.position, truck.base, costs);
  const after = emptyReturnFrom(load.destination, truck.base, costs);
  const homeBonusMxn = weights.home * (now.costMxn - after.costMxn);
  const gainVsEmptyMxn = netProfitMxn - after.costMxn + now.costMxn;

  const scoreValue =
    netProfitMxn +
    homeBonusMxn -
    weights.deadheadPenaltyMxnPerKm * deadheadKm -
    weights.waitPenaltyMxnPerHour * waitHours;

  return {
    ok: true,
    recommendation: {
      load,
      deadheadKm,
      loadedKm,
      pickupArrival: new Date(arrivalMs).toISOString(),
      waitHours,
      deliveredAt: new Date(deliveredMs).toISOString(),
      totalHours,
      breakdown: {
        rateMxn: load.rateMxn,
        deadheadFuelMxn,
        loadedFuelMxn,
        tollsMxn,
        maintenanceMxn,
        netProfitMxn,
      },
      returnHomeKm: after.km,
      returnHomeCostMxn: after.costMxn,
      kmCloserToBase: now.km - after.km,
      homeBonusMxn,
      gainVsEmptyMxn,
      scorePerHour: scoreValue / totalHours,
    },
  };
}
