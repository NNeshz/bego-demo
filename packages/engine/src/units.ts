import type { UnitType } from "./types";

/** Spanish labels in trucker language, for UI and AI prompts. */
export const UNIT_LABELS: Record<UnitType, string> = {
  dry_van_53: "Caja seca 53'",
  reefer_53: "Caja refrigerada 53'",
  flatbed_48: "Plataforma 48'",
  full_double: "Full (doble remolque)",
  torton: "Torton",
};

/**
 * Which load unit types each truck unit can haul.
 * A reefer can carry dry freight (refrigeration off); the reverse is not true.
 */
export const COMPATIBLE_LOADS: Record<UnitType, readonly UnitType[]> = {
  dry_van_53: ["dry_van_53"],
  reefer_53: ["reefer_53", "dry_van_53"],
  flatbed_48: ["flatbed_48"],
  full_double: ["full_double"],
  torton: ["torton"],
};

export function canHaul(truckUnit: UnitType, loadUnit: UnitType): boolean {
  return COMPATIBLE_LOADS[truckUnit].includes(loadUnit);
}
