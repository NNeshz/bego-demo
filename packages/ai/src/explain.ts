/**
 * One-sentence "Te conviene porque…" explanations.
 *
 * The code computes every number and hands Claude a list of pre-formatted
 * facts. Claude only chooses words. Any number in its sentence that is not one
 * of those facts is treated as a hallucination and the sentence is discarded in
 * favor of a deterministic template.
 */
import type { Chain, Recommendation } from "@retorno/engine";
import { z } from "zod";
import type { LlmClient } from "./llm";
import type { FallbackReason } from "./parse-trip";
import type { RateLimiter, TtlCache } from "./util";
import { TimeoutError, withTimeout } from "./util";

export type ExplainInput =
  | { kind: "load"; recommendation: Recommendation; baseName: string }
  | { kind: "chain"; chain: Chain; baseName: string };

export interface ExplainResult {
  text: string;
  source: "ai" | "template";
  fallbackReason?: FallbackReason | "unverified_numbers";
}

export interface ExplainDeps {
  llm?: LlmClient | undefined;
  timeoutMs?: number;
  cache?: TtlCache<ExplainResult>;
  limiter?: RateLimiter;
  onFallback?: (reason: string, error?: unknown) => void;
}

const MAX_LENGTH = 220;
const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});
const int = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });

export const money = (value: number) => mxn.format(Math.round(value));
const km = (value: number) => `${int.format(Math.round(value))} km`;
const hours = (value: number) => `${int.format(Math.round(value))} h`;

/** Pre-formatted facts. These are the ONLY numbers Claude may use. */
export function buildFacts(input: ExplainInput): Record<string, string> {
  if (input.kind === "load") {
    const r = input.recommendation;
    return {
      ruta: `${r.load.origin.name} → ${r.load.destination.name}`,
      mercancia: r.load.commodity,
      tarifa: money(r.breakdown.rateMxn),
      ganancia_neta: money(r.breakdown.netProfitMxn),
      ganancia_vs_regresar_vacio: money(r.gainVsEmptyMxn),
      km_vacio_para_recoger: km(r.deadheadKm),
      km_cargado: km(r.loadedKm),
      horas_totales: hours(r.totalHours),
      horas_esperando: hours(r.waitHours),
      te_acerca_a_tu_base: km(Math.max(0, r.kmCloserToBase)),
      km_de_tu_base_al_entregar: km(r.returnHomeKm),
      base: input.baseName,
    };
  }
  const c = input.chain;
  const [a, b] = c.legs;
  return {
    ruta: `${a.load.origin.name} → ${a.load.destination.name}, luego ${b.load.origin.name} → ${b.load.destination.name}`,
    ganancia_neta: money(c.netProfitMxn),
    ganancia_vs_regresar_vacio: money(c.gainVsEmptyMxn),
    km_vacio_total: km(c.totalEmptyKm),
    km_cargado_total: km(c.totalLoadedKm),
    horas_totales: hours(c.totalHours),
    km_de_tu_base_al_terminar: km(c.returnHomeKm),
    base: input.baseName,
  };
}

/** Deterministic explanation, also used whenever Claude is unavailable or untrustworthy. */
export function templateExplanation(input: ExplainInput): string {
  const facts = buildFacts(input);
  const gain = facts.ganancia_vs_regresar_vacio;

  if (input.kind === "chain") {
    const home =
      input.chain.returnHomeKm < 30
        ? `terminas en ${input.baseName}`
        : `terminas a ${facts.km_de_tu_base_al_terminar} de ${input.baseName}`;
    return `Te conviene porque encadenas dos cargas, ${home} y le ganas ${gain} a regresar vacío.`;
  }

  const r = input.recommendation;
  const parts: string[] = [];
  if (r.returnHomeKm < 30) parts.push(`te deja en ${input.baseName}`);
  else if (r.kmCloserToBase > 50)
    parts.push(`te acerca ${facts.te_acerca_a_tu_base} a ${input.baseName}`);
  parts.push(
    r.deadheadKm < 30
      ? "sale de donde descargas"
      : `solo vas ${facts.km_vacio_para_recoger} vacío a recogerla`,
  );
  const wait = r.waitHours >= 3 ? `, aunque esperas ${facts.horas_esperando} para cargar` : "";
  return `Te conviene porque ${parts.join(", ")} y le ganas ${gain} a regresar vacío${wait}.`;
}

/** Every number in `sentence` must appear in some fact. */
export function numbersAreGrounded(sentence: string, facts: Record<string, string>): boolean {
  const numbersIn = (text: string) =>
    (text.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[.,]$/, "").replace(/,/g, ""));
  const allowed = new Set(Object.values(facts).flatMap(numbersIn));
  return numbersIn(sentence).every((n) => allowed.has(n));
}

const explanationSchema = z.object({ sentence: z.string() });

const SYSTEM_PROMPT = `Explicas a un transportista mexicano (hombre-camión) por qué le conviene una carga de regreso.
Escribe UNA sola frase, máximo 30 palabras, que empiece exactamente con "Te conviene porque".
Usa lenguaje de transportista, directo, sin tecnicismos ni emojis.
Usa SOLO los datos que te doy y copia los números exactamente como vienen. No calcules nada nuevo.
Menciona lo que más pese: cuánto le ganas a regresar vacío y si te acerca a tu base.`;

export async function explainRecommendation(
  input: ExplainInput,
  deps: ExplainDeps = {},
): Promise<ExplainResult> {
  const facts = buildFacts(input);
  const cacheKey = JSON.stringify(facts);
  const cached = deps.cache?.get(cacheKey);
  if (cached) return cached;

  const fallback = (reason: ExplainResult["fallbackReason"], error?: unknown): ExplainResult => {
    if (reason) deps.onFallback?.(reason, error);
    return {
      text: templateExplanation(input),
      source: "template",
      ...(reason ? { fallbackReason: reason } : {}),
    };
  };

  if (!deps.llm) return fallback("disabled");
  if (deps.limiter && !deps.limiter.tryTake("explain")) return fallback("rate_limited");

  try {
    const raw = await withTimeout(
      (signal) =>
        deps.llm!.generateObject({
          system: SYSTEM_PROMPT,
          prompt: `Datos:\n${JSON.stringify(facts, null, 2)}`,
          schema: explanationSchema,
          maxTokens: 400,
          signal,
        }),
      deps.timeoutMs ?? 6_000,
    );
    const sentence = explanationSchema.parse(raw).sentence.trim();
    if (!sentence.startsWith("Te conviene porque") || sentence.length > MAX_LENGTH) {
      return fallback("invalid");
    }
    if (!numbersAreGrounded(sentence, facts)) return fallback("unverified_numbers");

    const result: ExplainResult = { text: sentence, source: "ai" };
    deps.cache?.set(cacheKey, result);
    return result;
  } catch (error) {
    return fallback(
      error instanceof TimeoutError ? "timeout" : error instanceof z.ZodError ? "invalid" : "error",
      error,
    );
  }
}
