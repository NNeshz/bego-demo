import type { Metadata } from "next";
import { AgentChat } from "@/components/agent/agent-chat";
import { ConnectPanel } from "@/components/agent/connect-panel";
import { AppHeader } from "@/components/app-header";
import { env } from "@/env";

export const metadata: Metadata = { title: "Agente" };

export default function AgentPage() {
  return (
    <div className="relative flex flex-1 flex-col">
      <AppHeader wide />
      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-5 pt-6 pb-16">
        <section className="flex max-w-3xl flex-col gap-2">
          <span className="eyebrow">Integración · Agente de IA</span>
          <h1 className="text-[2rem] leading-tight font-light tracking-tight lg:text-[2.4rem]">
            El motor, como herramienta <span className="text-money">para tu asistente de IA.</span>
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Así se vería conectado a un asistente como BeGo Black (concepto, no es una integración
            real). Claude decide qué herramienta usar; el dinero siempre lo calcula el motor.
          </p>
        </section>
        {/* minmax(0,1fr): without it the single mobile column grows to fit the widest code block. */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <AgentChat />
          <ConnectPanel origin={env.NEXT_PUBLIC_APP_URL} />
        </div>
      </main>
    </div>
  );
}
