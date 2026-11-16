import {
  FIELD_QUESTIONS,
  missingFields,
  parseTripRules,
  runAgent,
  toMxIso,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
} from "@retorno/ai";
import { z } from "zod";
import { money } from "@/lib/format";
import type { ServerContext } from "./context";
import { runTool, TOOLS } from "./tools";

export function agentTools(ctx: ServerContext): AgentTool[] {
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(z.object(tool.shape)) as Record<string, unknown>,
    run: (input) => runTool(ctx, tool.name, input),
  }));
}

export function systemPrompt(now: Date): string {
  return `Eres el asistente de Retorno: ayudas a transportistas mexicanos (hombres-camión) y a despachadores a no regresar vacíos.
Concepto no oficial de Neftalí Hernández, no afiliado a BeGo. Los datos son sintéticos.

Fecha y hora actual en Ciudad de México: ${toMxIso(now)}.

Cómo trabajas:
- Para recomendar cargas necesitas: ciudad donde descarga, su base y su tipo de unidad. Si falta algo, pregunta solo eso, en una frase.
- "Laredo" sin más contexto es nuevo-laredo. Usa laredo-tx solo si dice Texas, TX o "del otro lado".
- Llama las herramientas directamente: no narres lo que vas a hacer. Nunca muestres fechas ISO, ids de ciudad ni load_id.
- Las horas de las herramientas ya vienen en hora de Ciudad de México (-06:00): dilas así, en formato de 24 h ("mañana a las 10:00").
- Usa find_return_loads para recomendar. Si ninguna carga lo deja cerca de su base o lo pide, usa plan_load_chain.
- Si pregunta "¿por qué?" sobre una carga, usa explain_recommendation con el mismo viaje y su load_id.
- Para preguntas de flota o despacho ("cuánto rueda vacía la flota"), usa get_fleet_empty_km.
- NUNCA calcules ni inventes dinero, km u horas: usa solo los números que regresan las herramientas, tal cual.
- La interfaz ya muestra tarjetas con el detalle de cada resultado. Tu respuesta final: máximo 2 frases y 40 palabras,
  con la mejor opción y cuánto le gana a regresar vacío, y un siguiente paso. No enumeres las demás opciones.
- Si usaste explain_recommendation, la explicación ya se muestra: no la repitas; agrega como mucho una frase.
- Español de México, directo, de tú, lenguaje de transportista. Texto plano, sin markdown, sin listas, sin emojis.`;
}

const FLEET_INTENT = /\b(flota|despach\w*|camiones|semana|km en vac[ií]o|rueda vac[ií]a)\b/i;

/** Deterministic agent used without an API key or when Claude fails: rules + the same tools. */
export async function runFallbackAgent(
  ctx: ServerContext,
  messages: AgentMessage[],
  emit: (e: AgentEvent) => void,
) {
  const userTexts = messages
    .filter((m) => m.role === "user" && typeof m.content === "string")
    .map((m) => m.content as string);
  const latest = userTexts.at(-1) ?? "";
  let reply: string;

  const call = async (name: string, input: Record<string, unknown>) => {
    const id = `fallback-${name}-${Date.now()}`;
    emit({ type: "tool_call", id, name, input });
    const data = await runTool(ctx, name, input);
    emit({ type: "tool_result", id, name, ok: true, data });
    return data;
  };

  if (FLEET_INTENT.test(latest)) {
    const data = (await call("get_fleet_empty_km", { days: 7 })) as {
      today: { empty_km_pct: number };
      with_retorno: { empty_km_pct: number };
      extra_net_mxn: number;
    };
    reply = `Esta semana la flota rueda vacía ${data.today.empty_km_pct}% de sus km. Siguiendo las recomendaciones bajaría a ${data.with_retorno.empty_km_pct}% y ganaría ${money(data.extra_net_mxn)} más.`;
  } else {
    // Rules read every user message, so answers to follow-up questions accumulate.
    const intent = parseTripRules(userTexts.join(". "), ctx.cities, ctx.now());
    const missing = missingFields(intent);
    if (missing[0]) {
      reply = FIELD_QUESTIONS[missing[0]];
    } else {
      const data = (await call("find_return_loads", {
        position: intent.unloadCityId,
        base: intent.baseCityId,
        unit_type: intent.unitType,
        available_at: intent.unloadAt,
        limit: 3,
      })) as { recommendations: Array<{ route: string; gain_vs_empty_mxn: number }> };
      const best = data.recommendations[0];
      reply = best
        ? `Tu mejor opción es ${best.route}: le ganas ${money(best.gain_vs_empty_mxn)} a regresar vacío. Abajo tienes las demás.`
        : "Hoy no encontré cargas que te convengan más que regresar vacío. Prueba con otra hora o unidad.";
    }
  }

  emit({ type: "text", text: reply });
  const finalMessages: AgentMessage[] = [...messages, { role: "assistant", content: reply }];
  emit({ type: "done", messages: finalMessages });
}

/** Run Claude with tools; fall back to the deterministic agent if it fails before saying anything. */
export async function runRetornoAgent(
  ctx: ServerContext,
  messages: AgentMessage[],
  emit: (e: AgentEvent) => void,
) {
  if (!ctx.agentLlm) return runFallbackAgent(ctx, messages, emit);

  let emitted = false;
  try {
    await runAgent({
      llm: ctx.agentLlm,
      system: systemPrompt(ctx.now()),
      messages,
      tools: agentTools(ctx),
      emit: (event) => {
        emitted = true;
        emit(event);
      },
    });
  } catch (error) {
    console.warn("[agent] claude failed", error instanceof Error ? error.message : error);
    if (!emitted) return runFallbackAgent(ctx, messages, emit);
    emit({ type: "text", text: "Se me cortó la señal. ¿Me lo repites?" });
    emit({ type: "done", messages });
  }
}

/** Keep the conversation bounded: drop whole old turns (a turn starts with a plain user message). */
export function trimHistory(messages: AgentMessage[], maxMessages = 24): AgentMessage[] {
  if (messages.length <= maxMessages) return messages;
  const starts = messages
    .map((m, i) => (m.role === "user" && typeof m.content === "string" ? i : -1))
    .filter((i) => i >= 0 && messages.length - i <= maxMessages);
  return messages.slice(starts[0] ?? messages.length - 1);
}
