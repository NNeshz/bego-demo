import { DEFAULT_COST_CONFIG, roadKm, type Load, type UnitType } from "@retorno/engine";
import { CITIES, toPlace } from "./cities";
import { createRng, type Rng } from "./random";
import { SEED_REFERENCE_MS } from "./time";
import type { City, Truck, TruckStatus } from "./types";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export const DEFAULT_SEED = 20_261_116;

export interface SeedOptions {
  seed?: number;
  loadCount?: number;
  truckCount?: number;
  /** Days of market to generate starting at the reference date. */
  days?: number;
}

export interface SeedData {
  cities: City[];
  loads: Load[];
  trucks: Truck[];
}

/** Share of the market per unit type (synthetic). */
const UNIT_MIX: ReadonlyArray<[UnitType, number]> = [
  ["dry_van_53", 55],
  ["reefer_53", 15],
  ["flatbed_48", 10],
  ["full_double", 12],
  ["torton", 8],
];

/**
 * ASSUMED base rate per loaded road km (MXN). Tuned so typical loads leave a
 * plausible margin over the default cost model; not market data.
 */
const RATE_PER_KM: Record<UnitType, number> = {
  dry_van_53: 34,
  reefer_53: 41,
  flatbed_48: 37,
  full_double: 43,
  torton: 26,
};
const MIN_RATE_MXN = 7_000;

const WEIGHT_RANGE_KG: Record<UnitType, [number, number]> = {
  dry_van_53: [8_000, 28_000],
  reefer_53: [10_000, 26_000],
  flatbed_48: [12_000, 30_000],
  full_double: [35_000, 60_000],
  torton: [4_000, 12_000],
};

const COMMODITIES: Record<UnitType, readonly string[]> = {
  dry_van_53: [
    "autopartes",
    "electrodomésticos",
    "abarrotes",
    "papel y cartón",
    "textiles",
    "electrónicos",
  ],
  reefer_53: ["aguacate", "berries", "lácteos", "carne de res", "jitomate", "pollo congelado"],
  flatbed_48: ["varilla", "lámina de acero", "maquinaria", "tubería", "perfil estructural"],
  full_double: ["cemento", "granos", "cerveza", "fertilizante", "harina"],
  torton: ["paquetería", "bebidas", "material de construcción", "muebles"],
};

/** Fictitious shippers. Any resemblance to real companies is unintended. */
const SHIPPERS = [
  "Maquiladora del Norte",
  "Agroexportadora del Bajío",
  "Aceros Regiomontanos",
  "Distribuidora Altiplano",
  "Logística Pacífico",
  "Empaques Industriales del Centro",
  "Frutas Finas de Occidente",
  "Grupo Ferretero Peninsular",
  "Cementos del Golfo",
  "Autopartes Saltillo",
  "Bebidas del Valle",
  "Comercializadora Fronteriza",
];

const FIRST_NAMES = [
  "Juan",
  "José Luis",
  "Miguel",
  "Francisco",
  "Jesús",
  "Alejandro",
  "Roberto",
  "Ricardo",
  "Fernando",
  "Arturo",
  "Héctor",
  "Raúl",
  "Sergio",
  "Martín",
  "Rosa",
  "Guadalupe",
];
const LAST_NAMES = [
  "Hernández",
  "García",
  "Martínez",
  "López",
  "González",
  "Pérez",
  "Rodríguez",
  "Sánchez",
  "Ramírez",
  "Torres",
  "Flores",
  "Rivera",
  "Gómez",
  "Díaz",
  "Cruz",
  "Morales",
];

/** Cities where owner-operators typically keep their base. */
const BASE_CITIES = [
  "queretaro",
  "monterrey",
  "cdmx",
  "guadalajara",
  "san-luis-potosi",
  "saltillo",
  "leon",
  "celaya",
  "puebla",
  "toluca",
  "aguascalientes",
  "nuevo-laredo",
];

const MIN_LANE_KM = 120;
const MAX_LANE_KM = 1_600;

export function generateSeed(options: SeedOptions = {}): SeedData {
  const rng = createRng(options.seed ?? DEFAULT_SEED);
  const days = options.days ?? 8;
  const loads = Array.from({ length: options.loadCount ?? 320 }, (_, i) =>
    generateLoad(rng, i, days),
  ).sort((a, b) => a.pickupStart.localeCompare(b.pickupStart) || a.id.localeCompare(b.id));
  const trucks = Array.from({ length: options.truckCount ?? 25 }, (_, i) => generateTruck(rng, i));
  return { cities: [...CITIES], loads, trucks };
}

function generateLoad(rng: Rng, index: number, days: number): Load {
  const origin = rng.weighted(CITIES, (c) => c.freightWeight);
  const destination = pickDestination(rng, origin);
  const unitType = rng.weighted(UNIT_MIX, ([, w]) => w)[0];

  const km = roadKm(origin, destination, DEFAULT_COST_CONFIG.roadFactor);
  const rateMxn = Math.max(
    MIN_RATE_MXN,
    roundTo(km * RATE_PER_KM[unitType] * rng.float(0.85, 1.15), 100),
  );

  // Pickups open between 06:00 and 20:00 Mexico City time.
  const day = rng.int(0, days - 1);
  const openHourLocal = rng.int(6, 20);
  const pickupStartMs = SEED_REFERENCE_MS + day * DAY_MS + openHourLocal * HOUR_MS;
  const windowHours = rng.weighted([2, 4, 6, 8, 12, 24], (h) => (h <= 8 ? 3 : 1));
  const [minKg, maxKg] = WEIGHT_RANGE_KG[unitType];

  return {
    id: `CRG-${String(index + 1).padStart(4, "0")}`,
    origin: toPlace(origin),
    destination: toPlace(destination),
    unitType,
    pickupStart: new Date(pickupStartMs).toISOString(),
    pickupEnd: new Date(pickupStartMs + windowHours * HOUR_MS).toISOString(),
    weightKg: roundTo(rng.int(minKg, maxKg), 500),
    rateMxn,
    shipper: rng.pick(SHIPPERS),
    commodity: rng.pick(COMMODITIES[unitType]),
  };
}

function pickDestination(rng: Rng, origin: City): City {
  const candidates = CITIES.filter((city) => {
    if (city.id === origin.id) return false;
    const km = roadKm(origin, city, DEFAULT_COST_CONFIG.roadFactor);
    return km >= MIN_LANE_KM && km <= MAX_LANE_KM;
  });
  return rng.weighted(candidates, (c) => c.freightWeight);
}

function generateTruck(rng: Rng, index: number): Truck {
  const baseId = BASE_CITIES[index % BASE_CITIES.length]!;
  const base = CITIES.find((c) => c.id === baseId)!;
  const current = rng.weighted(
    CITIES.filter((c) => c.id !== base.id),
    (c) => c.freightWeight,
  );
  const unitType = rng.weighted(UNIT_MIX, ([, w]) => w)[0];
  const status: TruckStatus = rng.pick(["available", "loaded", "empty"] as const);
  const availableInHours = status === "available" ? 0 : rng.int(2, 36);

  return {
    id: `U-${String(index + 1).padStart(3, "0")}`,
    driverName: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
    plate: `${rng.int(10, 99)}-${letters(rng, 2)}-${rng.int(1, 9)}${letters(rng, 1)}`,
    unitType,
    base: toPlace(base),
    current: toPlace(current),
    availableAt: new Date(
      SEED_REFERENCE_MS + 8 * HOUR_MS + availableInHours * HOUR_MS,
    ).toISOString(),
    status,
  };
}

function letters(rng: Rng, count: number): string {
  const alphabet = "ABCDEFGHJKLMNPRSTUVWXYZ";
  return Array.from({ length: count }, () => alphabet[rng.int(0, alphabet.length - 1)]).join("");
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}
