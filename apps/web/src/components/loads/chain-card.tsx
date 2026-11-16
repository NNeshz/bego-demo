import type { Chain } from "@retorno/engine";
import { Clock, Home, Route } from "lucide-react";
import Link from "next/link";
import { CountUp } from "@/components/motion";
import { hours, km, when } from "@/lib/format";
import { Chip } from "./recommendation-card";
import { VersusBars } from "./versus-bars";

export function ChainCard({
  chain,
  href,
  emptyReturnCostMxn,
  scale,
  now,
}: {
  chain: Chain;
  href: string;
  emptyReturnCostMxn: number;
  scale: number;
  now: Date;
}) {
  return (
    <Link
      href={href}
      className="glass flex flex-col gap-4 p-5 transition hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/60"
    >
      <span className="eyebrow">Cadena de 2 cargas</span>

      <ol className="relative flex flex-col gap-3 pl-6">
        <span
          className="absolute top-2 bottom-2 left-[7px] w-px border-l-2 border-dashed border-foreground/25"
          aria-hidden
        />
        {chain.legs.map((leg, i) => (
          <li key={leg.load.id} className="relative flex flex-col">
            <span
              className="absolute top-1.5 -left-6 grid size-4 place-items-center rounded-full bg-brand text-[9px] font-semibold text-brand-foreground"
              aria-hidden
            >
              {i + 1}
            </span>
            <span className="font-medium">
              {leg.load.origin.name} → {leg.load.destination.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {leg.load.commodity} · recoge {when(leg.pickupArrival, now)}
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-0.5">
        <CountUp
          value={chain.gainVsEmptyMxn}
          format="signedMoney"
          className="tabular text-[2rem] leading-none font-medium text-money"
        />
        <span className="text-sm text-muted-foreground">más que regresar vacío</span>
      </div>

      <VersusBars
        emptyResult={-emptyReturnCostMxn}
        loadResult={chain.netProfitMxn - chain.returnHomeCostMxn}
        scale={scale}
      />

      <div className="flex flex-wrap gap-2 text-xs">
        <Chip icon={<Route />}>{km(chain.totalEmptyKm)} vacío en total</Chip>
        <Chip icon={<Home />}>
          {chain.returnHomeKm < 30 ? "Termina en tu base" : `Quedas a ${km(chain.returnHomeKm)}`}
        </Chip>
        <Chip icon={<Clock />}>{hours(chain.totalHours)}</Chip>
      </div>
    </Link>
  );
}
