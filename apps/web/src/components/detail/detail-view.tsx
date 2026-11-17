import type { ExplainInput } from "@retorno/ai";
import {
  UNIT_LABELS,
  type EmptyReturn,
  type Recommendation,
  type TruckState,
} from "@retorno/engine";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CountUp } from "@/components/motion";
import { hours, km, money, tons, when } from "@/lib/format";
import { whatsappLink } from "@/lib/whatsapp";
import { AcceptActions } from "./accept-actions";
import { Explanation, ExplanationSkeleton } from "./explanation";
import { Facts, Section } from "./facts";
import { RouteMap, type MapSegment, type MapStop } from "./route-map";
import { Waterfall } from "./waterfall";

export interface DetailTotals {
  netProfitMxn: number;
  gainVsEmptyMxn: number;
  returnHomeKm: number;
  returnHomeCostMxn: number;
  totalHours: number;
  totalEmptyKm: number;
  totalLoadedKm: number;
  scorePerHour: number;
}

/** Shared by single loads (1 leg) and chains (2 legs). */
export function DetailView({
  truck,
  legs,
  totals,
  emptyReturn,
  explainInput,
  rank,
  backHref,
  now,
  features,
  decisionId,
}: {
  truck: TruckState;
  legs: Recommendation[];
  totals: DetailTotals;
  emptyReturn: EmptyReturn;
  explainInput: ExplainInput;
  rank: number;
  backHref: string;
  now: Date;
  /** Model features of this option (choiceFeatures / chainChoiceFeatures from the engine). */
  features: Record<string, number>;
  decisionId?: string | undefined;
}) {
  const sum = (pick: (r: Recommendation) => number) =>
    legs.reduce((total, leg) => total + pick(leg), 0);
  const last = legs[legs.length - 1]!;

  // Markers: where you unload, each pickup that requires driving (> 5 km), each delivery, and home.
  // Short labels on the map; the legend under it explains the glyphs.
  const stops: MapStop[] = [{ kind: "truck", point: truck.position, label: truck.position.name }];
  for (const leg of legs) {
    if (leg.deadheadKm > 5)
      stops.push({ kind: "pickup", point: leg.load.origin, label: leg.load.origin.name });
    stops.push({ kind: "delivery", point: leg.load.destination, label: leg.load.destination.name });
  }
  if (last.returnHomeKm > 5)
    stops.push({ kind: "base", point: truck.base, label: truck.base.name });

  let cursor = truck.position as MapSegment["from"];
  const segments: MapSegment[] = [];
  for (const leg of legs) {
    if (leg.deadheadKm > 0.5) segments.push({ kind: "empty", from: cursor, to: leg.load.origin });
    segments.push({ kind: "loaded", from: leg.load.origin, to: leg.load.destination });
    cursor = leg.load.destination;
  }
  if (last.returnHomeKm > 0.5) segments.push({ kind: "home", from: cursor, to: truck.base });

  const isChain = legs.length > 1;

  return (
    <>
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Todas las opciones
      </Link>

      <header className="flex flex-col gap-2">
        <span className="eyebrow">
          {isChain ? "Cadena de 2 cargas" : `Opción ${rank} · ${legs[0]!.load.id}`}
        </span>
        <h1 className="text-[1.7rem] leading-tight font-light tracking-tight">
          {legs
            .map((leg) => leg.load.origin.name)
            .concat(last.load.destination.name)
            .join(" → ")}
        </h1>
        <div className="flex items-end gap-3">
          <CountUp
            value={totals.gainVsEmptyMxn}
            format="signedMoney"
            animated
            className="tabular text-[2.6rem] leading-none font-medium text-money"
          />
          <span className="pb-1 text-sm text-muted-foreground">más que regresar vacío</span>
        </div>
      </header>

      <RouteMap stops={stops} segments={segments} className="h-72 sm:h-80" />

      <Suspense fallback={<ExplanationSkeleton />}>
        <Explanation input={explainInput} />
      </Suspense>

      <Section title="De dónde sale el dinero">
        <div className="glass p-4">
          <Waterfall
            data={{
              rateMxn: sum((l) => l.breakdown.rateMxn),
              deadheadFuelMxn: sum((l) => l.breakdown.deadheadFuelMxn),
              loadedFuelMxn: sum((l) => l.breakdown.loadedFuelMxn),
              tollsMxn: sum((l) => l.breakdown.tollsMxn),
              maintenanceMxn: sum((l) => l.breakdown.maintenanceMxn),
              netProfitMxn: totals.netProfitMxn,
              emptyNowCostMxn: emptyReturn.costMxn,
              returnHomeCostMxn: totals.returnHomeCostMxn,
              gainVsEmptyMxn: totals.gainVsEmptyMxn,
            }}
          />
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Supuestos: diésel $26/L, 2.4 km/L cargado y 3.0 vacío, casetas $4.5/km, mantenimiento
            $2/km, distancia en línea recta × 1.25. Todo es configurable en la API.
          </p>
        </div>
      </Section>

      {legs.map((leg, i) => (
        <Section key={leg.load.id} title={isChain ? `Carga ${i + 1} · ${leg.load.id}` : "La carga"}>
          <Facts
            items={[
              {
                label: "Recoges",
                value: `${when(leg.pickupArrival, now)}${leg.waitHours >= 0.5 ? ` (+${hours(leg.waitHours)} espera)` : ""}`,
              },
              { label: "Entregas", value: when(leg.deliveredAt, now) },
              { label: "Km en vacío", value: km(leg.deadheadKm) },
              { label: "Km cargado", value: km(leg.loadedKm) },
              { label: "Mercancía", value: `${leg.load.commodity} · ${tons(leg.load.weightKg)}` },
              { label: "Tarifa", value: money(leg.load.rateMxn) },
              { label: "Embarcador", value: leg.load.shipper },
              { label: "Unidad", value: UNIT_LABELS[leg.load.unitType] },
            ]}
          />
        </Section>
      ))}

      <Section title="Al terminar">
        <Facts
          items={[
            {
              label: "Quedas a",
              value:
                totals.returnHomeKm < 5
                  ? "En tu base"
                  : `${km(totals.returnHomeKm)} de ${truck.base.name}`,
            },
            { label: "Tiempo total", value: hours(totals.totalHours) },
            { label: "Ganancia neta", value: money(totals.netProfitMxn) },
            { label: "Regresar vacío hoy", value: `−${money(emptyReturn.costMxn)}` },
          ]}
        />
      </Section>

      <AcceptActions
        backHref={backHref}
        whatsappHref={whatsappLink(
          legs.map((l) => l.load),
          truck.unitType,
          legs.map((l) => l.pickupArrival),
        )}
        payload={{
          loadIds: legs.map((l) => l.load.id),
          rank,
          scorePerHour: totals.scorePerHour,
          gainVsEmptyMxn: totals.gainVsEmptyMxn,
          features: {
            ...features,
            loaded_km: totals.totalLoadedKm,
            rate_mxn: sum((l) => l.breakdown.rateMxn),
          },
          decisionId,
          policy: "engine",
          source: "app",
          ...(truck.truckId ? { truckId: truck.truckId } : {}),
        }}
      />
    </>
  );
}
