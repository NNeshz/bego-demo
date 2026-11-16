/**
 * Cost model and scoring weights.
 *
 * All defaults are ASSUMPTIONS for a synthetic demo, not market data. They are
 * exposed so the UI/API can override them (diesel price, fuel efficiency, tolls…).
 */
export interface CostConfig {
  /** MXN per liter of diesel. */
  dieselMxnPerLiter: number;
  /** Fuel efficiency when loaded (km per liter). */
  kmPerLiterLoaded: number;
  /** Fuel efficiency when empty (km per liter). Empty trucks burn less. */
  kmPerLiterEmpty: number;
  /** Estimated tolls per road km (5-axle tractor-trailer average). */
  tollMxnPerKm: number;
  /** Tires, maintenance and wear per road km. */
  maintenanceMxnPerKm: number;
  /** Straight-line → road distance multiplier. Roads are never straight. */
  roadFactor: number;
  /** Average road speed including stops (km/h). */
  avgSpeedKmh: number;
  /** Hours spent loading + unloading a single load. */
  handlingHours: number;
  /** Hard filter: never suggest a pickup further than this (road km). */
  maxDeadheadKm: number;
}

/**
 * Tunable preferences on top of pure money. These are the parameters a
 * feedback model (logistic regression on accept/reject events) would learn.
 */
export interface ScoreWeights {
  /** How much the trucker values getting closer to base, as a multiplier of the empty-km savings. */
  home: number;
  /** Extra perceived cost per empty km (risk, fatigue) beyond fuel and tolls. */
  deadheadPenaltyMxnPerKm: number;
  /** Perceived cost of each hour waiting for a pickup window. */
  waitPenaltyMxnPerHour: number;
}

export const DEFAULT_COST_CONFIG: CostConfig = {
  dieselMxnPerLiter: 26,
  kmPerLiterLoaded: 2.4,
  kmPerLiterEmpty: 3.0,
  tollMxnPerKm: 4.5,
  maintenanceMxnPerKm: 2,
  roadFactor: 1.25,
  avgSpeedKmh: 60,
  handlingHours: 3,
  maxDeadheadKm: 450,
};

export const DEFAULT_WEIGHTS: ScoreWeights = {
  home: 1,
  deadheadPenaltyMxnPerKm: 0,
  waitPenaltyMxnPerHour: 0,
};

export interface EngineOptions {
  costs?: Partial<CostConfig>;
  weights?: Partial<ScoreWeights>;
}

export interface ResolvedOptions {
  costs: CostConfig;
  weights: ScoreWeights;
}

export function resolveOptions(options: EngineOptions = {}): ResolvedOptions {
  return {
    costs: { ...DEFAULT_COST_CONFIG, ...options.costs },
    weights: { ...DEFAULT_WEIGHTS, ...options.weights },
  };
}
