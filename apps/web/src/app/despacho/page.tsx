import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { DispatchBoard } from "@/components/dispatch/dispatch-board";
import { getContext } from "@/server/context";
import { getFleet, runSimulation } from "@/server/services";

export const metadata: Metadata = { title: "Despacho" };

export default function DespachoPage() {
  return (
    <div className="relative flex flex-1 flex-col">
      <AppHeader wide />
      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 pt-6 pb-16">
        <Suspense fallback={<BoardSkeleton />}>
          <Board />
        </Suspense>
      </main>
    </div>
  );
}

async function Board() {
  // The market is rebased to "today": must run per request, never at build time.
  await connection();
  const ctx = getContext();
  const [simulation, { trucks }] = await Promise.all([runSimulation(ctx, 7), getFleet(ctx)]);
  return (
    <DispatchBoard
      trucks={trucks.map(({ id, driverName, plate, unitType, base }) => ({
        id,
        driverName,
        plate,
        unitType,
        base,
      }))}
      baseline={simulation.baseline}
      recommended={simulation.recommended}
    />
  );
}

function BoardSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Simulando la semana">
      <div className="h-10 w-2/3 animate-pulse rounded-full bg-muted" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass h-24 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
        <div className="h-[34rem] animate-pulse rounded-3xl bg-muted" />
        <div className="glass h-[34rem] animate-pulse" />
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Simulando 7 días de 25 camiones en 320 cargas…
      </p>
    </div>
  );
}
