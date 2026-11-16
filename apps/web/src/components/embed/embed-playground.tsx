"use client";

import { CITIES } from "@retorno/db/cities";
import { UNIT_LABELS, UNIT_TYPES, type UnitType } from "@retorno/engine";
import { Bell, Check, Copy, FileText, Home, Receipt, Truck, Wallet } from "lucide-react";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ATTRIBUTES, CSS_VARS, EVENTS, snippets } from "./snippets";

const ACCENTS = [
  { id: "retorno", label: "Amarillo Retorno", accent: "#f3e23f", fg: "#12151b" },
  { id: "blue", label: "Azul de tu marca", accent: "#2563eb", fg: "#ffffff" },
  { id: "green", label: "Verde", accent: "#16a34a", fg: "#ffffff" },
] as const;

const sortedCities = [...CITIES].sort((a, b) => a.name.localeCompare(b.name, "es"));

interface LogEntry {
  id: number;
  at: string;
  type: string;
  summary: string;
}

export function EmbedPlayground({ origin }: { origin: string }) {
  const widgetRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState("nuevo-laredo");
  const [base, setBase] = useState("queretaro");
  const [unit, setUnit] = useState<UnitType>("dry_van_53");
  const [hostTheme, setHostTheme] = useState<"light" | "dark">("light");
  const [accent, setAccent] = useState<(typeof ACCENTS)[number]>(ACCENTS[1]);
  const [explain, setExplain] = useState(true);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [tab, setTab] = useState<"html" | "react" | "angular">("html");
  const [copied, setCopied] = useState(false);
  const code = snippets(origin)[tab];

  // Listen like any host app would: plain DOM events on the element.
  useEffect(() => {
    const el = widgetRef.current;
    if (!el) return;
    let seq = 0;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as Record<string, unknown>;
      const rec = detail.recommendation as
        | { load: { id: string; origin: { name: string }; destination: { name: string } } }
        | undefined;
      const summary = rec
        ? `${rec.load.id} · ${rec.load.origin.name} → ${rec.load.destination.name} (opción ${detail.rank as number})`
        : event.type === "retorno-load"
          ? `${detail.count as number} recomendaciones`
          : String(detail.message ?? "");
      const at = new Intl.DateTimeFormat("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date());
      setLog((current) =>
        [{ id: Date.now() + seq++, at, type: event.type, summary }, ...current].slice(0, 8),
      );
    };
    const types = ["retorno-load", "retorno-accept", "retorno-reject", "retorno-error"];
    types.forEach((type) => el.addEventListener(type, handler));
    return () => types.forEach((type) => el.removeEventListener(type, handler));
  }, []);

  const dark = hostTheme === "dark";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <Script src="/widget.js" strategy="afterInteractive" />

      {/* Fake host app: deliberately NOT Retorno's look, to show the widget adapts. */}
      <section className="flex flex-col gap-3">
        <div
          className={cn(
            "overflow-hidden rounded-3xl border shadow-xl",
            dark
              ? "border-slate-700 bg-slate-900 text-slate-100"
              : "border-slate-200 bg-slate-50 text-slate-900",
          )}
          style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" }}
        >
          <div
            className={cn(
              "flex items-center gap-2 border-b px-4 py-2.5",
              dark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white",
            )}
          >
            <span className="flex gap-1.5" aria-hidden>
              <span className="size-2.5 rounded-full bg-red-400" />
              <span className="size-2.5 rounded-full bg-amber-400" />
              <span className="size-2.5 rounded-full bg-green-400" />
            </span>
            <span
              className={cn(
                "ml-3 truncate rounded-md px-3 py-1 text-xs",
                dark ? "bg-slate-900 text-slate-400" : "bg-slate-100 text-slate-500",
              )}
            >
              app.tu-empresa.mx/viajes/4821
            </span>
          </div>
          <div className="grid md:grid-cols-[180px_1fr]">
            <nav
              className={cn(
                "hidden flex-col gap-1 border-r p-3 text-sm md:flex",
                dark ? "border-slate-700" : "border-slate-200",
              )}
            >
              <span
                className="mb-3 px-2 text-base font-bold"
                style={{ color: accent.accent === "#f3e23f" ? undefined : accent.accent }}
              >
                MiFlota
              </span>
              {[
                [Home, "Inicio"],
                [Truck, "Viajes"],
                [FileText, "Carta Porte"],
                [Receipt, "Facturas"],
                [Wallet, "Pagos"],
              ].map(([Icon, label], i) => {
                const I = Icon as typeof Home;
                return (
                  <span
                    key={label as string}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2 py-1.5",
                      i === 1 && (dark ? "bg-slate-800" : "bg-white shadow-sm"),
                    )}
                  >
                    <I className="size-4 opacity-70" /> {label as string}
                  </span>
                );
              })}
            </nav>
            <div className="flex flex-col gap-4 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={cn("text-xs", dark ? "text-slate-400" : "text-slate-500")}>
                    Viaje #4821 · entregado
                  </p>
                  <h2 className="text-lg font-semibold">
                    Querétaro → {CITIES.find((c) => c.id === position)?.name}
                  </h2>
                </div>
                <Bell className="size-5 opacity-60" />
              </div>
              <div
                className={cn(
                  "rounded-xl border p-3 text-sm",
                  dark ? "border-slate-700 bg-slate-800/60" : "border-slate-200 bg-white",
                )}
              >
                ✅ Evidencia de entrega recibida · Carta Porte cerrada · Pago en proceso
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold">¿Y ahora? No regreses vacío</p>
                <retorno-widget
                  ref={widgetRef}
                  position={position}
                  base={base}
                  unit-type={unit}
                  theme={hostTheme}
                  explain={explain ? "" : undefined}
                  limit="3"
                  style={{
                    ["--retorno-accent" as string]: accent.accent,
                    ["--retorno-accent-fg" as string]: accent.fg,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          “MiFlota” es una app de ejemplo. El widget vive en Shadow DOM: hereda la tipografía del
          anfitrión, toma su color de acento por variables CSS y no le filtra estilos.
        </p>
      </section>

      {/* Controls, events and code */}
      <aside className="flex flex-col gap-4">
        <div className="glass flex flex-col gap-3 p-4">
          <h2 className="eyebrow">Atributos en vivo</h2>
          <div className="grid grid-cols-2 gap-2">
            <Field label="position">
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="control"
              >
                {sortedCities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="base">
              <select value={base} onChange={(e) => setBase(e.target.value)} className="control">
                {sortedCities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="unit-type">
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as UnitType)}
                className="control"
              >
                {UNIT_TYPES.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="theme">
              <select
                value={hostTheme}
                onChange={(e) => setHostTheme(e.target.value as "light" | "dark")}
                className="control"
              >
                <option value="light">light</option>
                <option value="dark">dark</option>
              </select>
            </Field>
            <Field label="--retorno-accent">
              <select
                value={accent.id}
                onChange={(e) =>
                  setAccent(ACCENTS.find((a) => a.id === e.target.value) ?? ACCENTS[0])
                }
                className="control"
              >
                {ACCENTS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={explain}
                onChange={(e) => setExplain(e.target.checked)}
                className="size-4 accent-[var(--brand-strong)]"
              />
              explain (IA)
            </label>
          </div>
        </div>

        <div className="glass flex flex-col gap-2 p-4">
          <h2 className="eyebrow">Eventos que recibe tu app</h2>
          <ol className="flex min-h-28 flex-col gap-1.5 font-mono text-xs" aria-live="polite">
            {log.length === 0 && (
              <li className="text-muted-foreground">
                Esperando eventos… acepta o descarta una carga.
              </li>
            )}
            {log.map((entry) => (
              <li key={entry.id} className="flex gap-2">
                <span className="text-muted-foreground">{entry.at}</span>
                <span
                  className={cn(
                    "font-semibold",
                    entry.type === "retorno-accept" && "text-success",
                    entry.type === "retorno-error" && "text-destructive",
                  )}
                >
                  {entry.type}
                </span>
                <span className="truncate">{entry.summary}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="glass flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <div
              role="tablist"
              aria-label="Framework"
              className="flex rounded-full border p-0.5 text-xs"
            >
              {(["html", "react", "angular"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  type="button"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "rounded-full px-3 py-1.5 font-medium",
                    tab === t ? "bg-foreground text-background" : "text-muted-foreground",
                  )}
                >
                  {t === "html" ? "HTML" : t === "react" ? "React" : "Angular"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs hover:bg-accent"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <pre className="max-h-80 overflow-auto rounded-2xl bg-foreground p-4 text-[11.5px] leading-relaxed text-background">
            <code>{code}</code>
          </pre>
        </div>

        <details className="glass p-4 text-sm">
          <summary className="cursor-pointer font-medium">
            Referencia: atributos, eventos y estilos
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            <RefTable rows={ATTRIBUTES} />
            <RefTable rows={EVENTS} />
            <p className="text-xs text-muted-foreground">
              Variables CSS: <code className="font-mono">{CSS_VARS.join(" ")}</code>. Partes:{" "}
              <code className="font-mono">::part(root | card | accept | reject)</code>. Método:{" "}
              <code className="font-mono">el.refresh()</code>.
            </p>
          </div>
        </details>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 font-mono text-[11px] text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function RefTable({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
      {rows.map(([name, description]) => (
        <div key={name} className="contents">
          <dt className="font-mono font-medium">{name}</dt>
          <dd className="text-muted-foreground">{description}</dd>
        </div>
      ))}
    </dl>
  );
}
