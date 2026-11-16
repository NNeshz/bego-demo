import { DEFAULT_COST_CONFIG, roadKm, UNIT_TYPES } from "@retorno/engine";
import { describe, expect, it } from "vitest";
import { CITIES } from "./cities";
import { generateSeed } from "./seed";
import { SEED_REFERENCE_MS } from "./time";

describe("generateSeed", () => {
  const seed = generateSeed();

  it("is deterministic for a given seed and different for another", () => {
    expect(generateSeed()).toEqual(seed);
    expect(generateSeed({ seed: 1 }).loads).not.toEqual(seed.loads);
  });

  it("has the expected size", () => {
    expect(seed.cities).toHaveLength(20);
    expect(seed.loads).toHaveLength(320);
    expect(seed.trucks).toHaveLength(25);
  });

  it("generates valid loads", () => {
    const cityIds = new Set(CITIES.map((c) => c.id));
    const ids = new Set<string>();
    for (const load of seed.loads) {
      ids.add(load.id);
      expect(cityIds.has(load.origin.cityId)).toBe(true);
      expect(cityIds.has(load.destination.cityId)).toBe(true);
      expect(load.origin.cityId).not.toBe(load.destination.cityId);
      expect(UNIT_TYPES).toContain(load.unitType);
      expect(Date.parse(load.pickupEnd)).toBeGreaterThan(Date.parse(load.pickupStart));
      expect(Date.parse(load.pickupStart)).toBeGreaterThanOrEqual(SEED_REFERENCE_MS);
      expect(load.rateMxn).toBeGreaterThanOrEqual(7_000);
      expect(load.weightKg).toBeGreaterThan(0);
      const km = roadKm(load.origin, load.destination, DEFAULT_COST_CONFIG.roadFactor);
      expect(km).toBeGreaterThanOrEqual(120);
      expect(km).toBeLessThanOrEqual(1_600);
    }
    expect(ids.size).toBe(seed.loads.length);
  });

  it("covers every unit type", () => {
    const units = new Set(seed.loads.map((l) => l.unitType));
    expect(units.size).toBe(UNIT_TYPES.length);
  });

  it("gives trucks a base different from their current position", () => {
    for (const truck of seed.trucks) expect(truck.base.cityId).not.toBe(truck.current.cityId);
  });
});
