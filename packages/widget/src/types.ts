/** The subset of the public API v1 the widget consumes (see /api/v1/openapi.json). */
import type { UnitType } from "@retorno/engine";

export type { UnitType };

export interface ApiPlace {
  cityId: string;
  name: string;
  lat: number;
  lng: number;
}

export interface ApiRecommendation {
  load: {
    id: string;
    origin: ApiPlace;
    destination: ApiPlace;
    unitType: UnitType;
    weightKg: number;
    rateMxn: number;
    commodity: string;
    shipper: string;
  };
  deadheadKm: number;
  loadedKm: number;
  pickupArrival: string;
  totalHours: number;
  returnHomeKm: number;
  kmCloserToBase: number;
  gainVsEmptyMxn: number;
  scorePerHour: number;
  breakdown: { netProfitMxn: number; rateMxn: number };
  explanation?: { text: string; source: "ai" | "template" };
}

export interface ApiRecommendationsResponse {
  recommendations: ApiRecommendation[];
  emptyReturn: { km: number; hours: number; costMxn: number };
  stats: { evaluated: number; feasible: number };
}

export interface ApiCity {
  id: string;
  name: string;
}

export interface TripInput {
  position: string;
  base: string;
  unitType: UnitType;
  availableAt?: string | undefined;
}

/** Event payloads (CustomEvent.detail). */
export interface AcceptDetail {
  recommendation: ApiRecommendation;
  rank: number;
  trip: TripInput;
}
export type RejectDetail = AcceptDetail;
export interface LoadDetail {
  count: number;
  trip: TripInput;
}
export interface ErrorDetail {
  message: string;
  status?: number;
}
