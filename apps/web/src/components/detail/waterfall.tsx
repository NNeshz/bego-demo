"use client";

import { motion } from "motion/react";
import { money, signedMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface WaterfallInput {
  rateMxn: number;
  deadheadFuelMxn: number;
  loadedFuelMxn: number;
  tollsMxn: number;
  maintenanceMxn: number;
  netProfitMxn: number;
  /** Cost of driving home empty right now (what you avoid). */
  emptyNowCostMxn: number;
  /** Cost of the empty km still left after delivering. */
  returnHomeCostMxn: number;
  gainVsEmptyMxn: number;
}

type Row = {
  label: string;
  delta: number;
  total?: boolean;
  tone: "plus" | "minus" | "total" | "hero";
};

/**
 * Horizontal waterfall: how the rate becomes net profit, and how net profit
 * becomes "more than going home empty". Every number comes from the engine.
 */
export function Waterfall({ data }: { data: WaterfallInput }) {
  const savedReturn = data.emptyNowCostMxn - data.returnHomeCostMxn;
  const rows: Row[] = [
    { label: "Tarifa", delta: data.rateMxn, tone: "plus" },
    { label: "Diésel en vacío", delta: -data.deadheadFuelMxn, tone: "minus" },
    { label: "Diésel cargado", delta: -data.loadedFuelMxn, tone: "minus" },
    { label: "Casetas", delta: -data.tollsMxn, tone: "minus" },
    { label: "Mantenimiento", delta: -data.maintenanceMxn, tone: "minus" },
    { label: "Ganancia neta", delta: data.netProfitMxn, total: true, tone: "total" },
    {
      label: "Vacío que te ahorras",
      delta: savedReturn,
      tone: savedReturn >= 0 ? "plus" : "minus",
    },
    { label: "Más que regresar vacío", delta: data.gainVsEmptyMxn, total: true, tone: "hero" },
  ];

  // Running totals → [start, end] for each bar.
  let running = 0;
  const bars = rows.map((row) => {
    const start = row.total ? 0 : running;
    const end = row.total ? row.delta : running + row.delta;
    running = end;
    return { ...row, start, end };
  });
  const min = Math.min(0, ...bars.flatMap((b) => [b.start, b.end]));
  const max = Math.max(...bars.flatMap((b) => [b.start, b.end]));
  const span = max - min || 1;
  const x = (value: number) => ((value - min) / span) * 100;

  return (
    <div className="flex flex-col gap-2.5" role="table" aria-label="Desglose del dinero">
      {bars.map((bar, i) => {
        const left = x(Math.min(bar.start, bar.end));
        const width = Math.max(0.8, x(Math.max(bar.start, bar.end)) - left);
        return (
          <div
            key={bar.label}
            role="row"
            className={cn("grid grid-cols-[8.5rem_1fr] items-center gap-3", bar.total && "pt-1")}
          >
            <span
              role="cell"
              className={cn(
                "flex flex-col text-xs",
                bar.total ? "font-medium" : "text-muted-foreground",
              )}
            >
              {bar.label}
              <span
                className={cn(
                  "tabular text-sm",
                  bar.tone === "hero"
                    ? "font-semibold text-money"
                    : bar.total
                      ? "text-foreground"
                      : "",
                )}
              >
                {bar.total ? money(bar.delta) : signedMoney(bar.delta)}
              </span>
            </span>
            <div role="cell" className="relative h-5">
              <span
                className="absolute inset-y-0 w-px bg-foreground/20"
                style={{ left: `${x(0)}%` }}
                aria-hidden
              />
              <motion.span
                className={cn(
                  "absolute inset-y-0 rounded-md",
                  bar.tone === "plus" && "bg-loaded/80",
                  bar.tone === "minus" && "bg-deadhead/50",
                  bar.tone === "total" && "bg-foreground/80",
                  bar.tone === "hero" && "bg-brand ring-1 ring-brand-strong",
                )}
                style={{ left: `${left}%` }}
                initial={{ width: 0 }}
                whileInView={{ width: `${width}%` }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
