/**
 * End-to-end check against the real Claude API (reads apps/web/.env.local).
 *
 *   pnpm ai:smoke
 *
 * Without ANTHROPIC_API_KEY it still runs and shows the deterministic fallbacks.
 */
import { CITIES, createMemorySource, getCity, toPlace } from "@retorno/db";
import { recommend } from "@retorno/engine";
import { createAiService } from "../index";

const ai = createAiService({
  cities: CITIES,
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5",
  onFallback: (operation, reason, error) =>
    console.warn(
      `  ↳ ${operation} fallback: ${reason}`,
      error instanceof Error ? error.message : "",
    ),
});

console.log(`AI enabled: ${ai.aiEnabled} (${process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5"})\n`);

const text = "Descargo en Laredo mañana a las 10, traigo caja seca de 53, mi base es Querétaro";
let started = performance.now();
const parsed = await ai.parseTrip(text);
console.log(`parseTrip (${Math.round(performance.now() - started)} ms, source: ${parsed.source})`);
console.log(parsed.intent, parsed.nextQuestion ?? "(nothing missing)", "\n");

const { intent } = parsed;
if (!intent.unloadCityId || !intent.baseCityId || !intent.unitType || !intent.unloadAt) {
  console.error("Incomplete intent, cannot continue.");
  process.exit(1);
}

const loads = await createMemorySource().listLoads();
const base = getCity(intent.baseCityId);
const { recommendations } = recommend(
  {
    unitType: intent.unitType,
    position: toPlace(getCity(intent.unloadCityId)),
    availableAt: intent.unloadAt,
    base: toPlace(base),
  },
  loads,
);
const top = recommendations[0];
if (!top) {
  console.error("No recommendations for this scenario today.");
  process.exit(1);
}

started = performance.now();
const explanation = await ai.explain({ kind: "load", recommendation: top, baseName: base.name });
console.log(
  `explain (${Math.round(performance.now() - started)} ms, source: ${explanation.source})`,
);
console.log(`${top.load.origin.name} → ${top.load.destination.name}: ${explanation.text}`);
