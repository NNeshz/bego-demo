import { neon } from "@neondatabase/serverless";
import type { Load } from "@retorno/engine";
import { desc } from "drizzle-orm";
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
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
import type { City, NewRecommendationEvent, RecommendationEvent, Truck } from "./types";

/** Driver-agnostic Drizzle database: the query API is identical for both drivers. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  /**
   * - `neon-http`: Neon over HTTP. Stateless, ideal for serverless (Vercel). No interactive transactions.
   * - `node-postgres`: regular TCP connection pool. Used for local Docker Postgres.
   */
  driver: "neon-http" | "node-postgres";
  close(): Promise<void>;
}

export function isNeonUrl(databaseUrl: string): boolean {
  return new URL(databaseUrl).hostname.endsWith(".neon.tech");
}

export function createDb(databaseUrl: string): DbHandle {
  if (isNeonUrl(databaseUrl)) {
    return {
      db: drizzleNeonHttp({ client: neon(databaseUrl), schema }),
      driver: "neon-http",
      close: async () => {},
    };
  }
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  return {
    db: drizzleNodePg({ client: pool, schema }),
    driver: "node-postgres",
    close: () => pool.end(),
  };
}

/** Postgres returns "2026-01-05 12:00:00+00"; normalize to ISO-8601. */
const iso = (value: string) => new Date(value).toISOString();

export type PostgresSource = DataSource & {
  driver: DbHandle["driver"];
  /** Release the connection pool (scripts and tests). */
  close(): Promise<void>;
};

export function createPostgresSource(
  databaseUrl: string,
  options: SourceOptions = {},
): PostgresSource {
  const { db, driver, close } = createDb(databaseUrl);
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

  const recordEvents = async (events: NewRecommendationEvent[]) => {
    if (events.length === 0) return [];
    // One multi-row INSERT: all options of a decision are stored, or none.
    const rows = await db
      .insert(schema.recommendationEvents)
      .values(
        events.map((event) => ({
          ...event,
          truckId: event.truckId ?? null,
          decisionId: event.decisionId ?? null,
          policy: event.policy ?? null,
          source: event.source ?? null,
        })),
      )
      .returning();
    if (rows.length !== events.length) throw new Error("Insert returned fewer rows than expected");
    return rows.map(toEvent);
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

    recordEvent: async (event) => (await recordEvents([event]))[0]!,
    recordEvents,

    listEvents: async (limit = 100) => {
      const rows = await db
        .select()
        .from(schema.recommendationEvents)
        .orderBy(desc(schema.recommendationEvents.createdAt))
        .limit(limit);
      return rows.map(toEvent);
    },

    marketStart: () => marketStartIso(now()),
    driver,
    close,
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
    decisionId: row.decisionId ?? undefined,
    policy: row.policy ?? undefined,
    source: row.source ?? undefined,
  };
}
