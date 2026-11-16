import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { km, money, signedMoney } from "@/lib/format";
import { tripQuery } from "@/lib/trip-params";
import type { UnitType } from "@retorno/engine";

interface TripData {
  position: string;
  base: string;
  unit_type: UnitType;
  available_at: string | null;
}

const query = (trip: TripData) =>
  tripQuery({
    unloadCityId: trip.position,
    baseCityId: trip.base,
    unitType: trip.unit_type,
    unloadAt: trip.available_at ?? new Date().toISOString(),
  });

/** Renders a tool's structured output as UI. Unknown shapes fall back to nothing (the model's text covers them). */
export function ToolResult({ name, data }: { name: string; data: unknown }) {
  const d = data as Record<string, unknown>;

  if (name === "find_return_loads") {
    const recs = d.recommendations as Array<{
      rank: number;
      load_id: string;
      route: string;
      commodity: string;
      gain_vs_empty_mxn: number;
      deadhead_km: number;
      km_from_base_after: number;
    }>;
    const trip = d.trip as TripData;
    if (recs.length === 0) return null;
    return (
      <div className="flex flex-col gap-2">
        {recs.map((r) => (
          <Link
            key={r.load_id}
            href={`/cargas/${r.load_id}?${query(trip)}&rank=${r.rank}`}
            className="group flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 transition hover:border-foreground/40"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold text-brand-foreground">
              {r.rank}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{r.route}</span>
              <span className="truncate text-xs text-muted-foreground">
                {r.commodity} ·{" "}
                {r.deadhead_km < 5 ? "sale de donde descargas" : `${km(r.deadhead_km)} vacío`} ·{" "}
                {r.km_from_base_after < 30
                  ? "termina en tu base"
                  : `queda a ${km(r.km_from_base_after)}`}
              </span>
            </span>
            <span className="tabular shrink-0 text-sm font-semibold text-money">
              {signedMoney(r.gain_vs_empty_mxn)}
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    );
  }

  if (name === "plan_load_chain") {
    const chains = d.chains as Array<{
      rank: number;
      load_ids: string[];
      legs: string[];
      gain_vs_empty_mxn: number;
      km_from_base_after: number;
    }>;
    const trip = d.trip as TripData;
    return (
      <div className="flex flex-col gap-2">
        {chains.map((c) => (
          <Link
            key={c.load_ids.join("-")}
            href={`/cadenas/${c.load_ids[0]}/${c.load_ids[1]}?${query(trip)}&rank=${c.rank}`}
            className="flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 transition hover:border-foreground/40"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{c.legs.join("  ·  ")}</span>
              <span className="text-xs text-muted-foreground">
                {c.km_from_base_after < 30
                  ? "Termina en tu base"
                  : `Quedas a ${km(c.km_from_base_after)} de tu base`}
              </span>
            </span>
            <span className="tabular shrink-0 text-sm font-semibold text-money">
              {signedMoney(c.gain_vs_empty_mxn)}
            </span>
          </Link>
        ))}
      </div>
    );
  }

  if (name === "explain_recommendation" && typeof d.explanation === "string") {
    return (
      <blockquote className="flex gap-2 rounded-2xl bg-brand/15 px-3.5 py-3 text-sm leading-relaxed">
        <Sparkles className="mt-0.5 size-4 shrink-0" />
        {d.explanation}
      </blockquote>
    );
  }

  if (name === "get_fleet_empty_km") {
    const today = d.today as { empty_km_pct: number };
    const withRetorno = d.with_retorno as { empty_km_pct: number };
    return (
      <Link
        href="/despacho"
        className="grid grid-cols-3 gap-2 rounded-2xl border bg-card p-3 text-center transition hover:border-foreground/40"
      >
        <Stat label="Km vacío hoy" value={`${today.empty_km_pct}%`} />
        <Stat label="Con Retorno" value={`${withRetorno.empty_km_pct}%`} highlight />
        <Stat label="Ganancia extra" value={money(d.extra_net_mxn as number)} highlight />
      </Link>
    );
  }

  return null;
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <span className="flex flex-col">
      <span className={`tabular text-lg font-semibold ${highlight ? "text-money" : ""}`}>
        {value}
      </span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </span>
  );
}
