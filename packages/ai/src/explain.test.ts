import { recommend, planChains, type Load, type Place } from "@retorno/engine";
import { describe, expect, it } from "vitest";
import {
  buildFacts,
  explainRecommendation,
  numbersAreGrounded,
  templateExplanation,
  type ExplainInput,
} from "./explain";
import { fakeLlm, hangingLlm } from "./test/fixtures";
import { TtlCache } from "./util";

const place = (cityId: string, name: string, lat: number, lng: number): Place => ({
  cityId,
  name,
  lat,
  lng,
});
const laredo = place("nuevo-laredo", "Nuevo Laredo", 27.4779, -99.5496);
const monterrey = place("monterrey", "Monterrey", 25.6866, -100.3161);
const slp = place("san-luis-potosi", "San Luis Potosí", 22.1565, -100.9855);
const queretaro = place("queretaro", "Querétaro", 20.5888, -100.3899);

const T0 = "2026-11-17T16:00:00.000Z";
const load = (id: string, origin: Place, destination: Place, rateMxn: number): Load => ({
  id,
  origin,
  destination,
  unitType: "dry_van_53",
  pickupStart: T0,
  pickupEnd: "2026-11-18T16:00:00.000Z",
  weightKg: 20_000,
  rateMxn,
  shipper: "Shipper",
  commodity: "autopartes",
});

const truck = {
  unitType: "dry_van_53" as const,
  position: laredo,
  availableAt: T0,
  base: queretaro,
};
const loads = [
  load("A", laredo, queretaro, 32_000),
  load("B", laredo, monterrey, 9_000),
  load("C", monterrey, slp, 18_000),
  load("D", slp, queretaro, 10_000),
];
const [top] = recommend(truck, loads).recommendations;
const loadInput: ExplainInput = { kind: "load", recommendation: top!, baseName: "Querétaro" };

describe("templateExplanation", () => {
  it("explains a load that ends at base", () => {
    expect(top!.load.id).toBe("A");
    const text = templateExplanation(loadInput);
    expect(text).toMatch(
      /^Te conviene porque te deja en Querétaro, sale de donde descargas y le ganas \$[\d,]+ a regresar vacío\.$/,
    );
    expect(numbersAreGrounded(text, buildFacts(loadInput))).toBe(true);
  });

  it("explains a chain", () => {
    const [chain] = planChains(truck, loads);
    const input: ExplainInput = { kind: "chain", chain: chain!, baseName: "Querétaro" };
    expect(templateExplanation(input)).toMatch(/^Te conviene porque encadenas dos cargas/);
  });
});

describe("numbersAreGrounded", () => {
  const facts = { ganancia: "$26,750", km: "11 km" };
  it("accepts numbers copied from the facts", () => {
    expect(
      numbersAreGrounded("Te conviene porque ganas $26,750 y solo vas 11 km vacío.", facts),
    ).toBe(true);
  });
  it("rejects invented numbers", () => {
    expect(numbersAreGrounded("Te conviene porque ganas $30,000.", facts)).toBe(false);
    expect(numbersAreGrounded("Te conviene porque ahorras 2 días.", facts)).toBe(false);
  });
});

describe("explainRecommendation", () => {
  const gain = buildFacts(loadInput).ganancia_vs_regresar_vacio!;

  it("uses Claude's sentence when it is grounded", async () => {
    const sentence = `Te conviene porque te lleva directo a Querétaro y le ganas ${gain} a regresar vacío.`;
    const llm = fakeLlm(() => ({ sentence }));
    expect(await explainRecommendation(loadInput, { llm: llm.client })).toEqual({
      text: sentence,
      source: "ai",
    });
    // Claude only receives pre-computed facts.
    expect(llm.calls[0]!.prompt).toContain(gain);
  });

  it("discards sentences with invented numbers", async () => {
    const llm = fakeLlm(() => ({
      sentence: "Te conviene porque le ganas $99,999 a regresar vacío.",
    }));
    const result = await explainRecommendation(loadInput, { llm: llm.client });
    expect(result).toMatchObject({ source: "template", fallbackReason: "unverified_numbers" });
    expect(result.text).toBe(templateExplanation(loadInput));
  });

  it("discards sentences that break the format", async () => {
    const llm = fakeLlm(() => ({ sentence: "¡Excelente opción para ti!" }));
    expect(await explainRecommendation(loadInput, { llm: llm.client })).toMatchObject({
      source: "template",
      fallbackReason: "invalid",
    });
  });

  it("uses the template without an LLM or on timeout", async () => {
    expect(await explainRecommendation(loadInput)).toMatchObject({
      source: "template",
      fallbackReason: "disabled",
    });
    expect(
      await explainRecommendation(loadInput, { llm: hangingLlm(), timeoutMs: 20 }),
    ).toMatchObject({
      source: "template",
      fallbackReason: "timeout",
    });
  });

  it("caches grounded answers", async () => {
    const llm = fakeLlm(() => ({
      sentence: `Te conviene porque le ganas ${gain} a regresar vacío.`,
    }));
    const cache = new TtlCache<Awaited<ReturnType<typeof explainRecommendation>>>({
      max: 10,
      ttlMs: 60_000,
    });
    await explainRecommendation(loadInput, { llm: llm.client, cache });
    await explainRecommendation(loadInput, { llm: llm.client, cache });
    expect(llm.calls).toHaveLength(1);
  });
});
