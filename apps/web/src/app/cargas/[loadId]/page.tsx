import { getCity } from "@retorno/db/cities";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { DetailView } from "@/components/detail/detail-view";
import { DetailSkeleton, LoadGone } from "@/components/detail/states";
import { InvalidTrip } from "@/components/invalid-trip";
import { parseTripParams, tripQuery, tripToTruckInput } from "@/lib/trip-params";
import { getContext } from "@/server/context";
import { getLoadDetail } from "@/server/services";

export const metadata: Metadata = { title: "Detalle de la carga" };

export default function LoadDetailPage(props: PageProps<"/cargas/[loadId]">) {
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
  params: PageProps<"/cargas/[loadId]">["params"];
  searchParams: PageProps<"/cargas/[loadId]">["searchParams"];
}) {
  const [{ loadId }, query] = await Promise.all([params, searchParams]);
  const trip = parseTripParams(query);
  if (!trip) return <InvalidTrip />;

  const ctx = getContext();
  const detail = await getLoadDetail(ctx, tripToTruckInput(trip), loadId);
  const backHref = `/cargas?${tripQuery(trip)}`;
  if (!detail) return <LoadGone backHref={backHref} />;

  const { recommendation: r, truck, emptyReturn } = detail;
  const rank = Number(Array.isArray(query.rank) ? query.rank[0] : query.rank) || 1;

  return (
    <DetailView
      truck={truck}
      legs={[r]}
      totals={{
        netProfitMxn: r.breakdown.netProfitMxn,
        gainVsEmptyMxn: r.gainVsEmptyMxn,
        returnHomeKm: r.returnHomeKm,
        returnHomeCostMxn: r.returnHomeCostMxn,
        totalHours: r.totalHours,
        totalEmptyKm: r.deadheadKm,
        totalLoadedKm: r.loadedKm,
        scorePerHour: r.scorePerHour,
      }}
      emptyReturn={emptyReturn}
      explainInput={{ kind: "load", recommendation: r, baseName: getCity(trip.baseCityId).name }}
      rank={rank}
      backHref={backHref}
      now={ctx.now()}
    />
  );
}
