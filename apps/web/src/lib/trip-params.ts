/**
 * The trip lives in the URL (?desde=…&hora=…&unidad=…&base=…) so every screen is
 * shareable, refresh-safe and works with the browser's back button.
 */
import { CITIES } from "@retorno/db/cities";
import { UNIT_TYPES, type UnitType } from "@retorno/engine";
import { z } from "zod";

const cityIds = CITIES.map((c) => c.id) as [string, ...string[]];

export const TripParamsSchema = z.object({
  desde: z.enum(cityIds),
  hora: z.iso.datetime({ offset: true }),
  unidad: z.enum(UNIT_TYPES),
  base: z.enum(cityIds),
});

export interface Trip {
  unloadCityId: string;
  unloadAt: string;
  unitType: UnitType;
  baseCityId: string;
}

type RawParams = Record<string, string | string[] | undefined>;

export function parseTripParams(params: RawParams): Trip | null {
  const flat = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  const parsed = TripParamsSchema.safeParse(flat);
  if (!parsed.success) return null;
  return {
    unloadCityId: parsed.data.desde,
    unloadAt: parsed.data.hora,
    unitType: parsed.data.unidad,
    baseCityId: parsed.data.base,
  };
}

export function tripQuery(trip: Trip): string {
  return new URLSearchParams({
    desde: trip.unloadCityId,
    hora: trip.unloadAt,
    unidad: trip.unitType,
    base: trip.baseCityId,
  }).toString();
}

export function tripToTruckInput(trip: Trip) {
  return {
    unitType: trip.unitType,
    position: { cityId: trip.unloadCityId },
    base: { cityId: trip.baseCityId },
    availableAt: trip.unloadAt,
  };
}
