import { ArrowRight, Clock, Route } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { hours, km, money, signedMoney } from "@/lib/format";
import { tripQuery, tripToTruckInput, type Trip } from "@/lib/trip-params";
import { getContext } from "@/server/context";
import { getRecommendations } from "@/server/services";

/** Tomorrow 10:00 in Mexico City (no DST since 2022: always UTC−6). */
function tomorrowAtTen(now: Date): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(
    new Date(now.getTime() + 24 * 3_600_000),
  );
  return `${day}T10:00:00-06:00`;
}

/**
 * "What you get", shown next to the form on wide screens: the engine's real answer for the
 * first example trip. Computed per request (the market is rebased to today).
 */
export async function SampleResult() {
  await connection();
  const ctx = getContext();
  const trip: Trip = {
    unloadCityId: "nuevo-laredo",
    unloadAt: tomorrowAtTen(ctx.now()),
    unitType: "dry_van_53",
    baseCityId: "queretaro",
  };
  const result = await getRecommendations(ctx, {
    truck: tripToTruckInput(trip),
    limit: 1,
    explain: false,
  }).catch(() => null);
  const best = result?.recommendations[0];
  if (!result || !best) return null;

  return (
    <Link
      href={`/cargas?${tripQuery(trip)}`}
      className="glass group flex flex-col gap-4 p-5 transition hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/60"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">Ejemplo real del motor</span>
        <span className="rounded-full bg-brand px-2.5 py-1 text-[0.7rem] font-semibold tracking-wider text-brand-foreground uppercase">
          Mejor opción
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Descargas en Nuevo Laredo mañana a las 10:00 con caja seca; tu base es Querétaro.
      </p>
      <div className="flex items-center gap-2 text-lg leading-tight font-medium">
        <span className="truncate">{best.load.origin.name}</span>
        <ArrowRight className="size-4 shrink-0 text-foreground/60" aria-hidden />
        <span className="truncate">{best.load.destination.name}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">Le ganas a regresar vacío</span>
        <span className="tabular text-[2rem] leading-none font-medium text-money">
          {signedMoney(best.gainVsEmptyMxn)}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-3 border-t pt-4 text-xs">
        <Fact label="Ganancia neta" value={money(best.breakdown.netProfitMxn)} />
        <Fact
          label="Km en vacío"
          value={km(best.deadheadKm)}
          icon={<Route className="size-3" aria-hidden />}
        />
        <Fact
          label="Tiempo total"
          value={hours(best.totalHours)}
          icon={<Clock className="size-3" aria-hidden />}
        />
      </dl>
      <span className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 group-hover:underline">
        Ver las mejores opciones de este viaje <ArrowRight className="size-3.5" aria-hidden />
      </span>
    </Link>
  );
}

function Fact({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="flex items-center gap-1 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="tabular text-sm font-medium">{value}</dd>
    </div>
  );
}
