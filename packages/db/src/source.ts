import type { Load } from "@retorno/engine";
import { generateSeed, type SeedData } from "./seed";
import { SEED_REFERENCE_MS, seedShiftMs, shiftIso } from "./time";
import type { City, NewRecommendationEvent, RecommendationEvent, Truck } from "./types";

/**
 * Everything the app needs from storage. Two implementations:
 * an in-memory one (deterministic seed, zero setup) and a Postgres one.
 * All timestamps returned are already shifted to "today".
 */
export interface DataSource {
  readonly kind: "memory" | "postgres";
  listCities(): Promise<City[]>;
  listLoads(): Promise<Load[]>;
  listTrucks(): Promise<Truck[]>;
  recordEvent(event: NewRecommendationEvent): Promise<RecommendationEvent>;
  listEvents(limit?: number): Promise<RecommendationEvent[]>;
  /** Start of the market window (today 00:00 Mexico City), ISO-8601. Used by the simulator. */
  marketStart(): string;
}

export interface SourceOptions {
  /** Injectable clock for tests. */
  now?: () => Date;
}

export function rebaseLoad(load: Load, shiftMs: number): Load {
  return {
    ...load,
    pickupStart: shiftIso(load.pickupStart, shiftMs),
    pickupEnd: shiftIso(load.pickupEnd, shiftMs),
  };
}

export function rebaseTruck(truck: Truck, shiftMs: number): Truck {
  return { ...truck, availableAt: shiftIso(truck.availableAt, shiftMs) };
}

export function marketStartIso(now: Date): string {
  return new Date(SEED_REFERENCE_MS + seedShiftMs(now)).toISOString();
}

let cachedSeed: SeedData | undefined;
function defaultSeed(): SeedData {
  cachedSeed ??= generateSeed();
  return cachedSeed;
}

export function createMemorySource(options: SourceOptions & { seed?: SeedData } = {}): DataSource {
  const now = options.now ?? (() => new Date());
  const seed = options.seed ?? defaultSeed();
  const events: RecommendationEvent[] = [];

  return {
    kind: "memory",
    listCities: async () => seed.cities,
    listLoads: async () => {
      const shift = seedShiftMs(now());
      return seed.loads.map((load) => rebaseLoad(load, shift));
    },
    listTrucks: async () => {
      const shift = seedShiftMs(now());
      return seed.trucks.map((truck) => rebaseTruck(truck, shift));
    },
    recordEvent: async (event) => {
      const stored: RecommendationEvent = {
        ...event,
        id: crypto.randomUUID(),
        createdAt: now().toISOString(),
      };
      events.push(stored);
      return stored;
    },
    listEvents: async (limit = 100) => events.slice(-limit).reverse(),
    marketStart: () => marketStartIso(now()),
  };
}

/**
 * Wraps a primary source so any failure falls back to a secondary one.
 * The demo must keep working even if the database is down or misconfigured.
 */
export function withFallback(
  primary: DataSource,
  fallback: DataSource,
  onError: (error: unknown, operation: string) => void = (error, operation) =>
    console.error(
      `[data] ${primary.kind}.${operation} failed, falling back to ${fallback.kind}`,
      error,
    ),
): DataSource {
  async function run<T>(operation: string, main: () => Promise<T>, backup: () => Promise<T>) {
    try {
      return await main();
    } catch (error) {
      onError(error, operation);
      return backup();
    }
  }

  return {
    kind: primary.kind,
    listCities: () => run("listCities", primary.listCities, fallback.listCities),
    listLoads: () => run("listLoads", primary.listLoads, fallback.listLoads),
    listTrucks: () => run("listTrucks", primary.listTrucks, fallback.listTrucks),
    recordEvent: (event) =>
      run(
        "recordEvent",
        () => primary.recordEvent(event),
        () => fallback.recordEvent(event),
      ),
    listEvents: (limit) =>
      run(
        "listEvents",
        () => primary.listEvents(limit),
        () => fallback.listEvents(limit),
      ),
    marketStart: () => primary.marketStart(),
  };
}
