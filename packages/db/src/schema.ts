import { UNIT_TYPES } from "@retorno/engine";
import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { EVENT_ACTIONS, EVENT_SOURCES, TRUCK_STATUSES } from "./types";

export const unitTypeEnum = pgEnum("unit_type", UNIT_TYPES);
export const truckStatusEnum = pgEnum("truck_status", TRUCK_STATUSES);
export const eventActionEnum = pgEnum("event_action", EVENT_ACTIONS);

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

export const cities = pgTable("cities", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  state: text("state").notNull(),
  country: text("country", { enum: ["MX", "US"] }).notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  freightWeight: integer("freight_weight").notNull(),
});

export const loads = pgTable(
  "loads",
  {
    id: text("id").primaryKey(),
    originCityId: text("origin_city_id")
      .notNull()
      .references(() => cities.id),
    destinationCityId: text("destination_city_id")
      .notNull()
      .references(() => cities.id),
    unitType: unitTypeEnum("unit_type").notNull(),
    /** Stored relative to the seed reference date; shifted to "today" on read. */
    pickupStart: timestamptz("pickup_start").notNull(),
    pickupEnd: timestamptz("pickup_end").notNull(),
    weightKg: integer("weight_kg").notNull(),
    rateMxn: integer("rate_mxn").notNull(),
    shipper: text("shipper").notNull(),
    commodity: text("commodity").notNull(),
  },
  (table) => [index("loads_unit_window_idx").on(table.unitType, table.pickupEnd)],
);

export const trucks = pgTable("trucks", {
  id: text("id").primaryKey(),
  driverName: text("driver_name").notNull(),
  plate: text("plate").notNull(),
  unitType: unitTypeEnum("unit_type").notNull(),
  baseCityId: text("base_city_id")
    .notNull()
    .references(() => cities.id),
  currentCityId: text("current_city_id")
    .notNull()
    .references(() => cities.id),
  availableAt: timestamptz("available_at").notNull(),
  status: truckStatusEnum("status").notNull(),
});

export const recommendationEvents = pgTable(
  "recommendation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamptz("created_at")
      .notNull()
      .default(sql`now()`),
    action: eventActionEnum("action").notNull(),
    truckId: text("truck_id"),
    loadIds: text("load_ids").array().notNull(),
    rank: integer("rank").notNull(),
    scorePerHour: doublePrecision("score_per_hour").notNull(),
    gainVsEmptyMxn: doublePrecision("gain_vs_empty_mxn").notNull(),
    features: jsonb("features").$type<Record<string, number>>().notNull(),
    decisionId: uuid("decision_id"),
    policy: text("policy"),
    source: text("source", { enum: EVENT_SOURCES }),
  },
  (table) => [
    index("recommendation_events_created_idx").on(table.createdAt),
    index("recommendation_events_decision_idx").on(table.decisionId),
  ],
);

/** Every trained ranking model, newest last. The active one is the latest with active = true. */
export const modelVersions = pgTable("model_versions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  createdAt: timestamptz("created_at")
    .notNull()
    .default(sql`now()`),
  weights: jsonb("weights").$type<Record<string, number>>().notNull(),
  coefficients: jsonb("coefficients").$type<Record<string, number>>().notNull(),
  metrics: jsonb("metrics").$type<Record<string, unknown>>().notNull(),
  trainedOn: integer("trained_on").notNull(),
  active: boolean("active").notNull().default(true),
});
