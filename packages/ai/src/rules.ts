/**
 * Deterministic, regex-based trip parser. It is the fallback when Claude is not
 * configured, slow, rate-limited or wrong — the demo must work without AI.
 */
import type { UnitType } from "@retorno/engine";
import type { CityRef, TripField, TripIntent } from "./trip";
import { mxParts, normalizeText, startOfDayMx } from "./util";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Extra ways truckers name cities (normalized: lowercase, no accents). */
const CITY_ALIASES: Record<string, readonly string[]> = {
  "nuevo-laredo": ["nuevo laredo", "laredo", "nld"],
  "laredo-tx": ["laredo tx", "laredo texas", "laredo del otro lado"],
  cdmx: ["cdmx", "ciudad de mexico", "df", "el df", "mexico df", "la capital"],
  queretaro: ["qro", "queretaro"],
  guadalajara: ["gdl", "guadalajara", "guanatos"],
  monterrey: ["mty", "monterrey", "la sultana"],
  "san-luis-potosi": ["slp", "san luis potosi", "san luis"],
  aguascalientes: ["ags", "aguascalientes"],
  "ciudad-juarez": ["juarez", "cd juarez", "ciudad juarez"],
  "lazaro-cardenas": ["lazaro cardenas", "lazaro"],
  toluca: ["toluca"],
  leon: ["leon"],
  celaya: ["celaya"],
  saltillo: ["saltillo"],
  puebla: ["puebla"],
  tlaxcala: ["tlaxcala"],
  manzanillo: ["manzanillo"],
  veracruz: ["veracruz", "vera"],
  hermosillo: ["hermosillo"],
  merida: ["merida"],
};

const BASE_CUES = /\b(base|vivo|soy de|regres\w*|casa|volver|vuelta|jalo para|me quedo)\b/;
const UNLOAD_CUES = /\b(descarg\w*|entreg\w*|llego|llegando|estoy|ando|termino|dejo)\b/;

const UNIT_PATTERNS: ReadonlyArray<[RegExp, UnitType]> = [
  [/\b(refri\w*|thermo|termo|reefer|caja fria)\b/, "reefer_53"],
  [/\b(plataforma|plana|flatbed)\b/, "flatbed_48"],
  [/\b(full|fulles|doble remolque|doble caja)\b/, "full_double"],
  [/\btorton\b/, "torton"],
  [/\b(caja seca|seca|dry van|caja de 53|caja 53|53 pies)\b/, "dry_van_53"],
];

const WEEKDAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const NUMBER_WORDS: Record<string, number> = {
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
};

interface CityMatch {
  cityId: string;
  start: number;
  end: number;
}

export interface RuleParseContext {
  /** The field the UI just asked about; a lone answer like "Querétaro" fills it. */
  expecting?: TripField | undefined;
  /** Fields already known, so a lone city fills the missing one. */
  known?: Partial<TripIntent> | undefined;
}

export function parseTripRules(
  text: string,
  cities: readonly CityRef[],
  now: Date,
  context: RuleParseContext = {},
): TripIntent {
  const normalized = normalizeText(text);
  const { unloadCityId, baseCityId } = assignCities(
    normalized,
    findCities(normalized, cities),
    context,
  );
  return {
    unloadCityId,
    baseCityId,
    unitType: parseUnit(normalized),
    unloadAt: parseWhen(normalized, now),
  };
}

function aliasesFor(city: CityRef): string[] {
  return [normalizeText(city.name), ...(CITY_ALIASES[city.id] ?? [])];
}

function findCities(text: string, cities: readonly CityRef[]): CityMatch[] {
  const candidates: CityMatch[] = [];
  for (const city of cities) {
    for (const alias of aliasesFor(city)) {
      const pattern = new RegExp(`(?<![a-z0-9])${escapeRegExp(alias)}(?![a-z0-9])`, "g");
      for (const match of text.matchAll(pattern)) {
        candidates.push({ cityId: city.id, start: match.index, end: match.index + alias.length });
      }
    }
  }
  // Longest match wins on overlaps ("nuevo laredo" beats "laredo", "laredo tx" beats "laredo").
  candidates.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const chosen: CityMatch[] = [];
  for (const candidate of candidates) {
    if (!chosen.some((c) => candidate.start < c.end && c.start < candidate.end))
      chosen.push(candidate);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

function assignCities(
  text: string,
  matches: CityMatch[],
  context: RuleParseContext,
): Pick<TripIntent, "unloadCityId" | "baseCityId"> {
  let unloadCityId: string | null = null;
  let baseCityId: string | null = null;
  const unassigned: CityMatch[] = [];

  matches.forEach((match, i) => {
    // Look at the words between the previous city and this one.
    const windowStart = Math.max(i > 0 ? matches[i - 1]!.end : 0, match.start - 40);
    const before = text.slice(windowStart, match.start);
    if (BASE_CUES.test(before) && !baseCityId) baseCityId = match.cityId;
    else if (UNLOAD_CUES.test(before) && !unloadCityId) unloadCityId = match.cityId;
    else unassigned.push(match);
  });

  for (const match of unassigned) {
    const knownUnload = unloadCityId ?? context.known?.unloadCityId ?? null;
    const wantsBase = context.expecting === "baseCityId" || (knownUnload !== null && !baseCityId);
    if (wantsBase && !baseCityId) baseCityId = match.cityId;
    else if (!unloadCityId) unloadCityId = match.cityId;
    else if (!baseCityId) baseCityId = match.cityId;
  }
  return { unloadCityId, baseCityId };
}

function parseUnit(text: string): UnitType | null {
  for (const [pattern, unit] of UNIT_PATTERNS) if (pattern.test(text)) return unit;
  return null;
}

/** Understands: hoy, mañana, pasado mañana, weekdays, "a las 10", "10:30", "5 pm", "de la tarde"… */
export function parseWhen(text: string, now: Date): string | null {
  let dayOffset: number | null = null;
  let partOfDay: "morning" | "afternoon" | "night" | null = null;

  let rest = text;
  if (/\bpasado manana\b/.test(rest)) {
    dayOffset = 2;
    rest = rest.replace(/\bpasado manana\b/g, " ");
  }
  for (const match of rest.matchAll(/\bmanana\b/g)) {
    const before = rest.slice(Math.max(0, match.index - 8), match.index);
    if (/\b(la|las)\s$/.test(before)) partOfDay = "morning";
    else dayOffset ??= 1;
  }
  if (dayOffset === null && /\b(hoy|ahorita|ahora)\b/.test(rest)) dayOffset = 0;

  const { weekday, hour: nowHour, minute: nowMinute } = mxParts(now);
  if (dayOffset === null) {
    const index = WEEKDAYS.findIndex((day) => new RegExp(`\\b${day}\\b`).test(rest));
    if (index >= 0) dayOffset = (index - weekday + 7) % 7;
  }

  if (/\b(de|en|por) la tarde\b/.test(rest)) partOfDay = "afternoon";
  if (/\b(de|en|por) la noche\b/.test(rest)) partOfDay = "night";

  let hour: number | null = null;
  let minute = 0;
  const time =
    rest.match(
      /\b(?:a las|a la|alas|tipo|como a las|sobre las|por ahi de las)\s*(\d{1,2}|[a-z]+)(?::(\d{2}))?/,
    ) ??
    rest.match(/\b(\d{1,2})(?::(\d{2}))?\s*(?:am|pm|hrs|horas|h)\b/) ??
    rest.match(/\b(\d{1,2}):(\d{2})\b/);
  if (time) {
    const raw = time[1]!;
    const value = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
    if (value !== undefined && value <= 23) {
      hour = value;
      minute = time[2] ? Math.min(59, Number(time[2])) : 0;
    }
  }
  if (/\bmediodia\b/.test(rest)) hour ??= 12;
  if (/\bmedianoche\b/.test(rest)) hour ??= 0;

  const isPm = /\bpm\b/.test(rest) || partOfDay === "afternoon" || partOfDay === "night";
  if (hour !== null && hour < 12 && isPm) hour += 12;
  if (hour === null && partOfDay) hour = { morning: 9, afternoon: 16, night: 21 }[partOfDay];

  if (dayOffset === null && hour === null) return null;
  if (hour === null) hour = 9; // a day without time: assume start of the working day
  if (dayOffset === null) {
    // Only a time: today if it hasn't passed yet, otherwise tomorrow.
    dayOffset = hour * 60 + minute > nowHour * 60 + nowMinute ? 0 : 1;
  }

  return new Date(
    startOfDayMx(now) + dayOffset * DAY_MS + hour * HOUR_MS + minute * 60_000,
  ).toISOString();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
