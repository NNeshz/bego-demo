import { describe, expect, it, vi } from "vitest";
import { parseTripIntent, type TripParserDeps } from "./parse-trip";
import { cities, fakeLlm, hangingLlm, mx, now } from "./test/fixtures";
import { RateLimiter, TtlCache } from "./util";

const FLAGSHIP = "Descargo en Laredo mañana a las 10, traigo caja seca de 53, mi base es Querétaro";

const aiAnswer = {
  unloadCityId: "nuevo-laredo",
  unloadAt: "2026-11-17T10:00:00-06:00",
  unitType: "dry_van_53",
  baseCityId: "queretaro",
};

const deps = (extra: Partial<TripParserDeps> = {}): TripParserDeps => ({
  cities,
  now,
  timeoutMs: 50,
  ...extra,
});

describe("parseTripIntent", () => {
  it("uses Claude's structured output when available", async () => {
    const llm = fakeLlm(() => aiAnswer);
    const result = await parseTripIntent(FLAGSHIP, {}, deps({ llm: llm.client }));
    expect(result.source).toBe("ai");
    expect(result.intent).toEqual({ ...aiAnswer, unloadAt: mx("2026-11-17", "10:00") });
    expect(result.missing).toEqual([]);
    expect(result.nextQuestion).toBeNull();
    // The prompt carries the current time and the city catalog.
    expect(llm.calls[0]!.system).toContain("2026-11-16T10:00:00-06:00");
    expect(llm.calls[0]!.system).toContain("nuevo-laredo");
  });

  it("falls back to rules without an LLM", async () => {
    const onFallback = vi.fn();
    const result = await parseTripIntent(FLAGSHIP, {}, deps({ onFallback }));
    expect(result.source).toBe("rules");
    expect(result.fallbackReason).toBe("disabled");
    expect(result.intent.unloadCityId).toBe("nuevo-laredo");
    expect(onFallback).toHaveBeenCalledWith("disabled");
  });

  it("falls back to rules when Claude fails", async () => {
    const llm = fakeLlm(() => {
      throw new Error("529 overloaded");
    });
    const result = await parseTripIntent(FLAGSHIP, {}, deps({ llm: llm.client }));
    expect(result).toMatchObject({ source: "rules", fallbackReason: "error" });
    expect(result.intent.baseCityId).toBe("queretaro");
  });

  it("falls back to rules when Claude is too slow", async () => {
    const result = await parseTripIntent(FLAGSHIP, {}, deps({ llm: hangingLlm(), timeoutMs: 20 }));
    expect(result).toMatchObject({ source: "rules", fallbackReason: "timeout" });
  });

  it("rejects malformed AI output and uses rules", async () => {
    const llm = fakeLlm(() => ({ unloadCityId: "atlantis", unloadAt: 42 }));
    const result = await parseTripIntent(FLAGSHIP, {}, deps({ llm: llm.client }));
    expect(result).toMatchObject({ source: "rules", fallbackReason: "invalid" });
    expect(result.intent.unloadCityId).toBe("nuevo-laredo");
  });

  it("fills fields Claude left empty with the rule parser", async () => {
    const llm = fakeLlm(() => ({ ...aiAnswer, unitType: null }));
    const result = await parseTripIntent(FLAGSHIP, {}, deps({ llm: llm.client }));
    expect(result.source).toBe("ai+rules");
    expect(result.intent.unitType).toBe("dry_van_53");
  });

  it("drops an unparseable date instead of failing", async () => {
    const llm = fakeLlm(() => ({ ...aiAnswer, unloadAt: "mañana temprano" }));
    const result = await parseTripIntent("descargo en Laredo", {}, deps({ llm: llm.client }));
    expect(result.intent.unloadAt).toBeNull();
    expect(result.missing).toContain("unloadAt");
  });

  it("asks for what's missing, one question at a time", async () => {
    const result = await parseTripIntent("ando en gdl", {}, deps());
    expect(result.intent.unloadCityId).toBe("guadalajara");
    expect(result.missing).toEqual(["unloadAt", "unitType", "baseCityId"]);
    expect(result.nextQuestion).toBe("¿Qué día y a qué hora quedas libre?");
  });

  it("accumulates answers across follow-up questions", async () => {
    const first = await parseTripIntent(
      "descargo en Laredo mañana a las 10 con caja seca",
      {},
      deps(),
    );
    expect(first.missing).toEqual(["baseCityId"]);
    const second = await parseTripIntent(
      "Querétaro",
      { previous: first.intent, expecting: "baseCityId" },
      deps(),
    );
    expect(second.intent).toEqual({ ...first.intent, baseCityId: "queretaro" });
    expect(second.nextQuestion).toBeNull();
  });

  it("caches AI answers so repeated messages don't cost another call", async () => {
    const llm = fakeLlm(() => aiAnswer);
    const shared = deps({ llm: llm.client, cache: new TtlCache({ max: 10, ttlMs: 60_000 }) });
    await parseTripIntent(FLAGSHIP, {}, shared);
    await parseTripIntent(`  ${FLAGSHIP.toUpperCase()} `, {}, shared);
    expect(llm.calls).toHaveLength(1);
  });

  it("degrades to rules when the Claude budget is exhausted", async () => {
    const llm = fakeLlm(() => aiAnswer);
    const limiter = new RateLimiter({ capacity: 1, refillPerMinute: 0 });
    const shared = deps({ llm: llm.client, limiter });
    expect((await parseTripIntent("descargo en Saltillo", {}, shared)).source).toBe("ai");
    const limited = await parseTripIntent("descargo en Puebla", {}, shared);
    expect(limited).toMatchObject({ source: "rules", fallbackReason: "rate_limited" });
    expect(limited.intent.unloadCityId).toBe("puebla");
  });
});
