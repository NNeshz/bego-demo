/**
 * The seed is generated against a fixed reference date and shifted by whole
 * days to "today" at read time. The demo never goes stale, and the same day
 * always yields the same market (deterministic).
 */

const DAY_MS = 86_400_000;
/** Mexico City is UTC−6 all year (no DST since 2022). */
const MX_OFFSET_MS = -6 * 3_600_000;

/** Monday 2026-01-05 00:00 in Mexico City. */
export const SEED_REFERENCE_MS = Date.parse("2026-01-05T06:00:00.000Z");

/** Midnight (Mexico City) of the day containing `now`, as epoch ms. */
export function startOfDayMx(now: Date): number {
  const local = now.getTime() + MX_OFFSET_MS;
  return local - (((local % DAY_MS) + DAY_MS) % DAY_MS) - MX_OFFSET_MS;
}

/** Whole-day shift that moves seed day 0 onto today. */
export function seedShiftMs(now: Date): number {
  const days = Math.round((startOfDayMx(now) - SEED_REFERENCE_MS) / DAY_MS);
  return days * DAY_MS;
}

export function shiftIso(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}
