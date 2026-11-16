import type { Recommendation } from "@retorno/engine";
import { ArrowRight, Clock, Home, Route } from "lucide-react";
import Link from "next/link";
import { CountUp } from "@/components/motion";
import { hours, km, tons, when } from "@/lib/format";
import { cn } from "@/lib/utils";
import { VersusBars } from "./versus-bars";

export function RecommendationCard({
  recommendation: r,
  rank,
  href,
  emptyReturnCostMxn,
  scale,
  now,
}: {
  recommendation: Recommendation;
  rank: number;
  href: string;
  emptyReturnCostMxn: number;
  scale: number;
  now: Date;
}) {
  const best = rank === 1;
  return (
    <Link
      href={href}
      className={cn(
        "glass group flex flex-col gap-4 p-5 transition hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/60",
        best && "ring-2 ring-brand",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold tracking-wider uppercase",
            best ? "bg-brand text-brand-foreground" : "bg-secondary text-muted-foreground",
          )}
        >
          {best ? "Mejor opción" : `Opción ${rank}`}
        </span>
        <span className="text-xs text-muted-foreground">Recoge {when(r.pickupArrival, now)}</span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-lg leading-tight font-medium">
          <span className="truncate">{r.load.origin.name}</span>
          <span
            className="h-px min-w-6 flex-1 bg-gradient-to-r from-foreground/20 to-foreground/60"
            aria-hidden
          />
          <ArrowRight className="-ml-2 size-4 shrink-0 text-foreground/60" aria-hidden />
          <span className="truncate">{r.load.destination.name}</span>
        </div>
        <span className="text-sm text-muted-foreground">
          {r.load.commodity} · {tons(r.load.weightKg)}
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        <CountUp
          value={r.gainVsEmptyMxn}
          format="signedMoney"
          animated={best}
          className="tabular text-[2rem] leading-none font-medium text-money"
        />
        <span className="text-sm text-muted-foreground">más que regresar vacío</span>
      </div>

      <VersusBars
        emptyResult={-emptyReturnCostMxn}
        loadResult={r.breakdown.netProfitMxn - r.returnHomeCostMxn}
        scale={scale}
      />

      <div className="flex flex-wrap gap-2 text-xs">
        <Chip icon={<Route />}>
          {r.deadheadKm < 5 ? "Sale de donde descargas" : `${km(r.deadheadKm)} vacío`}
        </Chip>
        {r.kmCloserToBase > 20 && (
          <Chip icon={<Home />}>
            {r.returnHomeKm < 30 ? "Termina en tu base" : `Te acerca ${km(r.kmCloserToBase)}`}
          </Chip>
        )}
        <Chip icon={<Clock />}>{hours(r.totalHours)}</Chip>
      </div>
    </Link>
  );
}

export function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-2.5 py-1 [&_svg]:size-3.5 [&_svg]:text-muted-foreground">
      {icon}
      {children}
    </span>
  );
}
