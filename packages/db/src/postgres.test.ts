/**
 * Integration tests against a real Postgres (local Docker or Neon).
 * Skipped when DATABASE_URL is not available, e.g. in CI.
 *
 *   pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm test
 */
import { existsSync } from "node:fs";
import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb, createPostgresSource, isNeonUrl } from "./postgres";
import { recommendationEvents } from "./schema";
import { createMemorySource } from "./source";

const envFile = new URL("../../../apps/web/.env.local", import.meta.url);
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env.DATABASE_URL;

describe("isNeonUrl", () => {
  it("detects Neon hosts", () => {
    expect(isNeonUrl("postgresql://u:p@ep-cool-123.us-east-2.aws.neon.tech/db")).toBe(true);
    expect(isNeonUrl("postgresql://u:p@localhost:54329/db")).toBe(false);
  });
});

describe.skipIf(!databaseUrl)("postgres source (integration)", () => {
  const now = () => new Date("2026-11-16T16:00:00.000Z");
  const source = createPostgresSource(databaseUrl!, { now });
  const memory = createMemorySource({ now });
  const createdEventIds: string[] = [];

  afterAll(async () => {
    if (createdEventIds.length > 0) {
      const { db, close } = createDb(databaseUrl!);
      await db
        .delete(recommendationEvents)
        .where(inArray(recommendationEvents.id, createdEventIds));
      await close();
    }
    await source.close();
  });

  const byId = <T extends { id: string }>(items: T[]) =>
    [...items].sort((a, b) => a.id.localeCompare(b.id));

  it("returns exactly the same market as the in-memory seed", async () => {
    expect(byId(await source.listLoads())).toEqual(byId(await memory.listLoads()));
  });

  it("returns exactly the same fleet as the in-memory seed", async () => {
    expect(byId(await source.listTrucks())).toEqual(byId(await memory.listTrucks()));
  });

  it("returns the same cities", async () => {
    expect(byId(await source.listCities())).toEqual(byId(await memory.listCities()));
  });

  it("stores a decision batch with its grouping fields", async () => {
    const decisionId = crypto.randomUUID();
    const stored = await source.recordEvents(
      [1, 2].map((rank) => ({
        action: "shown" as const,
        loadIds: [`CRG-000${rank}`],
        rank,
        scorePerHour: 900,
        gainVsEmptyMxn: 12_000,
        features: { net_per_hour: 480.5, wait_per_hour: 0.1 },
        decisionId,
        policy: "explore",
        source: "simulator" as const,
      })),
    );
    createdEventIds.push(...stored.map((e) => e.id));
    expect(stored).toHaveLength(2);
    expect(stored[1]).toMatchObject({
      rank: 2,
      decisionId,
      policy: "explore",
      source: "simulator",
    });
    expect(stored[0]!.features).toEqual({ net_per_hour: 480.5, wait_per_hour: 0.1 });
  });

  it("round-trips recommendation events", async () => {
    const stored = await source.recordEvent({
      action: "accepted",
      truckId: "U-001",
      loadIds: ["CRG-0001", "CRG-0002"],
      rank: 2,
      scorePerHour: 812.5,
      gainVsEmptyMxn: 18_250.75,
      features: { deadheadKm: 42.1, kmCloserToBase: 310 },
    });
    createdEventIds.push(stored.id);

    const [latest] = await source.listEvents(1);
    expect(latest).toEqual(stored);
    expect(latest!.loadIds).toEqual(["CRG-0001", "CRG-0002"]);
    expect(latest!.features).toEqual({ deadheadKm: 42.1, kmCloserToBase: 310 });
  });
});
