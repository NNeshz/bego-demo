/**
 * Public API contract (v1). These Zod schemas validate requests, document
 * responses, and generate the OpenAPI spec. Contract tests parse real
 * responses with them, so docs and behavior can't drift apart.
 */
import { TRIP_FIELDS } from "@retorno/ai";
import { EVENT_ACTIONS, EVENT_SOURCES, TRUCK_STATUSES } from "@retorno/db";
import { UNIT_TYPES } from "@retorno/engine";
import { z } from "zod";
import "zod-openapi";

// ---------------------------------------------------------------- shared

export const UnitTypeSchema = z.enum(UNIT_TYPES).meta({
  id: "UnitType",
  description:
    "dry_van_53 = caja seca 53', reefer_53 = caja refrigerada 53', flatbed_48 = plataforma 48', full_double = full (doble remolque), torton = torton.",
});

const IsoDateTime = z.iso.datetime({ offset: true }).meta({ example: "2026-11-17T10:00:00-06:00" });

export const PlaceSchema = z
  .object({
    cityId: z.string().meta({ description: "City id, or `geo:lat,lng` for raw coordinates." }),
    name: z.string(),
    lat: z.number(),
    lng: z.number(),
  })
  .meta({ id: "Place" });

export const LocationSchema = z
  .union([
    z.object({ cityId: z.string().min(1).meta({ example: "nuevo-laredo" }) }).strict(),
    z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        name: z.string().max(80).optional(),
      })
      .strict(),
  ])
  .meta({
    id: "Location",
    description: "A known city id (see GET /cities) or raw GPS coordinates.",
  });

export const TruckInputSchema = z
  .object({
    unitType: UnitTypeSchema,
    position: LocationSchema.meta({ description: "Where the truck unloads / becomes available." }),
    base: LocationSchema.meta({ description: "Where the trucker wants to end up." }),
    availableAt: IsoDateTime.optional().meta({
      description: "When the truck is free at `position`. Defaults to now.",
    }),
    truckId: z.string().max(64).optional().meta({
      description:
        "Who is asking. Enables personalized ranking weights learned from this trucker's feedback.",
      example: "sim-casa-1",
    }),
  })
  .meta({ id: "TruckInput" });

export const WeightsSourceSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("learned"),
      version: z.number().int(),
      scope: z.enum(["trucker", "global"]),
    }),
    z.object({
      kind: z.literal("default"),
      reason: z.enum(["not_configured", "unavailable", "no_model"]),
    }),
    z.object({ kind: z.literal("request") }),
  ])
  .meta({
    id: "WeightsSource",
    description:
      "Which ranking weights were used: learned by the ML service (personal or global), hand-set defaults, or overrides from the request.",
  });

export const CostOverridesSchema = z
  .object({
    dieselMxnPerLiter: z.number().positive().max(100),
    kmPerLiterLoaded: z.number().positive().max(10),
    kmPerLiterEmpty: z.number().positive().max(10),
    tollMxnPerKm: z.number().min(0).max(50),
    maintenanceMxnPerKm: z.number().min(0).max(50),
    roadFactor: z.number().min(1).max(2),
    avgSpeedKmh: z.number().min(20).max(110),
    handlingHours: z.number().min(0).max(24),
    maxDeadheadKm: z.number().min(0).max(2_000),
  })
  .partial()
  .strict()
  .meta({
    id: "CostOverrides",
    description: "Override any cost assumption. Omitted fields use defaults.",
  });

export const WeightOverridesSchema = z
  .object({
    home: z.number().min(0).max(5),
    deadheadPenaltyMxnPerKm: z.number().min(0).max(50),
    waitPenaltyMxnPerHour: z.number().min(0).max(2_000),
  })
  .partial()
  .strict()
  .meta({
    id: "WeightOverrides",
    description: "Ranking preferences (what a feedback model would learn).",
  });

export const ExplanationSchema = z
  .object({
    text: z.string().meta({
      example: "Te conviene porque te deja en Querétaro y le ganas $26,750 a regresar vacío.",
    }),
    source: z.enum(["ai", "template"]),
  })
  .meta({ id: "Explanation" });

// ---------------------------------------------------------------- engine outputs

export const LoadSchema = z
  .object({
    id: z.string(),
    origin: PlaceSchema,
    destination: PlaceSchema,
    unitType: UnitTypeSchema,
    pickupStart: z.string(),
    pickupEnd: z.string(),
    weightKg: z.number(),
    rateMxn: z.number(),
    shipper: z.string(),
    commodity: z.string(),
  })
  .meta({ id: "Load" });

export const CostBreakdownSchema = z
  .object({
    rateMxn: z.number(),
    deadheadFuelMxn: z.number(),
    loadedFuelMxn: z.number(),
    tollsMxn: z.number(),
    maintenanceMxn: z.number(),
    netProfitMxn: z.number().meta({ description: "rate − fuel − tolls − maintenance" }),
  })
  .meta({ id: "CostBreakdown" });

export const RecommendationSchema = z
  .object({
    load: LoadSchema,
    deadheadKm: z.number().meta({ description: "Empty km to reach the pickup." }),
    loadedKm: z.number(),
    pickupArrival: z.string(),
    waitHours: z.number(),
    deliveredAt: z.string(),
    totalHours: z.number(),
    breakdown: CostBreakdownSchema,
    returnHomeKm: z.number(),
    returnHomeCostMxn: z.number(),
    kmCloserToBase: z.number(),
    homeBonusMxn: z.number(),
    gainVsEmptyMxn: z
      .number()
      .meta({ description: "Money compared with driving home empty right now." }),
    scorePerHour: z.number(),
    explanation: ExplanationSchema.optional(),
    features: z.record(z.string(), z.number()).optional().meta({
      description:
        "Ranking-model features (per-hour money, home savings, deadhead, wait). Log them with feedback events.",
    }),
  })
  .meta({ id: "Recommendation" });

export const EmptyReturnSchema = z
  .object({ km: z.number(), hours: z.number(), costMxn: z.number() })
  .meta({ id: "EmptyReturn", description: "Baseline: drive straight home empty." });

const AssumptionsSchema = z.object({
  costs: z.record(z.string(), z.number()),
  weights: z.record(z.string(), z.number()),
});

export const RecommendationsRequestSchema = z
  .object({
    truck: TruckInputSchema,
    limit: z.number().int().min(1).max(20).default(5),
    explain: z
      .boolean()
      .default(false)
      .meta({ description: "Add a one-sentence explanation to each result." }),
    costs: CostOverridesSchema.optional(),
    weights: WeightOverridesSchema.optional(),
  })
  .meta({ id: "RecommendationsRequest" });

export const RecommendationsResponseSchema = z
  .object({
    recommendations: z.array(RecommendationSchema),
    emptyReturn: EmptyReturnSchema,
    stats: z.object({
      evaluated: z.number(),
      feasible: z.number(),
      rejected: z.object({
        incompatible_unit: z.number(),
        too_far: z.number(),
        window_missed: z.number(),
        not_worth_it: z.number(),
      }),
    }),
    assumptions: AssumptionsSchema,
    weightsSource: WeightsSourceSchema,
    generatedAt: z.string(),
  })
  .meta({ id: "RecommendationsResponse" });

export const ChainSchema = z
  .object({
    legs: z.tuple([RecommendationSchema, RecommendationSchema]),
    netProfitMxn: z.number(),
    totalHours: z.number(),
    totalEmptyKm: z.number(),
    totalLoadedKm: z.number(),
    returnHomeKm: z.number(),
    returnHomeCostMxn: z.number(),
    homeBonusMxn: z.number(),
    gainVsEmptyMxn: z.number(),
    scorePerHour: z.number(),
    explanation: ExplanationSchema.optional(),
  })
  .meta({ id: "Chain" });

export const ChainsRequestSchema = RecommendationsRequestSchema.extend({
  beamWidth: z.number().int().min(1).max(30).default(20).meta({
    description: "Candidates kept per leg (search is bounded to beamWidth² combinations).",
  }),
}).meta({ id: "ChainsRequest" });

export const ChainsResponseSchema = z
  .object({
    chains: z.array(ChainSchema),
    emptyReturn: EmptyReturnSchema,
    assumptions: AssumptionsSchema,
    weightsSource: WeightsSourceSchema,
    generatedAt: z.string(),
  })
  .meta({ id: "ChainsResponse" });

// ---------------------------------------------------------------- parse trip

const TripIntentSchema = z
  .object({
    unloadCityId: z.string().nullable(),
    unloadAt: z.string().nullable(),
    unitType: UnitTypeSchema.nullable(),
    baseCityId: z.string().nullable(),
  })
  .meta({ id: "TripIntent" });

export const ParseTripRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(1_000).meta({
      example: "Descargo en Laredo mañana a las 10, traigo caja seca de 53, mi base es Querétaro",
    }),
    previous: TripIntentSchema.partial()
      .optional()
      .meta({ description: "Answers gathered so far." }),
    expecting: z
      .enum(TRIP_FIELDS)
      .optional()
      .meta({ description: "The field the UI just asked about." }),
  })
  .meta({ id: "ParseTripRequest" });

export const ParseTripResponseSchema = z
  .object({
    intent: TripIntentSchema,
    missing: z.array(z.enum(TRIP_FIELDS)),
    nextQuestion: z.string().nullable(),
    source: z.enum(["ai", "rules", "ai+rules"]),
    fallbackReason: z.string().optional(),
  })
  .meta({ id: "ParseTripResponse" });

// ---------------------------------------------------------------- events

export const EventRequestSchema = z
  .object({
    action: z.enum(EVENT_ACTIONS),
    truckId: z.string().max(64).optional(),
    loadIds: z.array(z.string().max(64)).min(1).max(2),
    rank: z.number().int().min(1).max(50),
    scorePerHour: z.number(),
    gainVsEmptyMxn: z.number(),
    features: z
      .record(z.string().max(64), z.number())
      .refine((f) => Object.keys(f).length <= 50, "At most 50 features")
      .default({}),
    decisionId: z.uuid().optional().meta({
      description:
        "Groups the options shown together on one screen. Needed to learn from what was NOT chosen.",
    }),
    policy: z
      .string()
      .max(32)
      .optional()
      .meta({ description: "How the list was built, e.g. engine or explore." }),
    source: z.enum(EVENT_SOURCES).optional(),
  })
  .meta({ id: "EventRequest", description: "Feedback signal for the ranking model." });

export const EventBatchRequestSchema = z
  .object({ events: z.array(EventRequestSchema).min(1).max(30) })
  .meta({
    id: "EventBatchRequest",
    description: "Several events stored atomically, e.g. every option shown in a decision.",
  });

export const EventSchema = EventRequestSchema.extend({
  id: z.string(),
  createdAt: z.string(),
}).meta({ id: "Event" });

// ---------------------------------------------------------------- catalog, fleet, simulation

export const CitySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    state: z.string(),
    country: z.enum(["MX", "US"]),
    lat: z.number(),
    lng: z.number(),
  })
  .meta({ id: "City" });

export const TruckSchema = z
  .object({
    id: z.string(),
    driverName: z.string(),
    plate: z.string(),
    unitType: UnitTypeSchema,
    base: PlaceSchema,
    current: PlaceSchema,
    availableAt: z.string(),
    status: z.enum(TRUCK_STATUSES),
  })
  .meta({ id: "Truck" });

const SimTotalsSchema = z.object({
  loadedKm: z.number(),
  emptyKm: z.number(),
  emptyKmPct: z.number(),
  revenueMxn: z.number(),
  costMxn: z.number(),
  netMxn: z.number(),
});

const SimulationRunSchema = z.object({
  policy: z.enum(["empty_return", "recommended"]),
  startMs: z.number(),
  endMs: z.number(),
  segments: z.array(
    z.object({
      truckId: z.string(),
      kind: z.enum(["empty", "loaded", "idle"]),
      from: PlaceSchema,
      to: PlaceSchema,
      startMs: z.number(),
      endMs: z.number(),
      km: z.number(),
      revenueMxn: z.number(),
      costMxn: z.number(),
      loadId: z.string().optional(),
    }),
  ),
  series: z.array(SimTotalsSchema.extend({ hour: z.number(), atMs: z.number() })),
  totals: SimTotalsSchema.extend({ loadsDelivered: z.number() }),
});

export const SimulationQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(7).default(7),
});

export const SimulationResponseSchema = z
  .object({
    baseline: SimulationRunSchema,
    recommended: SimulationRunSchema,
    delta: z.object({ emptyKmPctPoints: z.number(), netMxn: z.number() }),
    disclaimer: z.string(),
  })
  .meta({ id: "SimulationResponse" });

export const HealthSchema = z
  .object({
    status: z.literal("ok"),
    dataSource: z.enum(["memory", "postgres"]),
    aiEnabled: z.boolean(),
    version: z.string(),
  })
  .meta({ id: "Health" });

export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.enum([
        "invalid_json",
        "invalid_request",
        "not_found",
        "payload_too_large",
        "rate_limited",
        "internal_error",
      ]),
      message: z.string(),
      details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    }),
  })
  .meta({ id: "Error" });
