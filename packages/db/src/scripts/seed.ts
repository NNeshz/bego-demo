/**
 * Writes the deterministic seed into Postgres (replacing cities, loads and trucks).
 * Recommendation events are feedback data and are never deleted by the seed.
 *
 *   pnpm db:seed
 */
import { createDb } from "../postgres";
import * as schema from "../schema";
import { generateSeed } from "../seed";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set (expected in apps/web/.env.local).");
  process.exit(1);
}

const db = createDb(databaseUrl);
const { cities, loads, trucks } = generateSeed();

// neon-http has no interactive transactions; db.batch() runs all statements in one transaction.
await db.batch([
  db.delete(schema.loads),
  db.delete(schema.trucks),
  db.delete(schema.cities),
  db.insert(schema.cities).values(cities),
  db.insert(schema.loads).values(
    loads.map((load) => ({
      id: load.id,
      originCityId: load.origin.cityId,
      destinationCityId: load.destination.cityId,
      unitType: load.unitType,
      pickupStart: load.pickupStart,
      pickupEnd: load.pickupEnd,
      weightKg: load.weightKg,
      rateMxn: load.rateMxn,
      shipper: load.shipper,
      commodity: load.commodity,
    })),
  ),
  db.insert(schema.trucks).values(
    trucks.map((truck) => ({
      id: truck.id,
      driverName: truck.driverName,
      plate: truck.plate,
      unitType: truck.unitType,
      baseCityId: truck.base.cityId,
      currentCityId: truck.current.cityId,
      availableAt: truck.availableAt,
      status: truck.status,
    })),
  ),
]);

console.log(`Seeded ${cities.length} cities, ${loads.length} loads, ${trucks.length} trucks.`);
