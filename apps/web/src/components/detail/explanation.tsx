import type { ExplainInput } from "@retorno/ai";
import { Sparkles } from "lucide-react";
import { getContext } from "@/server/context";

/** Streams in after the rest of the page (Claude takes ~2 s); falls back to a template. */
export async function Explanation({ input }: { input: ExplainInput }) {
  const { text, source } = await getContext().ai.explain(input);
  return (
    <ExplanationShell>
      <p className="text-[1.05rem] leading-relaxed">{text}</p>
      <span className="text-[11px] text-muted-foreground">
        {source === "ai"
          ? "Explicado con IA · los números los calcula el motor"
          : "Explicación automática"}
      </span>
    </ExplanationShell>
  );
}

export function ExplanationSkeleton() {
  return (
    <ExplanationShell>
      <span className="h-4 w-full animate-pulse rounded-full bg-muted" />
      <span className="h-4 w-4/5 animate-pulse rounded-full bg-muted" />
      <span className="text-[11px] text-muted-foreground">Pensando por qué te conviene…</span>
    </ExplanationShell>
  );
}

function ExplanationShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex gap-3 rounded-3xl border bg-brand/12 p-4">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground">
        <Sparkles className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}
