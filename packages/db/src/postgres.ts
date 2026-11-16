import { neon } from "@neondatabase/serverless";
import type { Load } from "@retorno/engine";
import { desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { toPlace } from "./cities";
import * as schema from "./schema";
import {
  rebaseLoad,
  rebaseTruck,
  marketStartIso,
  type DataSource,
  type SourceOptions,
} from "./source";
import { seedShiftMs } from "./time";
import type { City, RecommendationEvent, Truck } from "./types";

export function createDb(databaseUrl: string) {
  return drizzle({ client: neon(databaseUrl), schema });
}
export type Db = ReturnType<typeof createDb>;

/** Postgres returns "2026-01-05 12:00:00+00"; normalize to ISO-8601. */
const iso = (value: string) => new Date(value).toISOString();

export function createPostgresSource(databaseUrl: string, options: SourceOptions = {}): DataSource {
  const db = createDb(databaseUrl);
  const now = options.now ?? (() => new Date());

  // Cities are static reference data: load once per instance.
  let citiesPromise: Promise<Map<string, City>> | undefined;
  const cityMap = () => {
    citiesPromise ??= db
      .select()
      .from(schema.cities)
      .then((rows) => new Map(rows.map((row) => [row.id, row as City])))
      .catch((error: unknown) => {
        citiesPromise = undefined; // don't cache failures
        throw error;
      });
    return citiesPromise;
  };
  const place = (cities: Map<string, City>, id: string) => {
    const city = cities.get(id);
    if (!city) throw new Error(`Unknown city in database: ${id}`);
    return toPlace(city);
  };

  return {
    kind: "postgres",

    listCities: async () => [...(await cityMap()).values()],

    listLoads: async () => {
      const [cities, rows] = await Promise.all([cityMap(), db.select().from(schema.loads)]);
      const shift = seedShiftMs(now());
      return rows.map((row): Load =>
        rebaseLoad(
          {
            id: row.id,
            origin: place(cities, row.originCityId),
            destination: place(cities, row.destinationCityId),
            unitType: row.unitType,
            pickupStart: iso(row.pickupStart),
            pickupEnd: iso(row.pickupEnd),
            weightKg: row.weightKg,
            rateMxn: row.rateMxn,
            shipper: row.shipper,
            commodity: row.commodity,
          },
          shift,
        ),
      );
    },

    listTrucks: async () => {
      const [cities, rows] = await Promise.all([cityMap(), db.select().from(schema.trucks)]);
      const shift = seedShiftMs(now());
      return rows.map((row): Truck =>
        rebaseTruck(
          {
            id: row.id,
            driverName: row.driverName,
            plate: row.plate,
            unitType: row.unitType,
            base: place(cities, row.baseCityId),
            current: place(cities, row.currentCityId),
            availableAt: iso(row.availableAt),
            status: row.status,
          },
          shift,
        ),
      );
    },

    recordEvent: async (event) => {
      const [row] = await db
        .insert(schema.recommendationEvents)
        .values({ ...event, truckId: event.truckId ?? null })
        .returning();
      if (!row) throw new Error("Insert returned no row");
      return toEvent(row);
    },

    listEvents: async (limit = 100) => {
      const rows = await db
        .select()
        .from(schema.recommendationEvents)
        .orderBy(desc(schema.recommendationEvents.createdAt))
        .limit(limit);
      return rows.map(toEvent);
    },

    marketStart: () => marketStartIso(now()),
  };
}

function toEvent(row: typeof schema.recommendationEvents.$inferSelect): RecommendationEvent {
  return {
    id: row.id,
    createdAt: iso(row.createdAt),
    action: row.action,
    truckId: row.truckId ?? undefined,
    loadIds: row.loadIds,
    rank: row.rank,
    scorePerHour: row.scorePerHour,
    gainVsEmptyMxn: row.gainVsEmptyMxn,
    features: row.features,
  };
}
