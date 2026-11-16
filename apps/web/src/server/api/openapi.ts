import { createDocument, type ZodOpenApiOperationObject } from "zod-openapi";
import {
  ChainsRequestSchema,
  ChainsResponseSchema,
  CitySchema,
  ErrorSchema,
  EventRequestSchema,
  EventSchema,
  HealthSchema,
  ParseTripRequestSchema,
  ParseTripResponseSchema,
  RecommendationsRequestSchema,
  RecommendationsResponseSchema,
  SimulationQuerySchema,
  SimulationResponseSchema,
  TruckSchema,
} from "./schemas";
import { z } from "zod";

export const API_VERSION = "1.0.0";

const jsonContent = (schema: z.ZodType) => ({ "application/json": { schema } });

const errors = {
  "400": { description: "Invalid request", content: jsonContent(ErrorSchema) },
  "429": { description: "Rate limited", content: jsonContent(ErrorSchema) },
  "500": { description: "Server error", content: jsonContent(ErrorSchema) },
};

function post(
  summary: string,
  description: string,
  request: z.ZodType,
  response: z.ZodType,
  status = "200",
): ZodOpenApiOperationObject {
  return {
    summary,
    description,
    requestBody: { required: true, content: jsonContent(request) },
    responses: { [status]: { description: "OK", content: jsonContent(response) }, ...errors },
  };
}

function get(summary: string, description: string, response: z.ZodType): ZodOpenApiOperationObject {
  return {
    summary,
    description,
    responses: {
      "200": { description: "OK", content: jsonContent(response) },
      "500": errors["500"],
    },
  };
}

export function buildOpenApiDocument() {
  return createDocument({
    openapi: "3.1.0",
    info: {
      title: "Retorno API",
      version: API_VERSION,
      description: [
        "Return-load recommendations for owner-operator truckers: given where a truck unloads,",
        "what it pulls and where its base is, rank the loads that beat driving home empty.",
        "",
        "**Unofficial concept by Neftalí Hernández. Not affiliated with BeGo.** All data is synthetic;",
        "cost defaults (diesel, tolls, fuel efficiency) are configurable assumptions, not market data.",
        "",
        "Money is always computed by deterministic code. The AI only parses free text and writes explanations.",
      ].join("\n"),
    },
    servers: [{ url: "/api/v1" }],
    tags: [
      { name: "Recommendations", description: "The engine." },
      { name: "Trip parsing", description: "Free text → structured trip." },
      { name: "Feedback", description: "Signals for the future ranking model." },
      { name: "Catalog", description: "Reference data, fleet and simulation." },
    ],
    paths: {
      "/recommendations": {
        post: {
          ...post(
            "Rank return loads",
            "Top loads for a truck that just unloaded, compared with driving home empty. Set `explain: true` for a one-sentence explanation per load.",
            RecommendationsRequestSchema,
            RecommendationsResponseSchema,
          ),
          tags: ["Recommendations"],
        },
      },
      "/chains": {
        post: {
          ...post(
            "Plan 2-load chains",
            "Best pairs of consecutive loads (bounded beam search, at most beamWidth² combinations).",
            ChainsRequestSchema,
            ChainsResponseSchema,
          ),
          tags: ["Recommendations"],
        },
      },
      "/parse-trip": {
        post: {
          ...post(
            "Parse a trucker's message",
            "Turns free text (or dictated voice) into a structured trip. Returns missing fields and the next question to ask. Falls back to a rule-based parser if the AI is unavailable.",
            ParseTripRequestSchema,
            ParseTripResponseSchema,
          ),
          tags: ["Trip parsing"],
        },
      },
      "/events": {
        post: {
          ...post(
            "Record feedback",
            "Log that a recommendation was shown, accepted or rejected.",
            EventRequestSchema,
            EventSchema,
            "201",
          ),
          tags: ["Feedback"],
        },
        get: {
          ...get(
            "List recent feedback",
            "Newest first.",
            z.object({ events: z.array(EventSchema) }),
          ),
          tags: ["Feedback"],
        },
      },
      "/cities": {
        get: {
          ...get(
            "List cities",
            "Valid `cityId` values.",
            z.object({ cities: z.array(CitySchema) }),
          ),
          tags: ["Catalog"],
        },
      },
      "/fleet": {
        get: {
          ...get(
            "List the demo fleet",
            "Synthetic trucks for the dispatcher view.",
            z.object({ trucks: z.array(TruckSchema), generatedAt: z.string() }),
          ),
          tags: ["Catalog"],
        },
      },
      "/simulation": {
        get: {
          ...get(
            "Simulate a week",
            "Runs the fleet through the market twice (today's behavior vs. following recommendations).",
            SimulationResponseSchema,
          ),
          requestParams: { query: SimulationQuerySchema },
          tags: ["Catalog"],
        },
      },
      "/health": {
        get: {
          ...get("Health check", "Data source and AI status.", HealthSchema),
          tags: ["Catalog"],
        },
      },
    },
  });
}
