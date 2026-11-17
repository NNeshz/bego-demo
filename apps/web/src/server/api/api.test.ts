/**
 * API integration + contract tests. Route handlers are called with real
 * Request objects and every response is parsed with the published schema.
 */
import { createAiService, RateLimiter, type LlmClient } from "@retorno/ai";
import { CITIES, createMemorySource, type DataSource } from "@retorno/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { POST as chainsPOST } from "@/app/api/v1/chains/route";
import { GET as citiesGET } from "@/app/api/v1/cities/route";
import { POST as eventsBatchPOST } from "@/app/api/v1/events/batch/route";
import { GET as eventsGET, POST as eventsPOST } from "@/app/api/v1/events/route";
import { GET as fleetGET } from "@/app/api/v1/fleet/route";
import { GET as healthGET } from "@/app/api/v1/health/route";
import { GET as openapiGET } from "@/app/api/v1/openapi.json/route";
import { POST as parsePOST } from "@/app/api/v1/parse-trip/route";
import { OPTIONS, POST as recommendationsPOST } from "@/app/api/v1/recommendations/route";
import { GET as simulationGET } from "@/app/api/v1/simulation/route";
import { createWeightsProvider } from "@/server/learned-weights";
import { setContextForTests, type ServerContext } from "@/server/context";
import {
  ChainsResponseSchema,
  ErrorSchema,
  EventSchema,
  HealthSchema,
  ParseTripResponseSchema,
  RecommendationsResponseSchema,
  SimulationResponseSchema,
  TruckSchema,
} from "./schemas";

// connection() only works inside a real Next request; it's a no-op here.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

const NOW = new Date("2026-11-16T16:00:00.000Z"); // Monday 10:00 Mexico City
const now = () => NOW;

function makeContext(
  overrides: { llm?: LlmClient; data?: DataSource; clientCapacity?: number } = {},
): ServerContext {
  return {
    data: overrides.data ?? createMemorySource({ now }),
    ai: createAiService({ cities: CITIES, now, ...(overrides.llm ? { llm: overrides.llm } : {}) }),
    cities: CITIES,
    now,
    clientLimiter: new RateLimiter({
      capacity: overrides.clientCapacity ?? 100,
      refillPerMinute: 0,
    }),
    weights: createWeightsProvider({}),
  };
}

beforeEach(() => setContextForTests(makeContext()));

const url = (path: string) => `http://localhost:3100/api/v1${path}`;

function post(
  handler: (r: Request) => Promise<Response>,
  path: string,
  body: unknown,
  ip = "1.1.1.1",
) {
  return handler(
    new Request(url(path), {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const get = (handler: (r: Request) => Promise<Response>, path: string) =>
  handler(new Request(url(path)));

async function expectJson<S extends z.ZodType>(
  response: Response,
  status: number,
  schema: S,
): Promise<z.output<S>> {
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(status);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new Error(
      `Response violates its schema:\n${JSON.stringify(parsed.error.issues, null, 2)}`,
    );
  return parsed.data;
}

const flagshipTruck = {
  unitType: "dry_van_53",
  position: { cityId: "nuevo-laredo" },
  base: { cityId: "queretaro" },
  availableAt: "2026-11-17T10:00:00-06:00",
};

describe("POST /recommendations", () => {
  it("ranks return loads and honors the contract", async () => {
    const body = await expectJson(
      await post(recommendationsPOST, "/recommendations", { truck: flagshipTruck }),
      200,
      RecommendationsResponseSchema,
    );
    expect(body.recommendations).toHaveLength(5);
    const scores = body.recommendations.map((r) => r.scorePerHour);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(body.emptyReturn.km).toBeGreaterThan(800);
    expect(body.assumptions.costs.dieselMxnPerLiter).toBe(26);
    expect(body.recommendations[0]!.explanation).toBeUndefined();
  });

  it("rounds numbers for a clean payload", async () => {
    const body = await (
      await post(recommendationsPOST, "/recommendations", { truck: flagshipTruck })
    ).json();
    const gain: number = body.recommendations[0].gainVsEmptyMxn;
    expect(Math.round(gain * 100)).toBe(gain * 100);
  });

  it("accepts raw GPS coordinates", async () => {
    const body = await expectJson(
      await post(recommendationsPOST, "/recommendations", {
        truck: {
          ...flagshipTruck,
          position: { lat: 27.4779, lng: -99.5496, name: "Patio aduanal" },
        },
      }),
      200,
      RecommendationsResponseSchema,
    );
    expect(body.recommendations.length).toBeGreaterThan(0);
  });

  it("ranks with hand-set weights when no ML service is configured", async () => {
    const body = await expectJson(
      await post(recommendationsPOST, "/recommendations", { truck: flagshipTruck }),
      200,
      RecommendationsResponseSchema,
    );
    expect(body.weightsSource).toEqual({ kind: "default", reason: "not_configured" });
  });

  it("uses learned personal weights for a known trucker", async () => {
    const personal = { home: 2.5, deadheadPenaltyMxnPerKm: 6, waitPenaltyMxnPerHour: 60 };
    const ctx = makeContext();
    ctx.weights = createWeightsProvider({
      baseUrl: "http://ml",
      fetch: (async (url: string) =>
        Response.json(
          String(url).includes("truck_id=sim-casa-1")
            ? { version: 7, scope: "trucker", weights: personal }
            : {
                version: 7,
                scope: "global",
                weights: { home: 1, deadheadPenaltyMxnPerKm: 0, waitPenaltyMxnPerHour: 0 },
              },
        )) as unknown as typeof fetch,
    });
    setContextForTests(ctx);
    const body = await expectJson(
      await post(recommendationsPOST, "/recommendations", {
        truck: { ...flagshipTruck, truckId: "sim-casa-1" },
      }),
      200,
      RecommendationsResponseSchema,
    );
    expect(body.weightsSource).toEqual({ kind: "learned", version: 7, scope: "trucker" });
    expect(body.assumptions.weights).toEqual(personal);
  });

  it("explicit weight overrides win over learned ones", async () => {
    const body = await (
      await post(recommendationsPOST, "/recommendations", {
        truck: flagshipTruck,
        weights: { home: 3 },
      })
    ).json();
    expect(body.weightsSource).toEqual({ kind: "request" });
    expect(body.assumptions.weights.home).toBe(3);
  });

  it("applies cost overrides", async () => {
    const cheap = await (
      await post(recommendationsPOST, "/recommendations", { truck: flagshipTruck, limit: 1 })
    ).json();
    const pricey = await (
      await post(recommendationsPOST, "/recommendations", {
        truck: flagshipTruck,
        limit: 1,
        costs: { dieselMxnPerLiter: 40 },
      })
    ).json();
    expect(pricey.assumptions.costs.dieselMxnPerLiter).toBe(40);
    expect(pricey.recommendations[0].breakdown.netProfitMxn).toBeLessThan(
      cheap.recommendations[0].breakdown.netProfitMxn,
    );
  });

  it("adds explanations on request (template without AI, Claude with AI)", async () => {
    const template = await expectJson(
      await post(recommendationsPOST, "/recommendations", {
        truck: flagshipTruck,
        limit: 2,
        explain: true,
      }),
      200,
      RecommendationsResponseSchema,
    );
    expect(template.recommendations[0]!.explanation).toMatchObject({ source: "template" });
    expect(template.recommendations[0]!.explanation!.text).toMatch(/^Te conviene porque/);

    const llm: LlmClient = {
      generateObject: async () => ({ sentence: "Te conviene porque te regresa a casa." }) as never,
    };
    setContextForTests(makeContext({ llm }));
    const ai = await expectJson(
      await post(recommendationsPOST, "/recommendations", {
        truck: flagshipTruck,
        limit: 1,
        explain: true,
      }),
      200,
      RecommendationsResponseSchema,
    );
    expect(ai.recommendations[0]!.explanation).toEqual({
      text: "Te conviene porque te regresa a casa.",
      source: "ai",
    });
  });

  it("rejects unknown cities with a helpful message", async () => {
    const body = await expectJson(
      await post(recommendationsPOST, "/recommendations", {
        truck: { ...flagshipTruck, position: { cityId: "atlantis" } },
      }),
      400,
      ErrorSchema,
    );
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.message).toContain("atlantis");
    expect(body.error.details).toEqual([
      { path: "truck.position.cityId", message: "Unknown city" },
    ]);
  });

  it("rejects invalid bodies with field-level details", async () => {
    const body = await expectJson(
      await post(recommendationsPOST, "/recommendations", {
        truck: { ...flagshipTruck, unitType: "bus" },
        limit: 99,
      }),
      400,
      ErrorSchema,
    );
    const paths = body.error.details!.map((d) => d.path);
    expect(paths).toContain("truck.unitType");
    expect(paths).toContain("limit");
  });

  it("rejects malformed JSON", async () => {
    const body = await expectJson(
      await post(recommendationsPOST, "/recommendations", "{nope"),
      400,
      ErrorSchema,
    );
    expect(body.error.code).toBe("invalid_json");
  });

  it("rejects oversized payloads", async () => {
    const body = await expectJson(
      await post(recommendationsPOST, "/recommendations", {
        truck: flagshipTruck,
        junk: "x".repeat(70_000),
      }),
      413,
      ErrorSchema,
    );
    expect(body.error.code).toBe("payload_too_large");
  });

  it("hides internal errors behind a generic 500", async () => {
    const broken = createMemorySource({ now });
    broken.listLoads = () => Promise.reject(new Error("secret connection string leaked"));
    setContextForTests(makeContext({ data: broken }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await post(recommendationsPOST, "/recommendations", { truck: flagshipTruck });
    const body = await expectJson(response, 500, ErrorSchema);
    expect(body.error.code).toBe("internal_error");
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});

describe("POST /chains", () => {
  it("plans 2-load chains", async () => {
    const body = await expectJson(
      await post(chainsPOST, "/chains", { truck: flagshipTruck, limit: 3 }),
      200,
      ChainsResponseSchema,
    );
    expect(body.chains.length).toBeGreaterThan(0);
    for (const chain of body.chains) expect(chain.legs[0].load.id).not.toBe(chain.legs[1].load.id);
  });
});

describe("POST /parse-trip", () => {
  it("parses the flagship sentence", async () => {
    const body = await expectJson(
      await post(parsePOST, "/parse-trip", {
        text: "Descargo en Laredo mañana a las 10, traigo caja seca de 53, mi base es Querétaro",
      }),
      200,
      ParseTripResponseSchema,
    );
    expect(body.intent).toEqual({
      unloadCityId: "nuevo-laredo",
      unloadAt: "2026-11-17T16:00:00.000Z",
      unitType: "dry_van_53",
      baseCityId: "queretaro",
    });
    expect(body.nextQuestion).toBeNull();
  });

  it("supports follow-up answers", async () => {
    const body = await expectJson(
      await post(parsePOST, "/parse-trip", {
        text: "Querétaro",
        previous: {
          unloadCityId: "nuevo-laredo",
          unitType: "dry_van_53",
          unloadAt: "2026-11-17T16:00:00.000Z",
        },
        expecting: "baseCityId",
      }),
      200,
      ParseTripResponseSchema,
    );
    expect(body.intent.baseCityId).toBe("queretaro");
    expect(body.missing).toEqual([]);
  });

  it("rate-limits each client separately", async () => {
    setContextForTests(makeContext({ clientCapacity: 2 }));
    const send = (ip: string) =>
      post(parsePOST, "/parse-trip", { text: "descargo en Saltillo" }, ip);
    expect((await send("9.9.9.9")).status).toBe(200);
    expect((await send("9.9.9.9")).status).toBe(200);
    const limited = await send("9.9.9.9");
    await expectJson(limited, 429, ErrorSchema);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect((await send("8.8.8.8")).status).toBe(200);
  });

  it("rejects empty text", async () => {
    await expectJson(await post(parsePOST, "/parse-trip", { text: "   " }), 400, ErrorSchema);
  });
});

describe("/events", () => {
  it("records feedback and lists it", async () => {
    const event = {
      action: "accepted",
      truckId: "U-001",
      loadIds: ["CRG-0134"],
      rank: 1,
      scorePerHour: 1081.2,
      gainVsEmptyMxn: 26_750,
      features: { deadheadKm: 0 },
    };
    const created = await expectJson(await post(eventsPOST, "/events", event), 201, EventSchema);
    expect(created).toMatchObject(event);

    const list = await (await get(eventsGET, "/events?limit=5")).json();
    expect(list.events[0].id).toBe(created.id);
  });

  it("stores a whole decision in one batch", async () => {
    const decisionId = crypto.randomUUID();
    const events = [1, 2, 3].map((rank) => ({
      action: "shown",
      loadIds: [`CRG-000${rank}`],
      rank,
      scorePerHour: 900,
      gainVsEmptyMxn: 10_000,
      features: { net_per_hour: 400 },
      decisionId,
      policy: "engine",
      source: "app",
    }));
    const response = await post(eventsBatchPOST, "/events/batch", { events });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.events).toHaveLength(3);
    for (const event of body.events) EventSchema.parse(event);
    expect(body.events[2]).toMatchObject({ rank: 3, decisionId, source: "app" });
  });

  it("rejects malformed decision ids and empty batches", async () => {
    const bad = {
      action: "shown",
      loadIds: ["CRG-0001"],
      rank: 1,
      scorePerHour: 1,
      gainVsEmptyMxn: 1,
      decisionId: "nope",
    };
    await expectJson(await post(eventsPOST, "/events", bad), 400, ErrorSchema);
    await expectJson(
      await post(eventsBatchPOST, "/events/batch", { events: [] }),
      400,
      ErrorSchema,
    );
  });

  it("validates feedback", async () => {
    await expectJson(
      await post(eventsPOST, "/events", { action: "liked", loadIds: [] }),
      400,
      ErrorSchema,
    );
  });
});

describe("catalog endpoints", () => {
  it("GET /cities", async () => {
    const body = await (await get(citiesGET, "/cities")).json();
    expect(body.cities).toHaveLength(20);
    expect(body.cities[0]).not.toHaveProperty("freightWeight");
  });

  it("GET /fleet", async () => {
    const body = await (await get(fleetGET, "/fleet")).json();
    expect(body.trucks).toHaveLength(25);
    for (const truck of body.trucks) TruckSchema.parse(truck);
  });

  it("GET /simulation compares both policies", async () => {
    const body = await expectJson(
      await get(simulationGET, "/simulation?days=3"),
      200,
      SimulationResponseSchema,
    );
    expect(body.recommended.totals.emptyKmPct).toBeLessThan(body.baseline.totals.emptyKmPct);
    expect(body.disclaimer).toMatch(/synthetic/i);
  });

  it("GET /simulation validates the query", async () => {
    await expectJson(await get(simulationGET, "/simulation?days=30"), 400, ErrorSchema);
  });

  it("GET /health", async () => {
    const body = await expectJson(await get(healthGET, "/health"), 200, HealthSchema);
    expect(body).toMatchObject({ dataSource: "memory", aiEnabled: false });
  });
});

describe("CORS (the widget runs on other origins)", () => {
  it("answers preflight requests", async () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("adds CORS headers to success and error responses", async () => {
    const ok = await post(recommendationsPOST, "/recommendations", { truck: flagshipTruck });
    const bad = await post(recommendationsPOST, "/recommendations", "{nope");
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("GET /openapi.json", () => {
  it("documents every endpoint with reusable schemas", async () => {
    const doc = await (await get(openapiGET, "/openapi.json")).json();
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths).sort()).toEqual(
      [
        "/chains",
        "/cities",
        "/events",
        "/events/batch",
        "/fleet",
        "/health",
        "/parse-trip",
        "/recommendations",
        "/simulation",
      ].sort(),
    );
    for (const id of ["Recommendation", "TruckInput", "Location", "Error", "Chain"]) {
      expect(doc.components.schemas).toHaveProperty(id);
    }
    expect(doc.paths["/simulation"].get.parameters[0]).toMatchObject({ name: "days", in: "query" });
  });
});
