import type { Load, Place, TruckState, UnitType } from "../types";

export const places = {
  laredo: { cityId: "nuevo-laredo", name: "Nuevo Laredo", lat: 27.4779, lng: -99.5496 },
  monterrey: { cityId: "monterrey", name: "Monterrey", lat: 25.6866, lng: -100.3161 },
  saltillo: { cityId: "saltillo", name: "Saltillo", lat: 25.4232, lng: -101.0053 },
  slp: { cityId: "san-luis-potosi", name: "San Luis Potosí", lat: 22.1565, lng: -100.9855 },
  queretaro: { cityId: "queretaro", name: "Querétaro", lat: 20.5888, lng: -100.3899 },
  cdmx: { cityId: "cdmx", name: "Ciudad de México", lat: 19.4326, lng: -99.1332 },
  guadalajara: { cityId: "guadalajara", name: "Guadalajara", lat: 20.6597, lng: -103.3496 },
  hermosillo: { cityId: "hermosillo", name: "Hermosillo", lat: 29.0729, lng: -110.9559 },
} satisfies Record<string, Place>;

export const T0 = "2026-11-16T16:00:00.000Z"; // 10:00 in Mexico City

export function hoursAfter(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 3_600_000).toISOString();
}

let counter = 0;
export function makeLoad(overrides: Partial<Load> & Pick<Load, "origin" | "destination">): Load {
  counter++;
  return {
    id: `L-${String(counter).padStart(4, "0")}`,
    unitType: "dry_van_53",
    pickupStart: T0,
    pickupEnd: hoursAfter(T0, 24),
    weightKg: 20_000,
    rateMxn: 30_000,
    shipper: "Test Shipper",
    commodity: "autopartes",
    ...overrides,
  };
}

export function makeTruck(overrides: Partial<TruckState> = {}): TruckState {
  return {
    truckId: "T-001",
    unitType: "dry_van_53" as UnitType,
    position: places.laredo,
    availableAt: T0,
    base: places.queretaro,
    ...overrides,
  };
}
