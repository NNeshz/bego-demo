"use client";

import { CITIES } from "@retorno/db/cities";
import { UNIT_LABELS, UNIT_TYPES, type UnitType } from "@retorno/engine";
import {
  ArrowRight,
  Clock,
  Home,
  Loader2,
  MapPin,
  Mic,
  Sparkles,
  Square,
  Truck,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useVoice } from "@/hooks/use-voice";
import { fromLocalInput, toLocalInput, when } from "@/lib/format";
import { parseTripParams, tripQuery, type Trip } from "@/lib/trip-params";
import { cn } from "@/lib/utils";

type Field = "unloadCityId" | "unloadAt" | "unitType" | "baseCityId";
type Intent = { [K in Field]: K extends "unitType" ? UnitType | null : string | null };

const EMPTY: Intent = { unloadCityId: null, unloadAt: null, unitType: null, baseCityId: null };
const FIELDS: Field[] = ["unloadCityId", "unloadAt", "unitType", "baseCityId"];

const EXAMPLES = [
  "Descargo en Laredo mañana a las 10, traigo caja seca, mi base es Querétaro",
  "Ando en Manzanillo con refri, quedo libre hoy en la tarde, soy de Guadalajara",
  "Entrego en CDMX el jueves a las 8, traigo full, regreso a Monterrey",
];

const cityName = (id: string | null) => CITIES.find((c) => c.id === id)?.name ?? null;
const sortedCities = [...CITIES].sort((a, b) => a.name.localeCompare(b.name, "es"));

interface ParseResponse {
  intent: Intent;
  missing: Field[];
  nextQuestion: string | null;
  source: "ai" | "rules" | "ai+rules";
}

export function TripComposer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTrip = parseTripParams(Object.fromEntries(searchParams));

  const [text, setText] = useState("");
  const [intent, setIntent] = useState<Intent>(() =>
    initialTrip
      ? {
          unloadCityId: initialTrip.unloadCityId,
          unloadAt: initialTrip.unloadAt,
          unitType: initialTrip.unitType,
          baseCityId: initialTrip.baseCityId,
        }
      : EMPTY,
  );
  const [question, setQuestion] = useState<{ text: string; field: Field } | null>(null);
  const [status, setStatus] = useState<"idle" | "parsing" | "error">("idle");
  const [source, setSource] = useState<ParseResponse["source"] | null>(null);
  const [editing, setEditing] = useState<Field | null>(null);
  const [revealKey, setRevealKey] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const complete = FIELDS.every((field) => intent[field] !== null);
  // Derived, not an effect: once the asked field is filled (by voice, text or hand), the question is gone.
  const activeQuestion = question && intent[question.field] === null ? question : null;

  async function analyze(message: string) {
    const trimmed = message.trim();
    if (!trimmed || status === "parsing") return;
    setStatus("parsing");
    try {
      const response = await fetch("/api/v1/parse-trip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          previous: intent,
          ...(activeQuestion ? { expecting: activeQuestion.field } : {}),
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as ParseResponse;
      setIntent(data.intent);
      setSource(data.source);
      setRevealKey((k) => k + 1);
      setQuestion(
        data.nextQuestion && data.missing[0]
          ? { text: data.nextQuestion, field: data.missing[0] }
          : null,
      );
      setText("");
      setStatus("idle");
      if (data.nextQuestion) textareaRef.current?.focus();
    } catch {
      setStatus("error");
    }
  }

  const voice = useVoice((transcript, final) => {
    setText(transcript);
    if (final) void analyze(transcript);
  });

  function update<F extends Field>(field: F, value: Intent[F]) {
    setIntent((current) => ({ ...current, [field]: value }));
  }

  function submit() {
    if (!complete) return;
    const trip: Trip = {
      unloadCityId: intent.unloadCityId!,
      unloadAt: intent.unloadAt!,
      unitType: intent.unitType!,
      baseCityId: intent.baseCityId!,
    };
    router.push(`/cargas?${tripQuery(trip)}`);
  }

  return (
    <div className="glass relative flex flex-col gap-5 p-5 sm:p-6">
      {/* Free text / voice */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void analyze(text);
        }}
        className="flex flex-col gap-3"
      >
        <AnimatePresence mode="wait">
          {activeQuestion && (
            <motion.p
              key={activeQuestion.text}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground"
            >
              {activeQuestion.text}
            </motion.p>
          )}
        </AnimatePresence>

        <label htmlFor="trip-text" className="sr-only">
          Cuéntanos tu viaje
        </label>
        <div className="relative">
          <textarea
            id="trip-text"
            ref={textareaRef}
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void analyze(text);
              }
            }}
            placeholder={
              activeQuestion
                ? "Escribe o dicta tu respuesta…"
                : "¿Dónde y cuándo descargas? ¿Qué traes?"
            }
            className="w-full resize-none rounded-2xl border bg-background/70 px-4 py-3.5 pr-16 text-base leading-relaxed outline-none placeholder:text-muted-foreground/80 focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          {voice.supported && (
            <button
              type="button"
              onClick={voice.listening ? voice.stop : voice.start}
              aria-label={voice.listening ? "Dejar de dictar" : "Dictar con voz"}
              aria-pressed={voice.listening}
              className={cn(
                "absolute right-2.5 bottom-3 grid size-11 place-items-center rounded-full transition",
                voice.listening
                  ? "bg-foreground text-background"
                  : "bg-brand text-brand-foreground hover:scale-105",
              )}
            >
              {voice.listening ? (
                <Square className="size-3.5 fill-current" />
              ) : (
                <Mic className="size-5" />
              )}
            </button>
          )}
        </div>

        <AnimatePresence>
          {voice.listening && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-3 text-sm text-muted-foreground"
            >
              <span className="flex h-6 items-center gap-1" aria-hidden>
                {voice.levels.map((level, i) => (
                  <span
                    key={i}
                    className="w-1.5 rounded-full bg-brand-strong transition-[height] duration-75"
                    style={{ height: `${Math.round(level * 24)}px` }}
                  />
                ))}
              </span>
              Te escucho… habla normal, como por WhatsApp.
            </motion.div>
          )}
        </AnimatePresence>
        {voice.error && <p className="text-sm text-destructive">{voice.error}</p>}
        {status === "error" && (
          <p className="text-sm text-destructive">
            No pudimos leer tu mensaje. Revisa tu señal o llena los datos abajo.
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {source && (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="size-3" />
                {source === "rules" ? "Leído sin IA" : "Leído con IA"}
              </span>
            )}
          </span>
          <Button
            type="submit"
            variant="outline"
            size="md"
            disabled={!text.trim() || status === "parsing"}
          >
            {status === "parsing" ? <Loader2 className="animate-spin" /> : null}
            {status === "parsing" ? "Leyendo…" : activeQuestion ? "Responder" : "Analizar"}
            {status !== "parsing" && <ArrowRight />}
          </Button>
        </div>
      </form>

      {!source && !initialTrip && (
        <div className="-mx-5 -mt-1 flex flex-col gap-2 sm:-mx-6">
          <span className="eyebrow px-5 sm:px-6">Prueba con</span>
          {/* Horizontal, swipeable: keeps the main action above the fold on a phone. */}
          <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:px-6">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setText(example);
                  void analyze(example);
                }}
                className="w-60 shrink-0 snap-start rounded-2xl border border-dashed px-3.5 py-2.5 text-left text-sm leading-snug text-muted-foreground transition hover:border-solid hover:bg-accent hover:text-foreground"
              >
                “{example}”
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Structured fields: filled by the AI, always editable by hand (the fallback form). */}
      <div className="flex flex-col divide-y rounded-2xl border bg-background/50">
        <FieldRow
          icon={<MapPin />}
          label="Descargas en"
          value={cityName(intent.unloadCityId)}
          index={0}
          revealKey={revealKey}
          highlighted={activeQuestion?.field === "unloadCityId"}
          editing={editing === "unloadCityId"}
          onEdit={() => setEditing(editing === "unloadCityId" ? null : "unloadCityId")}
        >
          <CitySelect
            value={intent.unloadCityId}
            onChange={(id) => {
              update("unloadCityId", id);
              setEditing(null);
            }}
          />
        </FieldRow>
        <FieldRow
          icon={<Clock />}
          label="Quedas libre"
          value={intent.unloadAt ? when(intent.unloadAt) : null}
          index={1}
          revealKey={revealKey}
          highlighted={activeQuestion?.field === "unloadAt"}
          editing={editing === "unloadAt"}
          onEdit={() => setEditing(editing === "unloadAt" ? null : "unloadAt")}
        >
          <input
            type="datetime-local"
            aria-label="Fecha y hora en que quedas libre"
            defaultValue={intent.unloadAt ? toLocalInput(intent.unloadAt) : undefined}
            onChange={(event) =>
              event.target.value && update("unloadAt", fromLocalInput(event.target.value))
            }
            className="h-11 w-full rounded-xl border bg-background px-3 text-base"
          />
        </FieldRow>
        <FieldRow
          icon={<Truck />}
          label="Tu unidad"
          value={intent.unitType ? UNIT_LABELS[intent.unitType] : null}
          index={2}
          revealKey={revealKey}
          highlighted={activeQuestion?.field === "unitType"}
          editing={editing === "unitType"}
          onEdit={() => setEditing(editing === "unitType" ? null : "unitType")}
        >
          <div className="flex flex-wrap gap-2">
            {UNIT_TYPES.map((unit) => (
              <button
                key={unit}
                type="button"
                onClick={() => {
                  update("unitType", unit);
                  setEditing(null);
                }}
                className={cn(
                  "rounded-full border px-3.5 py-2 text-sm transition",
                  intent.unitType === unit
                    ? "border-foreground bg-foreground text-background"
                    : "hover:bg-accent",
                )}
              >
                {UNIT_LABELS[unit]}
              </button>
            ))}
          </div>
        </FieldRow>
        <FieldRow
          icon={<Home />}
          label="Tu base"
          value={cityName(intent.baseCityId)}
          index={3}
          revealKey={revealKey}
          highlighted={activeQuestion?.field === "baseCityId"}
          editing={editing === "baseCityId"}
          onEdit={() => setEditing(editing === "baseCityId" ? null : "baseCityId")}
        >
          <CitySelect
            value={intent.baseCityId}
            onChange={(id) => {
              update("baseCityId", id);
              setEditing(null);
            }}
          />
        </FieldRow>
      </div>

      <Button variant="brand" size="lg" disabled={!complete} onClick={submit} className="w-full">
        Ver cargas de regreso <ArrowRight />
      </Button>
    </div>
  );
}

function FieldRow(props: {
  icon: ReactNode;
  label: string;
  value: string | null;
  index: number;
  revealKey: number;
  highlighted: boolean;
  editing: boolean;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <div className={cn("px-4 py-3 transition-colors", props.highlighted && "bg-brand/15")}>
      <button
        type="button"
        onClick={props.onEdit}
        aria-expanded={props.editing}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-foreground [&_svg]:size-4">
          {props.icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs text-muted-foreground">{props.label}</span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={`${props.value}-${props.revealKey}`}
              initial={{ opacity: 0, x: -8, filter: "blur(4px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0 }}
              // Fields "type themselves in" one after another after each parse.
              transition={{ delay: props.index * 0.12, duration: 0.3 }}
              className={cn("truncate font-medium", !props.value && "text-muted-foreground/70")}
            >
              {props.value ?? "Toca para elegir"}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="text-xs text-muted-foreground underline-offset-4 hover:underline">
          {props.editing ? "Listo" : "Cambiar"}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {props.editing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-3">{props.children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CitySelect({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  return (
    <select
      aria-label="Ciudad"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-xl border bg-background px-3 text-base"
    >
      <option value="" disabled>
        Elige una ciudad
      </option>
      {sortedCities.map((city) => (
        <option key={city.id} value={city.id}>
          {city.name}
        </option>
      ))}
    </select>
  );
}
