import type { Place } from "@retorno/engine";
import type { City } from "./types";

/**
 * Real cities with approximate city-center coordinates.
 * `freightWeight` is a synthetic, relative volume used only to make the
 * generated market look plausible (busy border/industrial hubs, smaller ports).
 */
export const CITIES: readonly City[] = [
  {
    id: "laredo-tx",
    name: "Laredo, TX",
    state: "Texas",
    country: "US",
    lat: 27.5306,
    lng: -99.4803,
    freightWeight: 6,
  },
  {
    id: "nuevo-laredo",
    name: "Nuevo Laredo",
    state: "Tamaulipas",
    country: "MX",
    lat: 27.4779,
    lng: -99.5496,
    freightWeight: 10,
  },
  {
    id: "monterrey",
    name: "Monterrey",
    state: "Nuevo León",
    country: "MX",
    lat: 25.6866,
    lng: -100.3161,
    freightWeight: 10,
  },
  {
    id: "saltillo",
    name: "Saltillo",
    state: "Coahuila",
    country: "MX",
    lat: 25.4232,
    lng: -101.0053,
    freightWeight: 6,
  },
  {
    id: "queretaro",
    name: "Querétaro",
    state: "Querétaro",
    country: "MX",
    lat: 20.5888,
    lng: -100.3899,
    freightWeight: 8,
  },
  {
    id: "cdmx",
    name: "Ciudad de México",
    state: "CDMX",
    country: "MX",
    lat: 19.4326,
    lng: -99.1332,
    freightWeight: 10,
  },
  {
    id: "puebla",
    name: "Puebla",
    state: "Puebla",
    country: "MX",
    lat: 19.0414,
    lng: -98.2063,
    freightWeight: 5,
  },
  {
    id: "tlaxcala",
    name: "Tlaxcala",
    state: "Tlaxcala",
    country: "MX",
    lat: 19.3139,
    lng: -98.2404,
    freightWeight: 2,
  },
  {
    id: "guadalajara",
    name: "Guadalajara",
    state: "Jalisco",
    country: "MX",
    lat: 20.6597,
    lng: -103.3496,
    freightWeight: 8,
  },
  {
    id: "manzanillo",
    name: "Manzanillo",
    state: "Colima",
    country: "MX",
    lat: 19.1138,
    lng: -104.3385,
    freightWeight: 7,
  },
  {
    id: "veracruz",
    name: "Veracruz",
    state: "Veracruz",
    country: "MX",
    lat: 19.1738,
    lng: -96.1342,
    freightWeight: 5,
  },
  {
    id: "lazaro-cardenas",
    name: "Lázaro Cárdenas",
    state: "Michoacán",
    country: "MX",
    lat: 17.9583,
    lng: -102.1944,
    freightWeight: 4,
  },
  {
    id: "san-luis-potosi",
    name: "San Luis Potosí",
    state: "San Luis Potosí",
    country: "MX",
    lat: 22.1565,
    lng: -100.9855,
    freightWeight: 6,
  },
  {
    id: "aguascalientes",
    name: "Aguascalientes",
    state: "Aguascalientes",
    country: "MX",
    lat: 21.8853,
    lng: -102.2916,
    freightWeight: 4,
  },
  {
    id: "leon",
    name: "León",
    state: "Guanajuato",
    country: "MX",
    lat: 21.125,
    lng: -101.686,
    freightWeight: 5,
  },
  {
    id: "celaya",
    name: "Celaya",
    state: "Guanajuato",
    country: "MX",
    lat: 20.5236,
    lng: -100.8157,
    freightWeight: 4,
  },
  {
    id: "toluca",
    name: "Toluca",
    state: "Estado de México",
    country: "MX",
    lat: 19.2826,
    lng: -99.6557,
    freightWeight: 5,
  },
  {
    id: "ciudad-juarez",
    name: "Ciudad Juárez",
    state: "Chihuahua",
    country: "MX",
    lat: 31.6904,
    lng: -106.4245,
    freightWeight: 5,
  },
  {
    id: "hermosillo",
    name: "Hermosillo",
    state: "Sonora",
    country: "MX",
    lat: 29.0729,
    lng: -110.9559,
    freightWeight: 3,
  },
  {
    id: "merida",
    name: "Mérida",
    state: "Yucatán",
    country: "MX",
    lat: 20.9674,
    lng: -89.5926,
    freightWeight: 2,
  },
];

const byId = new Map(CITIES.map((city) => [city.id, city]));

export function getCity(id: string): City {
  const city = byId.get(id);
  if (!city) throw new Error(`Unknown city: ${id}`);
  return city;
}

export function toPlace(city: City): Place {
  return { cityId: city.id, name: city.name, lat: city.lat, lng: city.lng };
}
