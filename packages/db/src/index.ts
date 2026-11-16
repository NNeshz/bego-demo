import { createPostgresSource } from "./postgres";
import { createMemorySource, withFallback, type DataSource, type SourceOptions } from "./source";

export * from "./types";
export { CITIES, getCity, toPlace } from "./cities";
export { generateSeed, DEFAULT_SEED, type SeedData, type SeedOptions } from "./seed";
export { SEED_REFERENCE_MS, seedShiftMs, startOfDayMx } from "./time";
export {
  createMemorySource,
  withFallback,
  rebaseLoad,
  rebaseTruck,
  marketStartIso,
  type DataSource,
  type SourceOptions,
} from "./source";
export {
  createPostgresSource,
  createDb,
  isNeonUrl,
  type Db,
  type DbHandle,
  type PostgresSource,
} from "./postgres";

/**
 * Pick the data source for the current environment:
 * Postgres (with in-memory fallback) when a URL is configured, memory otherwise.
 */
export function createDataSource(
  databaseUrl: string | undefined,
  options: SourceOptions = {},
): DataSource {
  const memory = createMemorySource(options);
  if (!databaseUrl) return memory;
  return withFallback(createPostgresSource(databaseUrl, options), memory);
}
