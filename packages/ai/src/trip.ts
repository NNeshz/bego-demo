import { UNIT_TYPES, type UnitType } from "@retorno/engine";

/** Minimal city info the AI layer needs (decoupled from the db package). */
export interface CityRef {
  id: string;
  name: string;
  state: string;
}

/** What we need to know to recommend a return load. `null` = not provided yet. */
export interface TripIntent {
  unloadCityId: string | null;
  /** When the truck is free at the unload city (UTC ISO-8601). */
  unloadAt: string | null;
  unitType: UnitType | null;
  baseCityId: string | null;
}

export const TRIP_FIELDS = ["unloadCityId", "unloadAt", "unitType", "baseCityId"] as const;
export type TripField = (typeof TRIP_FIELDS)[number];

export const EMPTY_INTENT: TripIntent = {
  unloadCityId: null,
  unloadAt: null,
  unitType: null,
  baseCityId: null,
};

/** Follow-up questions in trucker language. Asked by code, not invented by the AI. */
export const FIELD_QUESTIONS: Record<TripField, string> = {
  unloadCityId: "¿En qué ciudad descargas?",
  unloadAt: "¿Qué día y a qué hora quedas libre?",
  unitType: "¿Qué unidad traes? Caja seca, refri, plataforma, full o torton.",
  baseCityId: "¿Dónde está tu base? ¿A dónde quieres regresar?",
};

export function missingFields(intent: TripIntent): TripField[] {
  return TRIP_FIELDS.filter((field) => intent[field] === null);
}

/** Newer non-null values win. Used to accumulate answers across follow-up questions. */
export function mergeIntents(...intents: Array<Partial<TripIntent> | undefined>): TripIntent {
  const merged: TripIntent = { ...EMPTY_INTENT };
  for (const intent of intents) {
    if (!intent) continue;
    for (const field of TRIP_FIELDS) {
      const value = intent[field];
      if (value !== null && value !== undefined)
        (merged as Record<TripField, unknown>)[field] = value;
    }
  }
  return merged;
}

/** Drop anything that doesn't refer to a known city / unit or isn't a valid date. */
export function sanitizeIntent(
  intent: Partial<TripIntent>,
  cityIds: ReadonlySet<string>,
): TripIntent {
  const city = (id: string | null | undefined) => (id && cityIds.has(id) ? id : null);
  const unloadAtMs = intent.unloadAt ? Date.parse(intent.unloadAt) : Number.NaN;
  return {
    unloadCityId: city(intent.unloadCityId),
    unloadAt: Number.isFinite(unloadAtMs) ? new Date(unloadAtMs).toISOString() : null,
    unitType: intent.unitType && UNIT_TYPES.includes(intent.unitType) ? intent.unitType : null,
    baseCityId: city(intent.baseCityId),
  };
}
