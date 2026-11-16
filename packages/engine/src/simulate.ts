import { resolveOptions, type EngineOptions } from "./config";
import { rankLoads } from "./recommend";
import { drivingHours, emptyReturnFrom } from "./score";
import type { Load, Place, Recommendation, TruckState, UnitType } from "./types";

const HOUR_MS = 3_600_000;

export interface FleetTruck {
  id: string;
  unitType: UnitType;
  base: Place;
}

/**
 * - `empty_return`: today's behavior. Take the best load leaving from your base,
 *   deliver it, drive home empty, repeat.
 * - `recommended`: at every decision point take the engine's best recommendation
 *   that beats going home empty; otherwise drive home.
 */
export type SimulationPolicy = "empty_return" | "recommended";

export type SegmentKind = "empty" | "loaded" | "idle";

export interface SimSegment {
  truckId: string;
  kind: SegmentKind;
  from: Place;
  to: Place;
  /** Epoch ms. Numbers (not ISO strings) so the UI can interpolate positions cheaply. */
  startMs: number;
  endMs: number;
  km: number;
  revenueMxn: number;
  costMxn: number;
  loadId?: string;
}

export interface SimTotals {
  loadedKm: number;
  emptyKm: number;
  /** Share of driven km that were empty, 0–100. */
  emptyKmPct: number;
  revenueMxn: number;
  costMxn: number;
  netMxn: number;
  loadsDelivered: number;
}

export interface SimSeriesPoint extends Omit<SimTotals, "loadsDelivered"> {
  hour: number;
  atMs: number;
}

export interface SimulationResult {
  policy: SimulationPolicy;
  startMs: number;
  endMs: number;
  segments: SimSegment[];
  /** Cumulative KPIs, one point per hour (prorated within segments). Drives the live counter. */
  series: SimSeriesPoint[];
  totals: SimTotals;
}

export interface SimulationOptions extends EngineOptions {
  /** Simulation start (ISO-8601). */
  start: string;
  /** Default 7. */
  days?: number;
  /** In `empty_return`, "from your base" means a pickup within this many road km. Default 80. */
  baselineMaxDeadheadKm?: number;
  /** How long a truck waits at base when nothing is worth taking. Default 4h. */
  idleHours?: number;
}

interface TruckRuntime {
  truck: FleetTruck;
  position: Place;
  availableMs: number;
}

export function simulateWeek(
  fleet: readonly FleetTruck[],
  loads: readonly Load[],
  policy: SimulationPolicy,
  options: SimulationOptions,
): SimulationResult {
  const { costs } = resolveOptions(options);
  const startMs = Date.parse(options.start);
  const endMs = startMs + (options.days ?? 7) * 24 * HOUR_MS;
  const idleMs = (options.idleHours ?? 4) * HOUR_MS;
  const baselineMaxDeadheadKm = options.baselineMaxDeadheadKm ?? 80;

  const pool = new Map(loads.map((load) => [load.id, load]));
  const runtimes: TruckRuntime[] = [...fleet]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((truck) => ({ truck, position: truck.base, availableMs: startMs }));
  const segments: SimSegment[] = [];

  for (;;) {
    const runtime = nextTruck(runtimes, endMs);
    if (!runtime) break;

    const state: TruckState = {
      truckId: runtime.truck.id,
      unitType: runtime.truck.unitType,
      position: runtime.position,
      availableAt: new Date(runtime.availableMs).toISOString(),
      base: runtime.truck.base,
    };
    const atBase = runtime.position.cityId === runtime.truck.base.cityId;
    const choice = chooseLoad(state, [...pool.values()], policy, atBase, {
      ...options,
      baselineMaxDeadheadKm,
    });

    if (choice) {
      pool.delete(choice.load.id);
      segments.push(...haul(runtime, choice));
    } else if (!atBase) {
      segments.push(driveHome(runtime, costs));
    } else {
      segments.push({
        truckId: runtime.truck.id,
        kind: "idle",
        from: runtime.position,
        to: runtime.position,
        startMs: runtime.availableMs,
        endMs: runtime.availableMs + idleMs,
        km: 0,
        revenueMxn: 0,
        costMxn: 0,
      });
      runtime.availableMs += idleMs;
    }
  }

  const series = buildSeries(segments, startMs, endMs);
  const last = series[series.length - 1]!;
  const loadsDelivered = segments.filter((s) => s.kind === "loaded" && s.endMs <= endMs).length;
  const { hour: _hour, atMs: _atMs, ...totals } = last;

  return { policy, startMs, endMs, segments, series, totals: { ...totals, loadsDelivered } };
}

/** Earliest-available truck acts next; ties broken by id (runtimes are pre-sorted). */
function nextTruck(runtimes: TruckRuntime[], endMs: number): TruckRuntime | undefined {
  let next: TruckRuntime | undefined;
  for (const runtime of runtimes) {
    if (runtime.availableMs >= endMs) continue;
    if (!next || runtime.availableMs < next.availableMs) next = runtime;
  }
  return next;
}

function chooseLoad(
  state: TruckState,
  pool: Load[],
  policy: SimulationPolicy,
  atBase: boolean,
  options: SimulationOptions & { baselineMaxDeadheadKm: number },
): Recommendation | undefined {
  if (policy === "recommended") {
    return rankLoads(state, pool, { ...options, minGainVsEmptyMxn: 0 }).ranked[0];
  }
  // Baseline: only looks for work at home, and only cares that the load itself pays.
  if (!atBase) return undefined;
  const { ranked } = rankLoads(state, pool, {
    ...options,
    costs: { ...options.costs, maxDeadheadKm: options.baselineMaxDeadheadKm },
    minGainVsEmptyMxn: Number.NEGATIVE_INFINITY,
  });
  return ranked.find((rec) => rec.breakdown.netProfitMxn > 0);
}

function haul(runtime: TruckRuntime, rec: Recommendation): SimSegment[] {
  const truckId = runtime.truck.id;
  const out: SimSegment[] = [];
  const arrivalMs = Date.parse(rec.pickupArrival);
  const deliveredMs = Date.parse(rec.deliveredAt);
  const pickupMs = arrivalMs + rec.waitHours * HOUR_MS;
  const { breakdown } = rec;
  const deadheadCost = rec.deadheadKm > 0 ? breakdown.deadheadFuelMxn : 0;
  const perKmShared =
    (breakdown.tollsMxn + breakdown.maintenanceMxn) / (rec.deadheadKm + rec.loadedKm || 1);

  if (rec.deadheadKm > 0.5) {
    out.push({
      truckId,
      kind: "empty",
      from: runtime.position,
      to: rec.load.origin,
      startMs: runtime.availableMs,
      endMs: arrivalMs,
      km: rec.deadheadKm,
      revenueMxn: 0,
      costMxn: deadheadCost + perKmShared * rec.deadheadKm,
      loadId: rec.load.id,
    });
  }
  if (rec.waitHours > 0) {
    out.push({
      truckId,
      kind: "idle",
      from: rec.load.origin,
      to: rec.load.origin,
      startMs: arrivalMs,
      endMs: pickupMs,
      km: 0,
      revenueMxn: 0,
      costMxn: 0,
      loadId: rec.load.id,
    });
  }
  out.push({
    truckId,
    kind: "loaded",
    from: rec.load.origin,
    to: rec.load.destination,
    startMs: pickupMs,
    endMs: deliveredMs,
    km: rec.loadedKm,
    revenueMxn: breakdown.rateMxn,
    costMxn: breakdown.loadedFuelMxn + perKmShared * rec.loadedKm,
    loadId: rec.load.id,
  });

  runtime.position = rec.load.destination;
  runtime.availableMs = deliveredMs;
  return out;
}

function driveHome(
  runtime: TruckRuntime,
  costs: ReturnType<typeof resolveOptions>["costs"],
): SimSegment {
  const home = emptyReturnFrom(runtime.position, runtime.truck.base, costs);
  const segment: SimSegment = {
    truckId: runtime.truck.id,
    kind: "empty",
    from: runtime.position,
    to: runtime.truck.base,
    startMs: runtime.availableMs,
    endMs: runtime.availableMs + drivingHours(home.km, costs) * HOUR_MS,
    km: home.km,
    revenueMxn: 0,
    costMxn: home.costMxn,
  };
  runtime.position = runtime.truck.base;
  runtime.availableMs = segment.endMs;
  return segment;
}

/** Cumulative KPIs per hour; a segment contributes proportionally to how much of it has elapsed. */
function buildSeries(segments: SimSegment[], startMs: number, endMs: number): SimSeriesPoint[] {
  const hours = Math.round((endMs - startMs) / HOUR_MS);
  const series: SimSeriesPoint[] = [];

  for (let hour = 0; hour <= hours; hour++) {
    const atMs = startMs + hour * HOUR_MS;
    let loadedKm = 0;
    let emptyKm = 0;
    let revenueMxn = 0;
    let costMxn = 0;

    for (const s of segments) {
      if (s.startMs >= atMs) continue;
      const duration = s.endMs - s.startMs;
      const fraction = duration <= 0 ? 1 : Math.min(1, (atMs - s.startMs) / duration);
      if (s.kind === "loaded") loadedKm += s.km * fraction;
      if (s.kind === "empty") emptyKm += s.km * fraction;
      revenueMxn += s.revenueMxn * fraction;
      costMxn += s.costMxn * fraction;
    }

    const driven = loadedKm + emptyKm;
    series.push({
      hour,
      atMs,
      loadedKm,
      emptyKm,
      emptyKmPct: driven > 0 ? (emptyKm / driven) * 100 : 0,
      revenueMxn,
      costMxn,
      netMxn: revenueMxn - costMxn,
    });
  }
  return series;
}

export interface WeekComparison {
  baseline: SimulationResult;
  recommended: SimulationResult;
  delta: {
    /** Percentage points of empty km removed (positive = better). */
    emptyKmPctPoints: number;
    /** Extra net MXN for the fleet over the period. */
    netMxn: number;
  };
}

/** Run both policies over the same fleet and market. */
export function compareWeek(
  fleet: readonly FleetTruck[],
  loads: readonly Load[],
  options: SimulationOptions,
): WeekComparison {
  const baseline = simulateWeek(fleet, loads, "empty_return", options);
  const recommended = simulateWeek(fleet, loads, "recommended", options);
  return {
    baseline,
    recommended,
    delta: {
      emptyKmPctPoints: baseline.totals.emptyKmPct - recommended.totals.emptyKmPct,
      netMxn: recommended.totals.netMxn - baseline.totals.netMxn,
    },
  };
}
