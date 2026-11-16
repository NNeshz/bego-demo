/**
 * Writes the deterministic seed into Postgres (replacing cities, loads and trucks).
 * Recommendation events are feedback data and are never deleted by the seed.
 *
 *   pnpm db:seed
 */
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { createDb, type Db } from "../postgres";
import * as schema from "../schema";
import { generateSeed } from "../seed";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set (expected in apps/web/.env.local).");
  process.exit(1);
}

const { cities, loads, trucks } = generateSeed();

const loadRows = loads.map((load) => ({
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
}));

const truckRows = trucks.map((truck) => ({
  id: truck.id,
  driverName: truck.driverName,
  plate: truck.plate,
  unitType: truck.unitType,
  baseCityId: truck.base.cityId,
  currentCityId: truck.current.cityId,
  availableAt: truck.availableAt,
  status: truck.status,
}));

/** Order matters: children before parents on delete, parents before children on insert. */
const statements = (db: Db) => [
  db.delete(schema.loads),
  db.delete(schema.trucks),
  db.delete(schema.cities),
  db.insert(schema.cities).values(cities),
  db.insert(schema.loads).values(loadRows),
  db.insert(schema.trucks).values(truckRows),
];

const handle = createDb(databaseUrl);
try {
  if (handle.driver === "neon-http") {
    // neon-http has no interactive transactions; batch() runs everything in one transaction.
    const neonDb = handle.db as unknown as NeonHttpDatabase<typeof schema>;
    const [first, ...rest] = statements(handle.db) as unknown as Parameters<typeof neonDb.batch>[0];
    await neonDb.batch([first, ...rest]);
  } else {
    await handle.db.transaction(async (tx) => {
      for (const statement of statements(tx)) await statement;
    });
  }
  console.log(
    `Seeded ${cities.length} cities, ${loads.length} loads, ${trucks.length} trucks (${handle.driver}).`,
  );
} finally {
  await handle.close();
}
