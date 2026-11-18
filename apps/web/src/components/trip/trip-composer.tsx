"use client";

import { CITIES } from "@retorno/db/cities";
import { UNIT_LABELS, UNIT_TYPES, type UnitType } from "@retorno/engine";
import {
  ArrowRight,
  ChevronRight,
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

const FIELD_NAMES: Record<Field, string> = {
  unloadCityId: "dónde descargas",
  unloadAt: "cuándo quedas libre",
  unitType: "tu unidad",
  baseCityId: "tu base",
};

function missingHint(intent: Intent): string {
  const missing = FIELDS.filter((field) => intent[field] === null);
  if (missing.length === 0) return "";
  if (missing.length === FIELDS.length)
    return "Cuéntanos tu viaje arriba o elige los datos a mano.";
  const names = missing.map((field) => FIELD_NAMES[field]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} y ${names.at(-1)}` : names[0];
  return `Falta ${list}.`;
}

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
  const [status, setStatus] = useState<"idle" | "parsing" | "error" | "rate_limited">("idle");
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
      if (response.status === 429) {
        setStatus("rate_limited");
        return;
      }
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
        {/* One box like a chat input: text on top, actions (send, voice) in a row below it. */}
        <div className="rounded-2xl border bg-background/70 transition focus-within:ring-3 focus-within:ring-ring/50">
          <textarea
            id="trip-text"
            ref={textareaRef}
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                // Read the box itself, not `text`: state can lag one render behind a fast
                // Enter (or a dictation keyboard), which would send an empty message.
                void analyze(event.currentTarget.value);
              }
            }}
            placeholder={
              activeQuestion
                ? "Escribe o dicta tu respuesta…"
                : "¿Dónde y cuándo descargas? ¿Qué traes?"
            }
            className="block w-full resize-none rounded-t-2xl bg-transparent px-4 pt-3.5 pb-1 text-base leading-relaxed outline-none placeholder:text-muted-foreground/80"
          />
          <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
            <span className="pl-1.5 text-xs text-muted-foreground">
              {source ? (
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="size-3" />
                  {source === "rules" ? "Leído sin IA" : "Leído con IA"}
                </span>
              ) : (
                <span className="hidden sm:inline">Enter para enviar</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <AnimatePresence initial={false}>
                {(text.trim() || status === "parsing") && (
                  <motion.button
                    key="send"
                    type="submit"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    disabled={status === "parsing"}
                    className="inline-flex h-11 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-medium text-background transition hover:bg-foreground/85 disabled:opacity-70"
                  >
                    {status === "parsing" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ArrowRight className="size-4" />
                    )}
                    {status === "parsing" ? "Leyendo…" : activeQuestion ? "Responder" : "Analizar"}
                  </motion.button>
                )}
              </AnimatePresence>
              {voice.supported && (
                <button
                  type="button"
                  onClick={voice.listening ? voice.stop : voice.start}
                  aria-label={voice.listening ? "Dejar de dictar" : "Dictar con voz"}
                  aria-pressed={voice.listening}
                  className={cn(
                    "grid size-11 place-items-center rounded-full transition",
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
          </div>
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
                {voice.levels.map((level, i) =>
                  voice.simulated ? (
                    // No live meter (iOS): a gentle wave so it still looks like it's listening.
                    <span
                      key={i}
                      className="animate-voice-bar h-6 w-1.5 origin-center rounded-full bg-brand-strong"
                      style={{ animationDelay: `${i * 120}ms` }}
                    />
                  ) : (
                    <span
                      key={i}
                      className="w-1.5 rounded-full bg-brand-strong transition-[height] duration-75"
                      style={{ height: `${Math.round(level * 24)}px` }}
                    />
                  ),
                )}
              </span>
              Te escucho… habla normal, como por WhatsApp.
            </motion.div>
          )}
        </AnimatePresence>
        {voice.error && <p className="text-sm text-destructive">{voice.error}</p>}
        {status === "rate_limited" && (
          <p role="alert" className="text-sm text-destructive">
            Muchas consultas seguidas. Espera un minuto o llena los datos abajo.
          </p>
        )}
        {status === "error" && (
          <p className="text-sm text-destructive">
            No pudimos leer tu mensaje. Revisa tu señal o llena los datos abajo.
          </p>
        )}
      </form>

      {!source && !initialTrip && (
        <div className="-mx-5 -mt-1 flex flex-col gap-2 sm:-mx-6">
          <span className="eyebrow px-5 sm:px-6">Prueba con</span>
          {/*
            Phone: horizontal and swipeable, so the main action stays above the fold. scroll-padding
            matches the card padding: without it, snapping pulls the first card to the card's edge.
            The right edge fades to hint there is more. Wide screens: all examples, stacked.
          */}
          <div className="flex snap-x snap-mandatory scroll-px-5 gap-2 overflow-x-auto px-5 pb-1 [mask-image:linear-gradient(to_right,black_88%,transparent)] [scrollbar-width:none] sm:scroll-px-6 sm:px-6 lg:flex-col lg:overflow-visible lg:[mask-image:none]">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setText(example);
                  void analyze(example);
                }}
                className="w-64 shrink-0 snap-start rounded-2xl border border-dashed px-3.5 py-2.5 text-left text-sm leading-snug text-muted-foreground transition last:mr-5 hover:border-solid hover:bg-accent hover:text-foreground sm:last:mr-6 lg:w-full lg:last:mr-0"
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

      <div className="flex flex-col gap-2">
        <Button variant="brand" size="lg" disabled={!complete} onClick={submit} className="w-full">
          Ver cargas de regreso <ArrowRight />
        </Button>
        {/* Say what's missing instead of leaving a mute disabled button. */}
        <p aria-live="polite" className="min-h-4 text-center text-xs text-muted-foreground">
          {missingHint(intent)}
        </p>
      </div>
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
          {props.value ? (
            <>
              <span className="text-xs text-muted-foreground">{props.label}</span>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={`${props.value}-${props.revealKey}`}
                  initial={{ opacity: 0, x: -8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0 }}
                  // Fields "type themselves in" one after another after each parse.
                  transition={{ delay: props.index * 0.12, duration: 0.3 }}
                  className="truncate font-medium"
                >
                  {props.value}
                </motion.span>
              </AnimatePresence>
            </>
          ) : (
            // Empty: just the question, one line. No repeated placeholder noise.
            <span className="text-[0.95rem] text-foreground/80">{props.label}</span>
          )}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-xs",
            props.value || props.editing
              ? "text-muted-foreground"
              : "font-medium text-foreground/80",
          )}
        >
          {props.editing ? "Listo" : props.value ? "Cambiar" : "Elegir"}
          {!props.editing && !props.value && <ChevronRight className="size-3.5" />}
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
