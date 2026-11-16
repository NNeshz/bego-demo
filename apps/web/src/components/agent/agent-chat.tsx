"use client";

import type { AgentEvent, AgentMessage } from "@retorno/ai";
import { ArrowUp, Check, Loader2, Mic, RotateCcw, Square, Wrench, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useVoice } from "@/hooks/use-voice";
import { cn } from "@/lib/utils";
import { ToolResult } from "./tool-result";

type Item =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      input: unknown;
      status: "running" | "ok" | "error";
      data?: unknown;
      error?: string;
    }
  | { kind: "error"; id: string; text: string };

const TOOL_LABELS: Record<string, string> = {
  find_return_loads: "Buscando cargas de regreso",
  plan_load_chain: "Armando cadenas de 2 cargas",
  explain_recommendation: "Explicando por qué conviene",
  get_fleet_empty_km: "Simulando la semana de la flota",
};

const STARTERS = [
  "Descargo en Laredo mañana a las 10 con caja seca, mi base es Querétaro",
  "¿Cuánto rueda vacía la flota esta semana?",
];
const FOLLOW_UPS = ["¿Por qué me conviene la primera?", "¿Y si encadeno dos cargas?"];

let counter = 0;
const uid = () => `i${++counter}`;

export function AgentChat() {
  const [items, setItems] = useState<Item[]>([]);
  const [history, setHistory] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll only the message list (scrollIntoView would also move the page, even sideways).
  useEffect(() => {
    const el = scrollRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [items]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setInput("");
    setItems((current) => [...current, { kind: "user", id: uid(), text: trimmed }]);
    const messages: AgentMessage[] = [...history, { role: "user", content: trimmed }];

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      }

      // NDJSON: one event per line, rendered as soon as it arrives.
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines)
          if (line.trim())
            handle(JSON.parse(line) as AgentEvent | { type: "error"; message: string });
      }
    } catch (error) {
      setItems((current) => [
        ...current,
        {
          kind: "error",
          id: uid(),
          text:
            error instanceof Error && error.message.includes("Too many")
              ? "Muchas preguntas seguidas, espera un minuto."
              : "No pude responder. Revisa tu señal e intenta otra vez.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function handle(event: AgentEvent | { type: "error"; message: string }) {
    switch (event.type) {
      case "text":
        setItems((current) => [...current, { kind: "assistant", id: uid(), text: event.text }]);
        break;
      case "tool_call":
        setItems((current) => [
          ...current,
          { kind: "tool", id: event.id, name: event.name, input: event.input, status: "running" },
        ]);
        break;
      case "tool_result":
        setItems((current) =>
          current.map((item) =>
            item.kind === "tool" && item.id === event.id
              ? event.ok
                ? { ...item, status: "ok", data: event.data }
                : { ...item, status: "error", error: event.error }
              : item,
          ),
        );
        break;
      case "done":
        setHistory(event.messages);
        break;
      case "error":
        setItems((current) => [...current, { kind: "error", id: uid(), text: event.message }]);
        break;
    }
  }

  const voice = useVoice((transcript, final) => {
    setInput(transcript);
    if (final) void send(transcript);
  });

  return (
    <div className="glass flex h-[min(78dvh,46rem)] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium">Asistente Retorno</span>
          <span className="text-[11px] text-muted-foreground">
            Claude + 4 herramientas del motor · los números los calcula el motor
          </span>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setItems([]);
              setHistory([]);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs hover:bg-accent"
          >
            <RotateCcw className="size-3.5" /> Nueva
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {items.length === 0 ? (
          <div className="flex h-full flex-col justify-end gap-3">
            <p className="text-sm text-muted-foreground">
              Pregúntale como le preguntarías a tu despachador. Prueba con:
            </p>
            <div className="flex flex-col gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  disabled={busy}
                  className="rounded-2xl border border-dashed px-3.5 py-2.5 text-left text-sm text-muted-foreground transition hover:border-solid hover:bg-accent hover:text-foreground"
                >
                  “{s}”
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <motion.li
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col gap-2"
                >
                  {item.kind === "user" && (
                    <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-foreground px-3.5 py-2.5 text-sm text-background">
                      {item.text}
                    </p>
                  )}
                  {item.kind === "assistant" && (
                    <p className="max-w-[90%] rounded-2xl rounded-bl-md border bg-card px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line">
                      {item.text.replace(/\*\*/g, "")}
                    </p>
                  )}
                  {item.kind === "error" && <p className="text-sm text-destructive">{item.text}</p>}
                  {item.kind === "tool" && (
                    <>
                      <span className="inline-flex w-fit items-center gap-2 rounded-full bg-secondary px-3 py-1 font-mono text-[11px] text-muted-foreground">
                        {item.status === "running" ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : item.status === "ok" ? (
                          <Check className="size-3 text-success" />
                        ) : (
                          <X className="size-3 text-destructive" />
                        )}
                        <Wrench className="size-3" />
                        {item.name}
                        <span className="font-sans">
                          · {TOOL_LABELS[item.name] ?? "Usando herramienta"}
                        </span>
                      </span>
                      {item.status === "ok" && <ToolResult name={item.name} data={item.data} />}
                    </>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
            {busy && items.at(-1)?.kind === "user" && (
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Pensando…
              </li>
            )}
          </ol>
        )}
      </div>

      {!busy &&
        items.some(
          (i) => i.kind === "tool" && i.name === "find_return_loads" && i.status === "ok",
        ) && (
          <div className="flex gap-2 overflow-x-auto px-3 pt-2 [scrollbar-width:none]">
            {FOLLOW_UPS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void send(s)}
                className="shrink-0 rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
        className="flex items-end gap-2 border-t p-3"
      >
        <label htmlFor="agent-input" className="sr-only">
          Mensaje
        </label>
        <textarea
          id="agent-input"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder="Escribe o dicta…"
          className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border bg-background/70 px-3.5 py-2.5 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {voice.supported && (
          <button
            type="button"
            onClick={voice.listening ? voice.stop : voice.start}
            aria-label={voice.listening ? "Dejar de dictar" : "Dictar con voz"}
            className={cn(
              "grid size-11 place-items-center rounded-full border",
              voice.listening && "bg-foreground text-background",
            )}
          >
            {voice.listening ? (
              <Square className="size-3.5 fill-current" />
            ) : (
              <Mic className="size-4" />
            )}
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Enviar"
          className="grid size-11 place-items-center rounded-full bg-brand text-brand-foreground transition disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-5" />}
        </button>
      </form>
    </div>
  );
}
