/**
 * Domain types for the recommendation engine.
 *
 * The engine is pure: it receives fully-resolved data (places carry their own
 * coordinates) and never touches a database, the network or the clock.
 * Timestamps are ISO-8601 strings at the boundary and epoch milliseconds inside.
 */

export const UNIT_TYPES = [
  "dry_van_53",
  "reefer_53",
  "flatbed_48",
  "full_double",
  "torton",
] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** A named location (usually a city). */
export interface Place extends GeoPoint {
  cityId: string;
  name: string;
}

export interface Load {
  id: string;
  origin: Place;
  destination: Place;
  unitType: UnitType;
  /** Earliest pickup time (ISO-8601). */
  pickupStart: string;
  /** Latest pickup time (ISO-8601). Arriving after this makes the load unreachable. */
  pickupEnd: string;
  weightKg: number;
  rateMxn: number;
  shipper: string;
  commodity: string;
}

/** Where a truck is, what it pulls and where it wants to end up. */
export interface TruckState {
  truckId?: string;
  unitType: UnitType;
  /** Where the truck becomes available (usually the unload point). */
  position: Place;
  /** When the truck becomes available at `position` (ISO-8601). */
  availableAt: string;
  base: Place;
}

/** Money breakdown of a single leg, in MXN. Drives the waterfall chart. */
export interface CostBreakdown {
  rateMxn: number;
  deadheadFuelMxn: number;
  loadedFuelMxn: number;
  tollsMxn: number;
  maintenanceMxn: number;
  /** rate − fuel − tolls − maintenance. What the load itself leaves in the pocket. */
  netProfitMxn: number;
}

/** A load evaluated for a specific truck state. */
export interface Recommendation {
  load: Load;
  deadheadKm: number;
  loadedKm: number;
  /** When the truck reaches the pickup point (ISO-8601). */
  pickupArrival: string;
  /** Hours waiting for the pickup window to open. */
  waitHours: number;
  /** When the load is delivered and the truck is free again (ISO-8601). */
  deliveredAt: string;
  /** Deadhead + wait + loading/unloading + loaded driving. */
  totalHours: number;
  breakdown: CostBreakdown;
  /** Empty km still needed to get from the destination back to base. */
  returnHomeKm: number;
  returnHomeCostMxn: number;
  /** Positive when the destination is closer to base than the current position. */
  kmCloserToBase: number;
  /** Weighted value of getting closer to base (see ScoreWeights.home). */
  homeBonusMxn: number;
  /** Money compared with driving straight home empty. The headline number in the UI. */
  gainVsEmptyMxn: number;
  /** Ranking metric: (net profit + home bonus − penalties) per hour. */
  scorePerHour: number;
}

/** Baseline: drive straight home empty. */
export interface EmptyReturn {
  km: number;
  hours: number;
  costMxn: number;
}

/** Hard-filter failures, plus loads that are feasible but lose against going home empty. */
export type RejectionReason = "incompatible_unit" | "window_missed" | "too_far" | "not_worth_it";

export interface RecommendResult {
  recommendations: Recommendation[];
  emptyReturn: EmptyReturn;
  /** How many loads were evaluated and why the rest were filtered out. Powers the empty state. */
  stats: {
    evaluated: number;
    feasible: number;
    rejected: Record<RejectionReason, number>;
  };
}

export interface Chain {
  legs: [Recommendation, Recommendation];
  netProfitMxn: number;
  totalHours: number;
  totalEmptyKm: number;
  totalLoadedKm: number;
  returnHomeKm: number;
  returnHomeCostMxn: number;
  homeBonusMxn: number;
  gainVsEmptyMxn: number;
  scorePerHour: number;
}
