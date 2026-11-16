import { compareWeek, recommend, planChains } from "@retorno/engine";
import { describe, expect, it, vi } from "vitest";
import { getCity, toPlace } from "./cities";
import { createDataSource } from "./index";
import { createMemorySource, withFallback, type DataSource } from "./source";
import { startOfDayMx } from "./time";

const MONDAY = new Date("2026-11-16T16:00:00.000Z"); // Mon 10:00 Mexico City
const LATE_SAME_DAY = new Date("2026-11-17T05:30:00.000Z"); // Mon 23:30 Mexico City
const TUESDAY = new Date("2026-11-17T16:00:00.000Z");

describe("startOfDayMx", () => {
  it("returns Mexico City midnight as UTC", () => {
    expect(new Date(startOfDayMx(MONDAY)).toISOString()).toBe("2026-11-16T06:00:00.000Z");
    expect(new Date(startOfDayMx(LATE_SAME_DAY)).toISOString()).toBe("2026-11-16T06:00:00.000Z");
  });
});

describe("memory source", () => {
  it("shifts the market so day 0 is today", async () => {
    const source = createMemorySource({ now: () => MONDAY });
    const loads = await source.listLoads();
    expect(source.marketStart()).toBe("2026-11-16T06:00:00.000Z");
    expect(Date.parse(loads[0]!.pickupStart)).toBeGreaterThanOrEqual(
      Date.parse(source.marketStart()),
    );
  });

  it("returns the same market all day and a shifted one tomorrow", async () => {
    const morning = await createMemorySource({ now: () => MONDAY }).listLoads();
    const night = await createMemorySource({ now: () => LATE_SAME_DAY }).listLoads();
    const tomorrow = await createMemorySource({ now: () => TUESDAY }).listLoads();
    expect(night).toEqual(morning);
    expect(Date.parse(tomorrow[0]!.pickupStart) - Date.parse(morning[0]!.pickupStart)).toBe(
      86_400_000,
    );
  });

  it("records a decision (several shown options) in one batch", async () => {
    const source = createMemorySource({ now: () => MONDAY });
    const decisionId = crypto.randomUUID();
    const shown = [1, 2, 3].map((rank) => ({
      action: "shown" as const,
      loadIds: [`CRG-000${rank}`],
      rank,
      scorePerHour: 1_000 - rank,
      gainVsEmptyMxn: 10_000,
      features: { net_per_hour: 500 },
      decisionId,
      policy: "engine",
      source: "app" as const,
    }));
    const stored = await source.recordEvents(shown);
    expect(stored.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(stored.every((e) => e.decisionId === decisionId && e.source === "app")).toBe(true);
  });

  it("records and lists events, newest first", async () => {
    const source = createMemorySource({ now: () => MONDAY });
    const base = {
      loadIds: ["CRG-0001"],
      rank: 1,
      scorePerHour: 900,
      gainVsEmptyMxn: 12_000,
      features: {},
    };
    await source.recordEvent({ ...base, action: "shown" });
    const accepted = await source.recordEvent({ ...base, action: "accepted" });
    const events = await source.listEvents();
    expect(events.map((e) => e.action)).toEqual(["accepted", "shown"]);
    expect(accepted.id).toMatch(/[0-9a-f-]{36}/);
  });
});

describe("withFallback", () => {
  const broken: DataSource = {
    kind: "postgres",
    listCities: () => Promise.reject(new Error("db down")),
    listLoads: () => Promise.reject(new Error("db down")),
    listTrucks: () => Promise.reject(new Error("db down")),
    recordEvent: () => Promise.reject(new Error("db down")),
    recordEvents: () => Promise.reject(new Error("db down")),
    listEvents: () => Promise.reject(new Error("db down")),
    marketStart: () => "2026-11-16T06:00:00.000Z",
  };

  it("serves the fallback when the primary fails, and reports the error", async () => {
    const onError = vi.fn();
    const memory = createMemorySource({ now: () => MONDAY });
    const source = withFallback(broken, memory, onError);
    expect(await source.listLoads()).toEqual(await memory.listLoads());
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "listLoads");
  });

  it("createDataSource uses memory when no database is configured", () => {
    expect(createDataSource(undefined).kind).toBe("memory");
  });
});

describe("engine on the seeded market", () => {
  const source = createMemorySource({ now: () => MONDAY });

  it("finds return loads for the flagship scenario (Nuevo Laredo → base Querétaro)", async () => {
    const loads = await source.listLoads();
    const truck = {
      unitType: "dry_van_53" as const,
      position: toPlace(getCity("nuevo-laredo")),
      availableAt: "2026-11-17T16:00:00.000Z",
      base: toPlace(getCity("queretaro")),
    };
    const result = recommend(truck, loads);
    expect(result.recommendations).toHaveLength(5);
    expect(result.recommendations[0]!.gainVsEmptyMxn).toBeGreaterThan(0);
    expect(planChains(truck, loads).length).toBeGreaterThan(0);
  });

  it("following recommendations cuts empty km and raises fleet profit", async () => {
    const [loads, trucks] = await Promise.all([source.listLoads(), source.listTrucks()]);
    const fleet = trucks.map(({ id, unitType, base }) => ({ id, unitType, base }));
    const { baseline, recommended } = compareWeek(fleet, loads, { start: source.marketStart() });
    expect(recommended.totals.emptyKmPct).toBeLessThan(baseline.totals.emptyKmPct);
    expect(recommended.totals.netMxn).toBeGreaterThan(baseline.totals.netMxn);
  });
});
