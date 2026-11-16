import { UNIT_TYPES } from "@retorno/engine";
import { z } from "zod";
import type { LlmClient } from "./llm";
import { parseTripRules } from "./rules";
import {
  EMPTY_INTENT,
  FIELD_QUESTIONS,
  mergeIntents,
  missingFields,
  sanitizeIntent,
  type CityRef,
  type TripField,
  type TripIntent,
} from "./trip";
import type { RateLimiter, TtlCache } from "./util";
import { normalizeText, startOfDayMx, TimeoutError, toMxIso, withTimeout } from "./util";

export type FallbackReason = "disabled" | "rate_limited" | "timeout" | "error" | "invalid";

export interface ParseTripResult {
  intent: TripIntent;
  missing: TripField[];
  /** The next question to ask, or null when we have everything. */
  nextQuestion: string | null;
  /** Who produced the data: Claude, the rule-based parser, or Claude with gaps filled by rules. */
  source: "ai" | "rules" | "ai+rules";
  /** Why we didn't use (only) Claude. Useful in logs and in the UI's debug badge. */
  fallbackReason?: FallbackReason;
}

export interface ParseTripContext {
  /** Answers gathered so far in the conversation. */
  previous?: Partial<TripIntent> | undefined;
  /** The field the UI just asked about. */
  expecting?: TripField | undefined;
}

export interface TripParserDeps {
  cities: readonly CityRef[];
  llm?: LlmClient | undefined;
  now?: () => Date;
  timeoutMs?: number;
  cache?: TtlCache<ParseTripResult>;
  limiter?: RateLimiter;
  onFallback?: (reason: FallbackReason, error?: unknown) => void;
}

export async function parseTripIntent(
  text: string,
  context: ParseTripContext,
  deps: TripParserDeps,
): Promise<ParseTripResult> {
  const now = deps.now?.() ?? new Date();
  const cityIds = new Set(deps.cities.map((c) => c.id));
  const previous = sanitizeIntent(context.previous ?? EMPTY_INTENT, cityIds);

  // Relative dates ("mañana") depend on the day, so the day is part of the key.
  const cacheKey = JSON.stringify([
    normalizeText(text),
    previous,
    context.expecting,
    startOfDayMx(now),
  ]);
  const cached = deps.cache?.get(cacheKey);
  if (cached) return cached;

  const rules = sanitizeIntent(
    parseTripRules(text, deps.cities, now, { expecting: context.expecting, known: previous }),
    cityIds,
  );

  let parsed: TripIntent = rules;
  let source: ParseTripResult["source"] = "rules";
  let fallbackReason: FallbackReason | undefined;

  if (!deps.llm) {
    fallbackReason = "disabled";
  } else if (deps.limiter && !deps.limiter.tryTake("parse")) {
    fallbackReason = "rate_limited";
  } else {
    try {
      const schema = aiSchema(deps.cities);
      const raw = await withTimeout(
        (signal) =>
          deps.llm!.generateObject({
            system: buildSystemPrompt(deps.cities, now),
            prompt: buildUserPrompt(text, previous, context.expecting),
            schema,
            maxTokens: 600,
            signal,
          }),
        deps.timeoutMs ?? 6_000,
      );
      // Defense in depth: validate again, whatever the client claims.
      const ai = sanitizeIntent(schema.parse(raw), cityIds);
      // Claude wins; rules only fill what Claude left empty.
      parsed = mergeIntents(rules, ai);
      const filledByRules = missingFields(ai).some((field) => parsed[field] !== null);
      source = filledByRules ? "ai+rules" : "ai";
    } catch (error) {
      fallbackReason =
        error instanceof TimeoutError
          ? "timeout"
          : error instanceof z.ZodError
            ? "invalid"
            : "error";
      deps.onFallback?.(fallbackReason, error);
    }
  }
  if (fallbackReason === "disabled" || fallbackReason === "rate_limited")
    deps.onFallback?.(fallbackReason);

  const intent = mergeIntents(previous, parsed);
  const missing = missingFields(intent);
  const result: ParseTripResult = {
    intent,
    missing,
    nextQuestion: missing[0] ? FIELD_QUESTIONS[missing[0]] : null,
    source,
    ...(fallbackReason ? { fallbackReason } : {}),
  };
  // Only cache successful AI answers: rule results are free to recompute.
  if (source !== "rules") deps.cache?.set(cacheKey, result);
  return result;
}

/** Schema Claude must follow. City ids are an enum, so it can't invent cities. */
function aiSchema(cities: readonly CityRef[]) {
  const ids = cities.map((c) => c.id) as [string, ...string[]];
  return z.object({
    unloadCityId: z.enum(ids).nullable().describe("City where the trucker unloads / is now"),
    unloadAt: z
      .string()
      .nullable()
      .describe("When the trucker is free at the unload city, ISO-8601 with -06:00 offset"),
    unitType: z.enum(UNIT_TYPES).nullable().describe("Truck unit type"),
    baseCityId: z.enum(ids).nullable().describe("City the trucker wants to return to (home base)"),
  });
}

function buildSystemPrompt(cities: readonly CityRef[], now: Date): string {
  const cityList = cities.map((c) => `- ${c.id}: ${c.name} (${c.state})`).join("\n");
  return `Conviertes lo que escribe o dicta un transportista mexicano (hombre-camión) en datos estructurados.
Solo extraes lo que dice. Nunca inventes: si un dato no aparece, devuelve null.

Fecha y hora actual en Ciudad de México: ${toMxIso(now)}.

Ciudades válidas (usa el id):
${cityList}

Reglas:
- "Laredo" sin más contexto es nuevo-laredo. Solo usa laredo-tx si dice Texas, TX o "del otro lado".
- Unidades: caja seca / seca / 53 pies → dry_van_53; refri / thermo / caja fría → reefer_53;
  plataforma / plana → flatbed_48; full / doble remolque → full_double; torton → torton.
- unloadAt: cuándo queda libre después de descargar. "mañana" es el día siguiente; "en la mañana" es temprano.
  Si da el día pero no la hora, usa las 09:00. Formato ISO-8601 con offset -06:00.
- baseCityId: donde vive o a donde quiere regresar ("mi base es…", "soy de…", "regreso a…").
- Si el usuario responde solo una ciudad a una pregunta, asígnala al campo que se le preguntó.`;
}

function buildUserPrompt(
  text: string,
  previous: TripIntent,
  expecting: TripField | undefined,
): string {
  const known = Object.entries(previous).filter(([, value]) => value !== null);
  const lines = [`Mensaje del transportista: """${text.slice(0, 1_000)}"""`];
  if (known.length > 0)
    lines.push(`Datos que ya teníamos: ${JSON.stringify(Object.fromEntries(known))}`);
  if (expecting) lines.push(`Le acabamos de preguntar por: ${expecting}`);
  return lines.join("\n");
}
