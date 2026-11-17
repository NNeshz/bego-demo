import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { Terrain } from "@/components/brand/terrain";
import { SampleResult } from "@/components/home/sample-result";
import { SiteFooter } from "@/components/site-footer";
import { TripComposer } from "@/components/trip/trip-composer";

export default function HomePage() {
  return (
    <div className="relative flex min-h-[calc(100dvh-28px)] flex-1 flex-col overflow-hidden">
      <Terrain className="h-[46vh] min-h-72" />
      <AppHeader />
      {/*
        Phone: one column, the form right after the pitch. Wide: pitch + real example | form.
        grid-cols-1 (= minmax(0, 1fr)) is required: with an implicit "auto" column, Safari grows
        the column to the min-content of the swipeable examples (~850px) and clips the page.
      */}
      <main className="relative z-10 mx-auto grid w-full max-w-md flex-1 grid-cols-1 content-start gap-7 px-5 pt-8 pb-10 lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-x-12 lg:pt-14">
        <div className="flex min-w-0 flex-col gap-7">
          <section className="flex flex-col gap-3">
            <span className="eyebrow">Copiloto de regreso</span>
            <h1 className="text-[2.6rem] leading-[1.05] font-light tracking-tight lg:text-[3.6rem]">
              No regreses <span className="font-normal text-money">vacío.</span>
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground lg:max-w-lg lg:text-lg">
              Dinos dónde descargas y te decimos qué carga te conviene para volver a casa, cuánto
              ganas de más y por qué.
            </p>
          </section>
          {/* Only on wide screens: on a phone the form comes first. */}
          <div className="hidden lg:block lg:max-w-lg">
            <Suspense fallback={<div className="glass h-72 animate-pulse" />}>
              <SampleResult />
            </Suspense>
          </div>
        </div>
        {/* useSearchParams() (prefill when coming back to edit) needs a Suspense boundary. */}
        <Suspense fallback={<div className="glass h-[34rem] animate-pulse" />}>
          <TripComposer />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
