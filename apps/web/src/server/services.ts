/**
 * Application services: the single implementation behind the REST API, the UI
 * and (Phase 7) the MCP server. Inputs are already validated by the callers.
 */
import type { ParseTripContext } from "@retorno/ai";
import { getCity, type NewRecommendationEvent } from "@retorno/db";
import {
  compareWeek,
  emptyReturnFrom,
  evaluateChain,
  evaluateLoad,
  planChains,
  recommend,
  resolveOptions,
  type CostConfig,
  type Place,
  type ScoreWeights,
  type TruckState,
  type UnitType,
} from "@retorno/engine";
import { ApiError } from "./api/http";
import type { ServerContext } from "./context";

export type LocationInput =
  { cityId: string } | { lat: number; lng: number; name?: string | undefined };

export interface TruckInput {
  unitType: UnitType;
  position: LocationInput;
  base: LocationInput;
  availableAt?: string | undefined;
}

interface EngineInput {
  truck: TruckInput;
  limit: number;
  explain: boolean;
  costs?: Partial<CostConfig> | undefined;
  weights?: Partial<ScoreWeights> | undefined;
}

export function resolveLocation(location: LocationInput, field: string): Place {
  if ("cityId" in location) {
    try {
      const city = getCity(location.cityId);
      return { cityId: city.id, name: city.name, lat: city.lat, lng: city.lng };
    } catch {
      throw new ApiError(
        400,
        "invalid_request",
        `Unknown cityId "${location.cityId}". See GET /api/v1/cities.`,
        [{ path: `${field}.cityId`, message: "Unknown city" }],
      );
    }
  }
  return {
    cityId: `geo:${location.lat.toFixed(4)},${location.lng.toFixed(4)}`,
    name: location.name ?? "Ubicación",
    lat: location.lat,
    lng: location.lng,
  };
}

export function toTruckState(input: TruckInput, now: Date): TruckState {
  return {
    unitType: input.unitType,
    position: resolveLocation(input.position, "truck.position"),
    base: resolveLocation(input.base, "truck.base"),
    availableAt: input.availableAt ? new Date(input.availableAt).toISOString() : now.toISOString(),
  };
}

/** Round floats for a clean API payload: 5 decimals for coordinates, 2 for everything else. */
export function roundDeep<T>(value: T, key = ""): T {
  if (typeof value === "number") {
    const digits = key === "lat" || key === "lng" ? 5 : 2;
    return (Math.round(value * 10 ** digits) / 10 ** digits) as T;
  }
  if (Array.isArray(value)) return value.map((item) => roundDeep(item, key)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, roundDeep(v, k)])) as T;
  }
  return value;
}

function assumptions(input: EngineInput) {
  const resolved = resolveOptions({ costs: input.costs, weights: input.weights });
  return { costs: { ...resolved.costs }, weights: { ...resolved.weights } };
}

export async function getRecommendations(ctx: ServerContext, input: EngineInput) {
  const truck = toTruckState(input.truck, ctx.now());
  const loads = await ctx.data.listLoads();
  const result = recommend(truck, loads, {
    limit: input.limit,
    ...(input.costs ? { costs: input.costs } : {}),
    ...(input.weights ? { weights: input.weights } : {}),
  });

  const recommendations = input.explain
    ? await Promise.all(
        result.recommendations.map(async (recommendation) => {
          const { text, source } = await ctx.ai.explain({
            kind: "load",
            recommendation,
            baseName: truck.base.name,
          });
          return { ...recommendation, explanation: { text, source } };
        }),
      )
    : result.recommendations;

  return roundDeep({
    ...result,
    recommendations,
    assumptions: assumptions(input),
    generatedAt: ctx.now().toISOString(),
  });
}

export async function getChains(ctx: ServerContext, input: EngineInput & { beamWidth: number }) {
  const truck = toTruckState(input.truck, ctx.now());
  const loads = await ctx.data.listLoads();
  const options = {
    ...(input.costs ? { costs: input.costs } : {}),
    ...(input.weights ? { weights: input.weights } : {}),
  };
  const chains = planChains(truck, loads, {
    ...options,
    limit: input.limit,
    beamWidth: input.beamWidth,
  });
  const { emptyReturn } = recommend(truck, [], options);

  const withExplanations = input.explain
    ? await Promise.all(
        chains.map(async (chain) => {
          const { text, source } = await ctx.ai.explain({
            kind: "chain",
            chain,
            baseName: truck.base.name,
          });
          return { ...chain, explanation: { text, source } };
        }),
      )
    : chains;

  return roundDeep({
    chains: withExplanations,
    emptyReturn,
    assumptions: assumptions(input),
    generatedAt: ctx.now().toISOString(),
  });
}

/** One load evaluated for a truck, for the detail screen. Null if the load is gone or no longer feasible. */
export async function getLoadDetail(ctx: ServerContext, truckInput: TruckInput, loadId: string) {
  const truck = toTruckState(truckInput, ctx.now());
  const loads = await ctx.data.listLoads();
  const load = loads.find((l) => l.id === loadId);
  if (!load) return null;
  const options = resolveOptions();
  const evaluation = evaluateLoad(truck, load, options);
  if (!evaluation.ok) return null;
  return {
    truck,
    recommendation: evaluation.recommendation,
    emptyReturn: emptyReturnFrom(truck.position, truck.base, options.costs),
  };
}

export async function getChainDetail(
  ctx: ServerContext,
  truckInput: TruckInput,
  firstId: string,
  secondId: string,
) {
  const truck = toTruckState(truckInput, ctx.now());
  const loads = await ctx.data.listLoads();
  const first = loads.find((l) => l.id === firstId);
  const second = loads.find((l) => l.id === secondId);
  if (!first || !second) return null;
  const chain = evaluateChain(truck, first, second);
  if (!chain) return null;
  return {
    truck,
    chain,
    emptyReturn: emptyReturnFrom(truck.position, truck.base, resolveOptions().costs),
  };
}

export async function parseTrip(ctx: ServerContext, text: string, context: ParseTripContext) {
  return ctx.ai.parseTrip(text, context);
}

export async function recordEvent(ctx: ServerContext, event: NewRecommendationEvent) {
  return ctx.data.recordEvent(event);
}

export async function listEvents(ctx: ServerContext, limit: number) {
  return ctx.data.listEvents(limit);
}

export async function listCities(ctx: ServerContext) {
  return ctx.cities.map(({ id, name, state, country, lat, lng }) => ({
    id,
    name,
    state,
    country,
    lat,
    lng,
  }));
}

export async function getFleet(ctx: ServerContext) {
  return { trucks: await ctx.data.listTrucks(), generatedAt: ctx.now().toISOString() };
}

export async function runSimulation(ctx: ServerContext, days: number) {
  const [loads, trucks] = await Promise.all([ctx.data.listLoads(), ctx.data.listTrucks()]);
  const fleet = trucks.map(({ id, unitType, base }) => ({ id, unitType, base }));
  const comparison = compareWeek(fleet, loads, { start: ctx.data.marketStart(), days });
  return roundDeep({
    ...comparison,
    disclaimer:
      "Synthetic simulation on generated data. It illustrates the method, not real market results.",
  });
}
