import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { RetrainForm } from "@/components/model/retrain-form";
import { when } from "@/lib/format";
import { PERSONA_LABELS } from "@/lib/personas";
import { cn } from "@/lib/utils";
import { getContext } from "@/server/context";
import type { ModelSummary } from "@/server/learned-weights";

export const metadata: Metadata = { title: "Modelo" };

type RankingMetrics = { "hit@1": number; "hit@3": number; mrr: number; n: number };

const ROWS: Array<{ key: string; label: string; note?: string }> = [
  { key: "shown_order", label: "Orden en que se mostraron", note: "sesgo de posición" },
  { key: "default_weights", label: "Pesos fijos del motor", note: "lo que había antes" },
  { key: "pointwise_baseline", label: "Regresión logística punto por punto", note: "línea base" },
  { key: "global_learned", label: "Logit condicional global" },
  { key: "personalized", label: "Personalizado por transportista", note: "el que se sirve" },
  {
    key: "true_preferences",
    label: "Preferencias verdaderas",
    note: "techo teórico (solo en simulación)",
  },
];

const WEIGHT_ROWS: Array<{ key: string; label: string; format: (v: number) => string }> = [
  { key: "home", label: "Valor de acercarse a la base", format: (v) => `×${v.toFixed(2)}` },
  {
    key: "deadheadPenaltyMxnPerKm",
    label: "Costo de cada km en vacío",
    format: (v) => `$${v.toFixed(1)}/km`,
  },
  {
    key: "waitPenaltyMxnPerHour",
    label: "Costo de cada hora de espera",
    format: (v) => `$${Math.round(v)}/h`,
  },
];

export default function ModelPage() {
  return (
    <div className="relative flex flex-1 flex-col">
      <AppHeader wide />
      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-5 pt-6 pb-16">
        <section className="flex max-w-3xl flex-col gap-2">
          <span className="eyebrow">Machine learning · Pesos aprendidos</span>
          <h1 className="text-[2rem] leading-tight font-light tracking-tight lg:text-[2.4rem]">
            El motor aprende{" "}
            <span className="text-money">qué le importa a cada transportista.</span>
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Cada vez que alguien acepta o rechaza una carga queda registrado qué opciones vio. Un
            servicio en Python entrena un logit condicional con esas decisiones y convierte sus
            coeficientes en pesos del score, en pesos mexicanos. Los transportistas son{" "}
            <strong className="font-medium text-foreground">
              sintéticos con preferencias ocultas
            </strong>
            : por eso podemos medir si el modelo las recupera.
          </p>
        </section>
        <Suspense fallback={<div className="glass h-96 animate-pulse" />}>
          <Report />
        </Suspense>
      </main>
    </div>
  );
}

async function Report() {
  await connection();
  const ctx = getContext();
  if (!ctx.weights.enabled) {
    return (
      <Card title="El servicio de ML no está configurado">
        <p className="text-sm text-muted-foreground">
          La app ordena con los pesos fijos. Para activarlo, define{" "}
          <code className="font-mono">ML_SERVICE_URL</code> y corre:
        </p>
        <Code>{`pnpm --filter @retorno/ml dev              # FastAPI on :8100
pnpm --filter @retorno/ml simulate -- --decisions 3000
pnpm --filter @retorno/ml train`}</Code>
      </Card>
    );
  }
  const model = await ctx.weights.model();
  if (!model) {
    return (
      <Card title="Todavía no hay modelo">
        <p className="text-sm text-muted-foreground">
          El servicio no respondió o no se ha entrenado ningún modelo. Corre el simulador y luego
          entrena.
        </p>
        <RetrainForm />
      </Card>
    );
  }
  return <ModelReport model={model} />;
}

function ModelReport({ model }: { model: ModelSummary }) {
  const metrics = model.metrics as {
    ranking: Record<string, RankingMetrics>;
    personalization: {
      shrinkage: number;
      truckers: number;
      validation_mrr_by_shrinkage: Record<string, number>;
    };
    by_persona?: Record<
      string,
      {
        true: Record<string, number>;
        learned_median: Record<string, number> | null;
        truckers: number;
        ranking: Record<string, RankingMetrics>;
      }
    >;
    decisions: { total: number; train: number; test: number };
  };
  const ranking = metrics.ranking;
  const best = Math.max(...Object.values(ranking).map((r) => r["hit@1"]));

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Modelo"
          value={`v${model.version}`}
          sub={`entrenado ${when(model.trainedAt)}`}
        />
        <Stat
          label="Decisiones"
          value={metrics.decisions.total.toLocaleString("es-MX")}
          sub={`${metrics.decisions.train.toLocaleString("es-MX")} para entrenar · ${metrics.decisions.test.toLocaleString("es-MX")} para evaluar`}
        />
        <Stat
          label="Estado"
          value={model.published ? "Publicado" : "No publicado"}
          sub={model.published ? "le gana a los pesos fijos" : "no le ganó a los pesos fijos"}
          highlight={model.published}
        />
      </div>

      <Card title="¿Pone primero la carga que el transportista sí tomó?">
        <p className="text-xs text-muted-foreground">
          Evaluado con {ranking.personalized?.n ?? 0} decisiones que el modelo nunca vio. “Top 1” =
          la carga elegida quedó en primer lugar.
        </p>
        <div className="flex flex-col gap-2.5">
          {ROWS.filter((row) => ranking[row.key]).map((row) => {
            const m = ranking[row.key]!;
            return (
              <div
                key={row.key}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[16rem_minmax(0,1fr)_auto]"
              >
                <span className={cn("text-sm", row.key === "personalized" && "font-medium")}>
                  {row.label}
                  {row.note && (
                    <span className="block text-[11px] text-muted-foreground">{row.note}</span>
                  )}
                </span>
                <span className="col-span-2 row-start-2 h-2.5 rounded-full bg-muted sm:col-span-1 sm:row-start-auto">
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      row.key === "personalized" ? "bg-brand" : "bg-deadhead/50",
                    )}
                    style={{ width: `${(m["hit@1"] / best) * 100}%` }}
                  />
                </span>
                <span className="tabular text-right text-sm">
                  <span className={cn("font-medium", row.key === "personalized" && "text-money")}>
                    {(m["hit@1"] * 100).toFixed(1)}%
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    top 3 {(m["hit@3"] * 100).toFixed(0)}%
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {metrics.by_persona && (
        <Card title="¿Recupera las preferencias ocultas?">
          <p className="text-xs text-muted-foreground">
            Mediana de los pesos personales aprendidos por tipo de transportista, contra los
            verdaderos del simulador. La preferencia que define a cada tipo se recupera bien; las
            secundarias quedan más cerca del promedio de todos. Con ~
            {Math.round(metrics.decisions.train / Math.max(1, metrics.personalization.truckers))}{" "}
            decisiones por transportista, eso es el encogimiento haciendo su trabajo: no
            sobreajustar con poca historia.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(metrics.by_persona).map(([persona, data]) => (
              <div
                key={persona}
                className="flex flex-col gap-3 rounded-2xl border bg-background/50 p-4"
              >
                <span className="text-sm font-medium">{PERSONA_LABELS[persona] ?? persona}</span>
                <table className="text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="pb-1 text-left font-normal">Peso</th>
                      <th className="pb-1 pl-3 text-right font-normal">Real</th>
                      <th className="pb-1 pl-3 text-right font-normal">Aprendido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {WEIGHT_ROWS.map((w) => (
                      <tr key={w.key}>
                        <td className="py-0.5 pr-2">{w.label}</td>
                        <td className="tabular py-0.5 pl-3 text-right">
                          {w.format(data.true[w.key] ?? 0)}
                        </td>
                        <td className="tabular py-0.5 pl-3 text-right font-medium">
                          {data.learned_median ? w.format(data.learned_median[w.key] ?? 0) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <span className="text-xs text-muted-foreground">
                  Top 1: pesos fijos {pct(data.ranking.default_weights)} →{" "}
                  <span className="font-medium text-money">
                    personalizado {pct(data.ranking.personalized)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Cómo funciona">
          <ul className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
            <li>
              <strong className="font-medium text-foreground">Logit condicional:</strong> el
              transportista elige una opción de la pantalla (o regresar vacío); el modelo aprende
              por qué.
            </li>
            <li>
              <strong className="font-medium text-foreground">Pesos en MXN:</strong> cada
              coeficiente dividido entre el del dinero da cuánto vale para él una hora de espera o
              un km en vacío.
            </li>
            <li>
              <strong className="font-medium text-foreground">
                Personalización con encogimiento:
              </strong>{" "}
              con poca historia, un transportista usa los pesos de todos; conforme decide, se mueven
              hacia los suyos. Fuerza elegida en validación: {metrics.personalization.shrinkage} (
              {metrics.personalization.truckers} transportistas).
            </li>
            <li>
              <strong className="font-medium text-foreground">Candado:</strong> solo se publica si
              ordena mejor que los pesos fijos en decisiones que no vio.
            </li>
          </ul>
        </Card>
        <Card title="Reentrenar">
          <p className="text-sm text-muted-foreground">
            Entrena con todas las decisiones registradas (simuladas y de la app). Si el modelo nuevo
            no le gana a los pesos fijos, se guarda pero no se publica.
          </p>
          <RetrainForm />
        </Card>
      </div>
    </>
  );
}

const pct = (m: RankingMetrics | undefined) => (m ? `${(m["hit@1"] * 100).toFixed(0)}%` : "—");

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="glass flex flex-col gap-4 p-5">
      <h2 className="text-base font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn("glass flex flex-col gap-1 p-4", highlight && "ring-1 ring-brand/70")}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-medium">{value}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre
      tabIndex={0}
      className="overflow-x-auto rounded-xl bg-foreground p-3 text-xs text-background"
    >
      <code>{children}</code>
    </pre>
  );
}
