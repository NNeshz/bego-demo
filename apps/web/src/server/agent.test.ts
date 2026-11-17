import { createAiService, RateLimiter, type AgentLlm } from "@retorno/ai";
import { CITIES, createMemorySource } from "@retorno/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/agent/route";
import { trimHistory } from "./agent";
import { setContextForTests } from "./context";
import { createWeightsProvider } from "./learned-weights";

const NOW = new Date("2026-11-16T16:00:00.000Z");
const now = () => NOW;

function useContext(agentLlm?: AgentLlm) {
  setContextForTests({
    data: createMemorySource({ now }),
    ai: createAiService({ cities: CITIES, now }),
    cities: CITIES,
    now,
    clientLimiter: new RateLimiter({ capacity: 100, refillPerMinute: 0 }),
    weights: createWeightsProvider({}),
    agentLlm,
  });
}

beforeEach(() => useContext());

async function ask(messages: Array<{ role: "user" | "assistant"; content: unknown }>) {
  const response = await POST(
    new Request("http://localhost/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
    }),
  );
  const text = await response.text();
  return {
    status: response.status,
    events: text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l)),
  };
}

describe("POST /api/agent · fallback (no API key)", () => {
  it("asks for what's missing", async () => {
    const { status, events } = await ask([
      { role: "user", content: "descargo en Laredo mañana a las 10" },
    ]);
    expect(status).toBe(200);
    expect(events.find((e) => e.type === "text").text).toMatch(/unidad/);
    expect(events.at(-1).type).toBe("done");
  });

  it("accumulates answers and calls find_return_loads", async () => {
    const first = await ask([
      { role: "user", content: "descargo en Laredo mañana a las 10 con caja seca" },
    ]);
    const history = first.events.at(-1).messages;
    const { events } = await ask([...history, { role: "user", content: "mi base es Querétaro" }]);
    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result", "text", "done"]);
    expect(events[0]).toMatchObject({
      name: "find_return_loads",
      input: { position: "nuevo-laredo", base: "queretaro" },
    });
    expect(events[1].data.recommendations.length).toBeGreaterThan(0);
    expect(events[2].text).toMatch(/le ganas \$[\d,]+ a regresar vacío/);
  });

  it("answers fleet questions with get_fleet_empty_km", async () => {
    const { events } = await ask([
      { role: "user", content: "¿Cuánto rueda vacía la flota esta semana?" },
    ]);
    expect(events[0]).toMatchObject({ type: "tool_call", name: "get_fleet_empty_km" });
    expect(events[2].text).toMatch(/%/);
  });
});

describe("POST /api/agent · with a model", () => {
  it("streams tool calls chosen by the model and its final answer", async () => {
    let turn = 0;
    useContext({
      next: async () =>
        turn++ === 0
          ? {
              content: [
                {
                  type: "tool_use",
                  id: "t1",
                  name: "find_return_loads",
                  input: { position: "nuevo-laredo", base: "queretaro", unit_type: "dry_van_53" },
                },
              ],
              stopReason: "tool_use",
            }
          : { content: [{ type: "text", text: "La mejor es Puebla." }], stopReason: "end_turn" },
    });
    const { events } = await ask([{ role: "user", content: "Laredo, caja seca, base Querétaro" }]);
    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result", "text", "done"]);
    expect(events[1].ok).toBe(true);
    expect(events.at(-1).messages).toHaveLength(4);
  });

  it("falls back to rules when the model fails before answering", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    useContext({ next: async () => Promise.reject(new Error("529 overloaded")) });
    const { events } = await ask([
      { role: "user", content: "Descargo en Laredo mañana a las 10, caja seca, base Querétaro" },
    ]);
    expect(events[0]).toMatchObject({ type: "tool_call", name: "find_return_loads" });
    expect(events.at(-1).type).toBe("done");
  });

  it("rejects a conversation that doesn't end with a user message", async () => {
    const { status } = await ask([{ role: "assistant", content: "hola" }]);
    expect(status).toBe(400);
  });
});

describe("trimHistory", () => {
  it("drops whole old turns, never splitting a tool call from its result", () => {
    const turn = (n: number) => [
      { role: "user" as const, content: `q${n}` },
      {
        role: "assistant" as const,
        content: [{ type: "tool_use" as const, id: `t${n}`, name: "x", input: {} }],
      },
      {
        role: "user" as const,
        content: [{ type: "tool_result" as const, tool_use_id: `t${n}`, content: "{}" }],
      },
      { role: "assistant" as const, content: `a${n}` },
    ];
    const history = [1, 2, 3, 4, 5, 6, 7].flatMap(turn);
    const trimmed = trimHistory(history, 10);
    expect(trimmed[0]).toEqual({ role: "user", content: "q6" });
    expect(trimmed).toHaveLength(8);
  });
});
