import { getCity } from "@retorno/db/cities";
import { UNIT_LABELS } from "@retorno/engine";
import { ArrowLeft, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { ChainCard } from "@/components/loads/chain-card";
import { EmptyState } from "@/components/loads/empty-state";
import { RecommendationCard } from "@/components/loads/recommendation-card";
import { ResultsTabs } from "@/components/loads/results-tabs";
import { FadeIn } from "@/components/motion";
import { InvalidTrip } from "@/components/invalid-trip";
import { hours, km, money, when } from "@/lib/format";
import { parseTripParams, tripQuery, tripToTruckInput } from "@/lib/trip-params";
import { getContext } from "@/server/context";
import { getChains, getRecommendations } from "@/server/services";

export const metadata: Metadata = { title: "Cargas de regreso" };

export default function CargasPage(props: PageProps<"/cargas">) {
  return (
    <div className="relative flex flex-1 flex-col">
      <AppHeader />
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 pt-6 pb-16">
        {/* searchParams are request-time data: everything that reads them streams in behind the skeleton. */}
        <Suspense fallback={<ResultsSkeleton />}>
          <Results searchParams={props.searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/cargas">["searchParams"] }) {
  const trip = parseTripParams(await searchParams);
  if (!trip) return <InvalidTrip />;

  const ctx = getContext();
  const now = ctx.now();
  const truck = tripToTruckInput(trip);
  const [result, chainResult] = await Promise.all([
    getRecommendations(ctx, { truck, limit: 5, explain: false }),
    getChains(ctx, { truck, limit: 3, explain: false, beamWidth: 20 }),
  ]);

  const query = tripQuery(trip);
  const unload = getCity(trip.unloadCityId);
  const base = getCity(trip.baseCityId);
  const emptyCost = result.emptyReturn.costMxn;
  // One scale for every card so bars are comparable across loads and chains.
  const scale = Math.max(
    emptyCost,
    ...result.recommendations.map((r) => Math.abs(r.breakdown.netProfitMxn - r.returnHomeCostMxn)),
    ...chainResult.chains.map((c) => Math.abs(c.netProfitMxn - c.returnHomeCostMxn)),
  );

  return (
    <>
      <section className="flex flex-col gap-4">
        <Link
          href={`/?${query}`}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Cambiar viaje
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-foreground px-3 py-1.5 font-medium text-background">
            {unload.name}
          </span>
          <span className="text-muted-foreground">→ base</span>
          <span className="rounded-full border px-3 py-1.5 font-medium">{base.name}</span>
          <span className="w-full text-xs text-muted-foreground">
            {UNIT_LABELS[trip.unitType]} · libre {when(trip.unloadAt, now)}
            <Link
              href={`/?${query}`}
              aria-label="Editar viaje"
              className="ml-2 inline-flex align-middle hover:text-foreground"
            >
              <Pencil className="size-3.5" />
            </Link>
          </span>
        </div>
        <h1 className="text-[1.9rem] leading-tight font-light tracking-tight">
          {result.recommendations.length > 0 ? (
            <>
              <span className="font-normal">{result.stats.feasible}</span> cargas te convienen más
              que regresar vacío
            </>
          ) : (
            "Buscamos en todo el mercado"
          )}
        </h1>
        <div className="flex items-center justify-between rounded-2xl border border-dashed px-4 py-3 text-sm">
          <span className="text-muted-foreground">Si regresas vacío</span>
          <span className="tabular text-right">
            {km(result.emptyReturn.km)} · {hours(result.emptyReturn.hours)} ·{" "}
            <span className="font-medium">−{money(emptyCost)}</span>
          </span>
        </div>
      </section>

      {result.recommendations.length === 0 ? (
        <EmptyState
          stats={result.stats}
          unitLabel={UNIT_LABELS[trip.unitType]}
          cityName={unload.name}
          editHref={`/?${query}`}
        />
      ) : (
        <ResultsTabs
          tabs={[
            {
              id: "loads",
              label: "Cargas",
              count: result.recommendations.length,
              content: result.recommendations.map((recommendation, i) => (
                <FadeIn key={recommendation.load.id} index={i}>
                  <RecommendationCard
                    recommendation={recommendation}
                    rank={i + 1}
                    href={`/cargas/${recommendation.load.id}?${query}&rank=${i + 1}`}
                    emptyReturnCostMxn={emptyCost}
                    scale={scale}
                    now={now}
                  />
                </FadeIn>
              )),
            },
            {
              id: "chains",
              label: "Cadenas de 2",
              count: chainResult.chains.length,
              content:
                chainResult.chains.length === 0 ? (
                  <p className="glass p-6 text-center text-sm text-muted-foreground">
                    No encontramos dos cargas que encadenen bien desde aquí.
                  </p>
                ) : (
                  chainResult.chains.map((chain, i) => (
                    <FadeIn key={`${chain.legs[0].load.id}-${chain.legs[1].load.id}`} index={i}>
                      <ChainCard
                        chain={chain}
                        href={`/cadenas/${chain.legs[0].load.id}/${chain.legs[1].load.id}?${query}&rank=${i + 1}`}
                        emptyReturnCostMxn={emptyCost}
                        scale={scale}
                        now={now}
                      />
                    </FadeIn>
                  ))
                ),
            },
          ]}
        />
      )}
    </>
  );
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Buscando cargas">
      <div className="h-5 w-32 animate-pulse rounded-full bg-muted" />
      <div className="h-8 w-56 animate-pulse rounded-full bg-muted" />
      <div className="h-20 w-full animate-pulse rounded-3xl bg-muted" />
      <div className="h-12 w-full animate-pulse rounded-full bg-muted" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="glass h-72 animate-pulse" />
      ))}
      <p className="text-center text-sm text-muted-foreground">
        Revisando 320 cargas en el mercado…
      </p>
    </div>
  );
}
