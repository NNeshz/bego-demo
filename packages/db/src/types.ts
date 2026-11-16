import type { Place, UnitType } from "@retorno/engine";

export interface City {
  id: string;
  name: string;
  state: string;
  country: "MX" | "US";
  lat: number;
  lng: number;
  /** Relative freight volume used by the synthetic generator (not market data). */
  freightWeight: number;
}

export const TRUCK_STATUSES = ["available", "loaded", "empty"] as const;
export type TruckStatus = (typeof TRUCK_STATUSES)[number];

/** A fleet truck as the dispatcher sees it. */
export interface Truck {
  id: string;
  driverName: string;
  plate: string;
  unitType: UnitType;
  base: Place;
  /** Where the truck becomes available next (current unload point). */
  current: Place;
  /** ISO-8601. */
  availableAt: string;
  status: TruckStatus;
}

export const EVENT_ACTIONS = ["shown", "accepted", "rejected"] as const;
export type EventAction = (typeof EVENT_ACTIONS)[number];

/**
 * Feedback signal for the future weights model: what was shown, at which rank,
 * with which features, and what the trucker did with it.
 */
export interface NewRecommendationEvent {
  action: EventAction;
  truckId?: string | undefined;
  /** One id for a single load, two for a chain. */
  loadIds: string[];
  rank: number;
  scorePerHour: number;
  gainVsEmptyMxn: number;
  features: Record<string, number>;
}

export interface RecommendationEvent extends NewRecommendationEvent {
  id: string;
  createdAt: string;
}
