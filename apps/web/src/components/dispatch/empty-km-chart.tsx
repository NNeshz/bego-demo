import type { SimSeriesPoint } from "@retorno/engine";
import { seriesAt } from "@/lib/sim-playback";

const W = 600;
const H = 120;
const PAD_RIGHT = 54; // room for end-of-line value labels
/** The first day is noise (few km driven); plot from hour 24, when the fleet is in steady state. */
const WARMUP_HOURS = 24;

/** % of empty km over the week, both policies, with a cursor at the current time. Axis labels make the scale explicit. */
export function EmptyKmChart({
  baseline,
  recommended,
  startMs,
  endMs,
  t,
}: {
  baseline: SimSeriesPoint[];
  recommended: SimSeriesPoint[];
  startMs: number;
  endMs: number;
  t: number;
}) {
  const steady = [...baseline, ...recommended]
    .filter((p) => p.hour >= WARMUP_HOURS)
    .map((p) => p.emptyKmPct);
  const lo = Math.max(0, Math.floor((Math.min(...steady) - 3) / 10) * 10);
  const hi = Math.ceil((Math.max(...steady) + 3) / 10) * 10;
  const ticks = Array.from({ length: (hi - lo) / 10 + 1 }, (_, i) => lo + i * 10);
  const plotW = W - PAD_RIGHT;
  const x0 = startMs + WARMUP_HOURS * 3_600_000;
  const x = (ms: number) => ((ms - x0) / (endMs - x0 || 1)) * plotW;
  const y = (pct: number) => H - ((pct - lo) / (hi - lo || 1)) * (H - 10) - 5;
  const path = (series: SimSeriesPoint[]) =>
    series
      .filter((p) => p.hour >= WARMUP_HOURS && p.atMs <= t)
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.atMs).toFixed(1)},${y(p.emptyKmPct).toFixed(1)}`)
      .join(" ");

  const started = t > x0;
  const b = seriesAt(baseline, t).emptyKmPct;
  const r = seriesAt(recommended, t).emptyKmPct;
  // Near the right edge the value tags sit over the axis labels: hide the labels they'd cover.
  const tagsAtEdge = started && x(Math.min(t, endMs)) > plotW * 0.85;
  const covered = (pct: number) => tagsAtEdge && (Math.abs(pct - b) < 4 || Math.abs(pct - r) < 4);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-32 w-full overflow-visible"
        aria-hidden
      >
        {ticks.map((pct) => (
          <line
            key={pct}
            x1={0}
            x2={plotW}
            y1={y(pct)}
            y2={y(pct)}
            className="stroke-foreground/10"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path
          d={path(baseline)}
          fill="none"
          className="stroke-deadhead"
          strokeWidth={2.5}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path(recommended)}
          fill="none"
          className="stroke-brand-strong dark:stroke-brand"
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
        />
        {started && (
          <line
            x1={x(t)}
            x2={x(t)}
            y1={0}
            y2={H}
            className="stroke-foreground/40"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {/* HTML labels: SVG text would be stretched by preserveAspectRatio="none". */}
      {ticks
        .filter((pct) => !covered(pct))
        .map((pct) => (
          <span
            key={pct}
            className="tabular absolute right-0 -translate-y-1/2 text-[10px] text-muted-foreground"
            style={{ top: `${(y(pct) / H) * 100}%` }}
          >
            {pct}%
          </span>
        ))}
      {started && (
        <>
          <ValueTag
            pct={b}
            top={(y(b) / H) * 100}
            left={(x(Math.min(t, endMs)) / W) * 100}
            className="bg-deadhead/80 text-background"
          />
          <ValueTag
            pct={r}
            top={(y(r) / H) * 100}
            left={(x(Math.min(t, endMs)) / W) * 100}
            className="bg-brand text-brand-foreground"
          />
        </>
      )}
      {!started && (
        <span className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
          La gráfica arranca al terminar el primer día
        </span>
      )}
    </div>
  );
}

function ValueTag({
  pct,
  top,
  left,
  className,
}: {
  pct: number;
  top: number;
  left: number;
  className: string;
}) {
  return (
    <span
      className={`tabular absolute -translate-y-1/2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${className}`}
      style={{ top: `${top}%`, left: `calc(${left}% + 6px)` }}
    >
      {pct.toFixed(1)}%
    </span>
  );
}
