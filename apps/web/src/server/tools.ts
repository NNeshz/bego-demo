/**
 * Agent tools: ONE definition consumed by both the MCP server (/api/mcp) and
 * the in-app agent (/api/agent). Every number comes from the engine; the
 * model only decides which tool to call and how to phrase the answer.
 *
 * Outputs are compact snake_case JSON (fewer tokens, easy for any LLM to read).
 */
import { toMxIso } from "@retorno/ai";
import { CITIES } from "@retorno/db/cities";
import { UNIT_LABELS, UNIT_TYPES } from "@retorno/engine";
import { z } from "zod";
import { emptyCorridors } from "@/lib/sim-playback";
import type { ServerContext } from "./context";
import {
  getChains,
  getLoadDetail,
  getRecommendations,
  runSimulation,
  type TruckInput,
} from "./services";

const cityIds = CITIES.map((c) => c.id) as [string, ...string[]];
const CITY_HELP = CITIES.map((c) => `${c.id}=${c.name}`).join(", ");
const UNIT_HELP = UNIT_TYPES.map((u) => `${u}=${UNIT_LABELS[u]}`).join(", ");

const TripShape = {
  position: z.enum(cityIds).describe("City where the truck unloads / is now (city id)."),
  base: z.enum(cityIds).describe("City the trucker wants to return to (home base, city id)."),
  unit_type: z.enum(UNIT_TYPES).describe(`Truck unit type. ${UNIT_HELP}.`),
  available_at: z.iso
    .datetime({ offset: true })
    .optional()
    .describe(
      "When the truck is free at `position`, ISO-8601 with offset (Mexico City is -06:00). Defaults to now.",
    ),
};

const round = (n: number) => Math.round(n);
const cityName = (id: string) => CITIES.find((c) => c.id === id)?.name ?? id;

function toTruck(input: {
  position: string;
  base: string;
  unit_type: (typeof UNIT_TYPES)[number];
  available_at?: string | undefined;
}): TruckInput {
  return {
    unitType: input.unit_type,
    position: { cityId: input.position },
    base: { cityId: input.base },
    availableAt: input.available_at,
  };
}

export interface AppTool<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  shape: S;
  /** Spanish label shown in the chat while the tool runs. */
  progressLabel: string;
  run(ctx: ServerContext, input: z.infer<z.ZodObject<S>>): Promise<Record<string, unknown>>;
}

const defineTool = <S extends z.ZodRawShape>(tool: AppTool<S>) => tool;

export const findReturnLoads = defineTool({
  name: "find_return_loads",
  title: "Find return loads",
  progressLabel: "Buscando cargas de regreso",
  description:
    "Rank the best return loads for a truck that just unloaded, compared with driving home empty. " +
    `Use city ids: ${CITY_HELP}. ` +
    "Returns money already computed by the engine (MXN): gain_vs_empty_mxn is the headline number.",
  shape: { ...TripShape, limit: z.number().int().min(1).max(10).optional().describe("Default 3.") },
  async run(ctx, input) {
    const result = await getRecommendations(ctx, {
      truck: toTruck(input),
      limit: input.limit ?? 3,
      explain: false,
    });
    return {
      trip: {
        position: input.position,
        base: input.base,
        unit_type: input.unit_type,
        available_at: input.available_at ?? null,
      },
      empty_return: {
        km: round(result.emptyReturn.km),
        hours: round(result.emptyReturn.hours),
        cost_mxn: round(result.emptyReturn.costMxn),
      },
      loads_considered: result.stats.evaluated,
      loads_worth_it: result.stats.feasible,
      recommendations: result.recommendations.map((r, i) => ({
        rank: i + 1,
        load_id: r.load.id,
        route: `${r.load.origin.name} → ${r.load.destination.name}`,
        commodity: r.load.commodity,
        // Local time with offset: models misread UTC "Z" timestamps as local time.
        pickup_at: toMxIso(new Date(r.pickupArrival)),
        rate_mxn: round(r.load.rateMxn),
        net_profit_mxn: round(r.breakdown.netProfitMxn),
        gain_vs_empty_mxn: round(r.gainVsEmptyMxn),
        deadhead_km: round(r.deadheadKm),
        km_closer_to_base: round(r.kmCloserToBase),
        km_from_base_after: round(r.returnHomeKm),
        total_hours: round(r.totalHours),
      })),
    };
  },
});

export const planLoadChain = defineTool({
  name: "plan_load_chain",
  title: "Plan a 2-load chain",
  progressLabel: "Armando cadenas de 2 cargas",
  description:
    "Find the best pairs of consecutive loads (load 1, then load 2 from its destination) that beat driving home empty. " +
    "Use when single loads don't get the trucker close enough to base.",
  shape: { ...TripShape, limit: z.number().int().min(1).max(5).optional().describe("Default 3.") },
  async run(ctx, input) {
    const result = await getChains(ctx, {
      truck: toTruck(input),
      limit: input.limit ?? 3,
      explain: false,
      beamWidth: 20,
    });
    return {
      trip: {
        position: input.position,
        base: input.base,
        unit_type: input.unit_type,
        available_at: input.available_at ?? null,
      },
      empty_return: {
        km: round(result.emptyReturn.km),
        cost_mxn: round(result.emptyReturn.costMxn),
      },
      chains: result.chains.map((c, i) => ({
        rank: i + 1,
        load_ids: c.legs.map((l) => l.load.id),
        legs: c.legs.map((l) => `${l.load.origin.name} → ${l.load.destination.name}`),
        pickups_at: c.legs.map((l) => toMxIso(new Date(l.pickupArrival))),
        net_profit_mxn: round(c.netProfitMxn),
        gain_vs_empty_mxn: round(c.gainVsEmptyMxn),
        total_empty_km: round(c.totalEmptyKm),
        km_from_base_after: round(c.returnHomeKm),
        total_hours: round(c.totalHours),
      })),
    };
  },
});

export const explainRecommendation = defineTool({
  name: "explain_recommendation",
  title: "Explain a recommendation",
  progressLabel: "Explicando por qué conviene",
  description:
    "One-sentence explanation in Mexican trucker Spanish of why a specific load is worth it, grounded in engine numbers. " +
    "Call it with the same trip and a load_id returned by find_return_loads.",
  shape: { ...TripShape, load_id: z.string().max(32).describe("e.g. CRG-0134") },
  async run(ctx, input) {
    const detail = await getLoadDetail(ctx, toTruck(input), input.load_id);
    if (!detail)
      return {
        load_id: input.load_id,
        available: false,
        reason: "Load not found or no longer reachable for this truck.",
      };
    const explanation = await ctx.ai.explain({
      kind: "load",
      recommendation: detail.recommendation,
      baseName: cityName(input.base),
    });
    return {
      load_id: input.load_id,
      available: true,
      explanation: explanation.text,
      explanation_source: explanation.source,
      gain_vs_empty_mxn: round(detail.recommendation.gainVsEmptyMxn),
    };
  },
});

export const getFleetEmptyKm = defineTool({
  name: "get_fleet_empty_km",
  title: "Fleet empty-km report",
  progressLabel: "Simulando la semana de la flota",
  description:
    "Dispatcher view: simulate the demo fleet for N days with today's behavior (local search, drive home empty) vs. following " +
    "recommendations. Returns empty-km %, net profit and the corridors where most empty km happen. Synthetic data.",
  shape: { days: z.number().int().min(1).max(7).optional().describe("Default 7.") },
  async run(ctx, input) {
    const sim = await runSimulation(ctx, input.days ?? 7);
    const totals = (t: typeof sim.baseline.totals) => ({
      empty_km_pct: Math.round(t.emptyKmPct * 10) / 10,
      empty_km: round(t.emptyKm),
      net_mxn: round(t.netMxn),
      loads_delivered: t.loadsDelivered,
    });
    return {
      days: input.days ?? 7,
      trucks: new Set(sim.baseline.segments.map((s) => s.truckId)).size,
      today: totals(sim.baseline.totals),
      with_retorno: totals(sim.recommended.totals),
      extra_net_mxn: round(sim.delta.netMxn),
      empty_km_pct_points_saved: Math.round(sim.delta.emptyKmPctPoints * 10) / 10,
      top_empty_corridors_today: emptyCorridors(sim.baseline.segments)
        .slice(0, 5)
        .map((c) => ({
          corridor: `${c.from.name} ↔ ${c.to.name}`,
          empty_km: round(c.km),
          trips: c.trips,
        })),
      disclaimer: sim.disclaimer,
    };
  },
});

export const TOOLS = [
  findReturnLoads,
  planLoadChain,
  explainRecommendation,
  getFleetEmptyKm,
] as AppTool[];

export function getTool(name: string): AppTool | undefined {
  return TOOLS.find((tool) => tool.name === name);
}

/** Validate untrusted input (from an LLM or an MCP client) and run the tool. */
export async function runTool(ctx: ServerContext, name: string, rawInput: unknown) {
  const tool = getTool(name);
  if (!tool) throw new ToolInputError(`Unknown tool: ${name}`);
  const parsed = z.object(tool.shape).safeParse(rawInput ?? {});
  if (!parsed.success) {
    throw new ToolInputError(
      parsed.error.issues.map((i) => `${i.path.join(".") || "(input)"}: ${i.message}`).join("; "),
    );
  }
  return tool.run(ctx, parsed.data);
}

export class ToolInputError extends Error {
  override name = "ToolInputError";
}
