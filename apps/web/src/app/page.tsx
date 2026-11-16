import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { Terrain } from "@/components/brand/terrain";
import { SiteFooter } from "@/components/site-footer";
import { TripComposer } from "@/components/trip/trip-composer";

export default function HomePage() {
  return (
    <div className="relative flex min-h-[calc(100dvh-28px)] flex-1 flex-col overflow-hidden">
      <Terrain className="h-[46vh] min-h-72" />
      <AppHeader />
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col gap-7 px-5 pt-8 pb-10">
        <section className="flex flex-col gap-3">
          <span className="eyebrow">Copiloto de regreso</span>
          <h1 className="text-[2.6rem] leading-[1.05] font-light tracking-tight">
            No regreses <span className="font-normal text-money">vacío.</span>
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            Dinos dónde descargas y te decimos qué carga te conviene para volver a casa, cuánto
            ganas de más y por qué.
          </p>
        </section>
        {/* useSearchParams() (prefill when coming back to edit) needs a Suspense boundary. */}
        <Suspense fallback={<div className="glass h-[34rem] animate-pulse" />}>
          <TripComposer />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
