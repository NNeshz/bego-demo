import { getCity } from "@retorno/db/cities";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { DetailView } from "@/components/detail/detail-view";
import { DetailSkeleton, LoadGone } from "@/components/detail/states";
import { InvalidTrip } from "@/components/invalid-trip";
import { parseTripParams, tripQuery, tripToTruckInput } from "@/lib/trip-params";
import { getContext } from "@/server/context";
import { getChainDetail } from "@/server/services";

export const metadata: Metadata = { title: "Cadena de cargas" };

export default function ChainDetailPage(props: PageProps<"/cadenas/[first]/[second]">) {
  return (
    <div className="relative flex flex-1 flex-col">
      <AppHeader />
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 pt-6">
        <Suspense fallback={<DetailSkeleton />}>
          <Detail params={props.params} searchParams={props.searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function Detail({
  params,
  searchParams,
}: {
  params: PageProps<"/cadenas/[first]/[second]">["params"];
  searchParams: PageProps<"/cadenas/[first]/[second]">["searchParams"];
}) {
  const [{ first, second }, query] = await Promise.all([params, searchParams]);
  const trip = parseTripParams(query);
  if (!trip) return <InvalidTrip />;

  const ctx = getContext();
  const detail = await getChainDetail(ctx, tripToTruckInput(trip), first, second);
  const backHref = `/cargas?${tripQuery(trip)}`;
  if (!detail) return <LoadGone backHref={backHref} />;

  const { chain, truck, emptyReturn } = detail;
  const rank = Number(Array.isArray(query.rank) ? query.rank[0] : query.rank) || 1;

  return (
    <DetailView
      truck={truck}
      legs={chain.legs}
      totals={chain}
      emptyReturn={emptyReturn}
      explainInput={{ kind: "chain", chain, baseName: getCity(trip.baseCityId).name }}
      rank={rank}
      backHref={backHref}
      now={ctx.now()}
    />
  );
}
