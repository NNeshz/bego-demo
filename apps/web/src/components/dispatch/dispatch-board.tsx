"use client";

import { UNIT_LABELS, type Place, type SimulationResult, type UnitType } from "@retorno/engine";
import { FastForward, Layers, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { km, money, signedMoney } from "@/lib/format";
import {
  deliveredBy,
  emptyCorridors,
  frameAt,
  segmentsByTruck,
  seriesAt,
  truckTotalsAt,
  type TruckFrame,
} from "@/lib/sim-playback";
import { cn } from "@/lib/utils";
import { EmptyKmChart } from "./empty-km-chart";
import { FleetMap } from "./fleet-map";

export interface DispatchTruck {
  id: string;
  driverName: string;
  plate: string;
  unitType: UnitType;
  base: Place;
}

type Policy = "empty_return" | "recommended";

const HOUR_MS = 3_600_000;
/** 1× plays one simulated week in ~24 s. */
const SIM_MS_PER_REAL_MS = (168 * HOUR_MS) / 24_000;
/** React state (KPIs, table) updates every 15 simulated minutes; the map animates every frame. */
const UI_STEP_MS = 15 * 60_000;

const clock = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  weekday: "long",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const POLICY_LABEL: Record<Policy, string> = {
  empty_return: "Hoy",
  recommended: "Con Retorno",
};

export function DispatchBoard({
  trucks,
  baseline,
  recommended,
}: {
  trucks: DispatchTruck[];
  baseline: SimulationResult;
  recommended: SimulationResult;
}) {
  const startMs = Math.min(baseline.startMs, recommended.startMs);
  const endMs = Math.max(baseline.series.at(-1)!.atMs, recommended.series.at(-1)!.atMs);

  const [policy, setPolicy] = useState<Policy>("empty_return");
  const [t, setT] = useState(startMs);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [showCorridors, setShowCorridors] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const timeRef = useRef(startMs);

  const runs = useMemo(() => {
    const prepare = (run: SimulationResult) => ({
      run,
      byTruck: segmentsByTruck(run.segments),
      corridors: emptyCorridors(run.segments),
    });
    return { empty_return: prepare(baseline), recommended: prepare(recommended) };
  }, [baseline, recommended]);
  const active = runs[policy];

  // Playback loop: advances the shared clock; quantized updates go to React.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = Math.min(endMs, timeRef.current + (now - last) * SIM_MS_PER_REAL_MS * speed);
      last = now;
      timeRef.current = next;
      setT((current) => (Math.abs(next - current) >= UI_STEP_MS || next >= endMs ? next : current));
      if (next >= endMs) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, endMs]);

  function seek(value: number) {
    timeRef.current = value;
    setT(value);
  }

  function play(fromStart = false) {
    if (fromStart || timeRef.current >= endMs) seek(startMs);
    setPlaying(true);
  }

  const finished = t >= endMs;
  const b = seriesAt(baseline.series, t);
  const r = seriesAt(recommended.series, t);
  const current = policy === "recommended" ? r : b;
  const recovered = r.netMxn - b.netMxn;
  const elapsedDays = Math.min(7, (t - startMs) / (24 * HOUR_MS));

  const rows = trucks.map((truck) => {
    const segments = active.byTruck.get(truck.id) ?? [];
    return { truck, frame: frameAt(segments, t, truck.base), totals: truckTotalsAt(segments, t) };
  });

  return (
    <div className="flex flex-col gap-5">
      {/* Title + policy switch */}
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Vista de despachador · {trucks.length} camiones</span>
          <h1 className="text-[2rem] leading-tight font-light tracking-tight lg:text-[2.4rem]">
            ¿Cuánto rueda vacía tu flota <span className="text-money">esta semana?</span>
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            <strong className="font-medium text-foreground">Hoy:</strong> cada camión busca carga
            solo donde descarga y, si no hay, regresa vacío.{" "}
            <strong className="font-medium text-foreground">Con Retorno:</strong> toma la mejor
            recomendación del motor en cada parada.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Política"
          className="flex shrink-0 rounded-full border bg-card/60 p-1 backdrop-blur"
        >
          {(["empty_return", "recommended"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={policy === p}
              onClick={() => setPolicy(p)}
              className="relative rounded-full px-5 py-2.5 text-sm font-medium"
            >
              {policy === p && (
                <motion.span
                  layoutId="policy-pill"
                  className={cn(
                    "absolute inset-0 rounded-full",
                    p === "recommended" ? "bg-brand" : "bg-foreground",
                  )}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.45 }}
                />
              )}
              <span
                className={cn(
                  "relative",
                  policy === p
                    ? p === "recommended"
                      ? "text-brand-foreground"
                      : "text-background"
                    : "text-muted-foreground",
                )}
              >
                {POLICY_LABEL[p]}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`Km en vacío · ${POLICY_LABEL[policy]}`} highlight={policy === "recommended"}>
          <span className="tabular">{current.emptyKmPct.toFixed(1)}%</span>
          <span className="text-xs text-muted-foreground">
            Hoy {b.emptyKmPct.toFixed(1)}% · Retorno {r.emptyKmPct.toFixed(1)}%
          </span>
        </Kpi>
        <Kpi label="Recuperado por la flota" highlight>
          <span className="tabular text-money">{signedMoney(recovered)}</span>
          <span className="text-xs text-muted-foreground">ganancia neta extra vs. hoy</span>
        </Kpi>
        <Kpi label="Cargas entregadas">
          <span className="tabular">{deliveredBy(active.run.segments, t)}</span>
          <span className="text-xs text-muted-foreground">
            Hoy {deliveredBy(baseline.segments, t)} · Retorno {deliveredBy(recommended.segments, t)}
          </span>
        </Kpi>
        <Kpi label="Km en vacío acumulados">
          <span className="tabular">{km(current.emptyKm)}</span>
          <span className="text-xs text-muted-foreground">
            de {km(current.emptyKm + current.loadedKm)} recorridos
          </span>
        </Kpi>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Map + playback */}
        <section className="flex flex-col gap-3">
          <div className="relative">
            <FleetMap
              data={{ trucks, byTruck: active.byTruck, corridors: active.corridors }}
              timeRef={timeRef}
              showCorridors={showCorridors}
              selectedTruckId={selected}
              className="h-[26rem] lg:h-[34rem]"
            />
            <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-1 rounded-2xl bg-background/85 px-3 py-2 text-xs backdrop-blur">
              <span className="font-medium capitalize">{clock.format(new Date(t))}</span>
              <span className="text-muted-foreground">
                Día {Math.min(7, Math.floor(elapsedDays) + 1)} de 7{finished ? " · cierre" : ""}
              </span>
            </div>
            <div className="pointer-events-none absolute right-3 bottom-8 flex flex-col gap-1 rounded-2xl bg-background/85 px-3 py-2 text-[11px] backdrop-blur">
              <LegendDot className="bg-loaded" label="Cargado" />
              <LegendDot className="bg-deadhead" label="En vacío" />
              <LegendDot className="bg-deadhead/40" label="Esperando / en base" />
              {showCorridors && <LegendLine label="Corredores en vacío (semana)" />}
            </div>
            <AnimatePresence>
              {!playing && t === startMs && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 grid place-items-center rounded-3xl bg-background/30 backdrop-blur-[2px]"
                >
                  <Button variant="brand" size="lg" onClick={() => play(true)}>
                    <Play className="fill-current" /> Simular semana
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="glass flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="icon"
                variant={playing ? "outline" : "primary"}
                aria-label={playing ? "Pausar" : "Reproducir"}
                onClick={() => (playing ? setPlaying(false) : play())}
              >
                {playing ? <Pause /> : <Play className="fill-current" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Reiniciar"
                onClick={() => {
                  setPlaying(false);
                  seek(startMs);
                }}
              >
                <RotateCcw />
              </Button>
              <Button
                size="sm"
                variant="soft"
                aria-label={`Velocidad ${speed}×`}
                onClick={() => setSpeed((s) => (s === 4 ? 1 : ((s * 2) as 2 | 4)))}
              >
                <FastForward /> {speed}×
              </Button>
              <Button
                size="sm"
                variant={showCorridors ? "soft" : "ghost"}
                aria-pressed={showCorridors}
                onClick={() => setShowCorridors((v) => !v)}
              >
                <Layers /> Corredores en vacío
              </Button>
            </div>
            <input
              type="range"
              aria-label="Momento de la semana"
              min={startMs}
              max={endMs}
              step={UI_STEP_MS}
              value={t}
              onChange={(event) => {
                setPlaying(false);
                seek(Number(event.target.value));
              }}
              className="w-full accent-[var(--brand-strong)]"
            />
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>% de km en vacío a lo largo de la semana</span>
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 border-t-2 border-dashed border-deadhead" /> Hoy
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 border-t-[3px] border-brand-strong dark:border-brand" />{" "}
                    Con Retorno
                  </span>
                </span>
              </div>
              <EmptyKmChart
                baseline={baseline.series}
                recommended={recommended.series}
                startMs={startMs}
                endMs={endMs}
                t={t}
              />
            </div>
          </div>

          <AnimatePresence>
            {finished && (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass flex flex-col gap-4 p-5 ring-2 ring-brand"
              >
                <span className="eyebrow">Resultado de la semana</span>
                <p className="text-2xl leading-snug font-light">
                  De <span className="font-medium">{baseline.totals.emptyKmPct.toFixed(1)}%</span> a{" "}
                  <span className="font-medium text-money">
                    {recommended.totals.emptyKmPct.toFixed(1)}%
                  </span>{" "}
                  de km en vacío y{" "}
                  <span className="font-medium text-money">
                    {signedMoney(recommended.totals.netMxn - baseline.totals.netMxn)}
                  </span>{" "}
                  de ganancia neta para {trucks.length} camiones.
                </p>
                <p className="text-sm text-muted-foreground">
                  {baseline.totals.loadsDelivered} → {recommended.totals.loadsDelivered} cargas
                  entregadas · ganancia neta {money(baseline.totals.netMxn)} →{" "}
                  {money(recommended.totals.netMxn)}
                </p>
                {policy === "empty_return" && (
                  <Button
                    variant="brand"
                    className="w-fit"
                    onClick={() => {
                      setPolicy("recommended");
                      play(true);
                    }}
                  >
                    <Sparkles /> Ver la semana con Retorno
                  </Button>
                )}
              </motion.section>
            )}
          </AnimatePresence>
        </section>

        {/* Fleet table */}
        <section className="glass flex max-h-[52rem] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="eyebrow">Flota · {POLICY_LABEL[policy]}</h2>
            <span className="text-xs text-muted-foreground">Toca uno para ubicarlo</span>
          </div>
          <ul className="flex-1 divide-y overflow-y-auto">
            {rows.map(({ truck, frame, totals }) => (
              <li key={truck.id}>
                <button
                  type="button"
                  onClick={() => setSelected((s) => (s === truck.id ? null : truck.id))}
                  aria-pressed={selected === truck.id}
                  className={cn(
                    "grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-accent/60",
                    selected === truck.id && "bg-brand/15",
                  )}
                >
                  <StatusDot kind={frame.kind} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">
                      {truck.id} · {truck.driverName}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {statusText(frame, truck.base)}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground/80">
                      {UNIT_LABELS[truck.unitType]} · base {truck.base.name}
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span
                      className={cn(
                        "tabular text-sm font-medium",
                        totals.netMxn >= 0 ? "text-money" : "text-destructive",
                      )}
                    >
                      {signedMoney(totals.netMxn)}
                    </span>
                    <span className="tabular text-[11px] text-muted-foreground">
                      {km(totals.emptyKm)} vacío
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <p className="text-xs text-muted-foreground">
        Simulación sintética sobre datos generados: ilustra el método, no son resultados reales de
        mercado. Mismo mercado y misma flota en ambas políticas; al cierre, todos los camiones
        regresan a su base y ese viaje cuenta.
      </p>
    </div>
  );
}

function statusText(frame: TruckFrame, base: Place): string {
  switch (frame.kind) {
    case "loaded":
      return `Cargado → ${frame.place.name}`;
    case "empty":
      return frame.segment?.loadId
        ? `Vacío → recoger en ${frame.place.name}`
        : `Vacío → regresa a ${frame.place.name}`;
    case "idle":
      return frame.segment?.loadId
        ? `Esperando carga en ${frame.place.name}`
        : `Parado en ${frame.place.name}`;
    case "base":
      return `En base (${base.name})`;
  }
}

function StatusDot({ kind }: { kind: TruckFrame["kind"] }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-3 rounded-full ring-2 ring-background",
        kind === "loaded" && "bg-loaded",
        kind === "empty" && "bg-deadhead",
        (kind === "idle" || kind === "base") && "bg-deadhead/35",
      )}
    />
  );
}

function Kpi({
  label,
  children,
  highlight = false,
}: {
  label: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={cn("glass flex flex-col gap-1 p-4", highlight && "ring-1 ring-brand/70")}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-col gap-0.5 text-[1.7rem] leading-tight font-medium">
        {children}
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={cn("size-2.5 rounded-full", className)} />
      {label}
    </span>
  );
}

function LegendLine({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-4 rounded-full bg-[#f0702a]/60" />
      {label}
    </span>
  );
}
