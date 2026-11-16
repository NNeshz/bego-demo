import { signedMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Diverging bars around zero: driving home empty COSTS money (left), taking the
 * load EARNS money (right). The gap between them is the headline number.
 * `scale` is shared by every card on the screen so bars are comparable.
 */
export function VersusBars({
  emptyResult,
  loadResult,
  scale,
  className,
}: {
  /** Usually negative: −(cost of driving home empty). */
  emptyResult: number;
  /** Net profit of the load minus the remaining empty return. */
  loadResult: number;
  scale: number;
  className?: string;
}) {
  const pct = (value: number) => `${Math.min(100, (Math.abs(value) / (scale || 1)) * 100)}%`;
  return (
    <div
      className={cn(
        "grid grid-cols-[6.5rem_1fr] items-center gap-x-3 gap-y-1.5 text-xs",
        className,
      )}
    >
      <Row label="Regresar vacío" value={emptyResult} pct={pct(emptyResult)} tone="empty" />
      <Row label="Con esta carga" value={loadResult} pct={pct(loadResult)} tone="load" />
    </div>
  );
}

function Row({
  label,
  value,
  pct,
  tone,
}: {
  label: string;
  value: number;
  pct: string;
  tone: "empty" | "load";
}) {
  const negative = value < 0;
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <div className="relative grid h-2.5 flex-1 grid-cols-2">
          {/* zero line */}
          <span className="absolute inset-y-[-3px] left-1/2 w-px bg-foreground/30" aria-hidden />
          <div className="flex justify-end">
            {negative && (
              <span
                className={cn(
                  "h-full rounded-l-full",
                  tone === "empty" ? "bg-deadhead/70" : "bg-destructive/70",
                )}
                style={{ width: pct }}
              />
            )}
          </div>
          <div className="flex">
            {!negative && (
              <span className="h-full rounded-r-full bg-loaded" style={{ width: pct }} />
            )}
          </div>
        </div>
        <span
          className={cn(
            "tabular w-[4.6rem] text-right font-medium",
            negative ? "text-muted-foreground" : "text-money",
          )}
        >
          {signedMoney(value)}
        </span>
      </div>
    </>
  );
}
