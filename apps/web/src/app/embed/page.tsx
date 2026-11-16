import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { EmbedPlayground } from "@/components/embed/embed-playground";
import { env } from "@/env";

export const metadata: Metadata = { title: "Widget embebible" };

export default function EmbedPage() {
  return (
    <div className="relative flex flex-1 flex-col">
      <AppHeader wide />
      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-5 pt-6 pb-16">
        <section className="flex max-w-3xl flex-col gap-2">
          <span className="eyebrow">Integración · Widget</span>
          <h1 className="text-[2rem] leading-tight font-light tracking-tight lg:text-[2.4rem]">
            Una etiqueta y tu app ya{" "}
            <span className="text-money">recomienda cargas de regreso.</span>
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            <code className="font-mono">&lt;retorno-widget&gt;</code> es un web component de 5 KB
            (gzip) sin dependencias: funciona igual en HTML, React o Angular, consume la{" "}
            <a href="/docs" className="underline underline-offset-4">
              API v1
            </a>{" "}
            y avisa a tu app con eventos del DOM cuando el transportista acepta o descarta.
          </p>
        </section>
        <EmbedPlayground origin={env.NEXT_PUBLIC_APP_URL} />
      </main>
    </div>
  );
}
