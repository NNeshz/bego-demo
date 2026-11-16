import { describe, expect, it } from "vitest";
import {
  runAgent,
  type AgentContentBlock,
  type AgentEvent,
  type AgentLlm,
  type AgentTool,
} from "./agent";

const echoTool: AgentTool = {
  name: "find_return_loads",
  description: "test",
  inputSchema: { type: "object" },
  run: async (input) => ({ got: input, gain_vs_empty_mxn: 26_750 }),
};

/** Scripted model: returns the queued responses in order and records what it saw. */
function scripted(...turns: Array<{ content: AgentContentBlock[]; stopReason: string }>) {
  const seen: number[] = [];
  const llm: AgentLlm = {
    next: async ({ messages }) => {
      seen.push(messages.length);
      const turn = turns.shift();
      if (!turn) throw new Error("no more turns");
      return turn;
    },
  };
  return { llm, seen };
}

describe("runAgent", () => {
  it("runs tools the model asks for and feeds results back", async () => {
    const { llm, seen } = scripted(
      {
        content: [
          { type: "text", text: "Déjame buscar." },
          {
            type: "tool_use",
            id: "t1",
            name: "find_return_loads",
            input: { position: "nuevo-laredo" },
          },
        ],
        stopReason: "tool_use",
      },
      {
        content: [{ type: "text", text: "Te conviene la de Puebla: +$26,750." }],
        stopReason: "end_turn",
      },
    );
    const events: AgentEvent[] = [];
    const messages = await runAgent({
      llm,
      system: "s",
      messages: [{ role: "user", content: "descargo en Laredo" }],
      tools: [echoTool],
      emit: (e) => events.push(e),
    });

    // The preamble next to the tool call ("Déjame buscar.") is not shown, only the final answer.
    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result", "text", "done"]);
    expect(events[1]).toMatchObject({ ok: true, data: { got: { position: "nuevo-laredo" } } });
    expect(events[2]).toEqual({ type: "text", text: "Te conviene la de Puebla: +$26,750." });
    // user → assistant(tool_use) → user(tool_result) → assistant(text)
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(seen).toEqual([1, 3]);
    expect((messages[2]!.content as AgentContentBlock[])[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "t1",
    });
  });

  it("reports tool failures to the model instead of crashing", async () => {
    const failing: AgentTool = {
      ...echoTool,
      run: async () => Promise.reject(new Error("position: invalid city")),
    };
    const { llm } = scripted(
      {
        content: [{ type: "tool_use", id: "t1", name: "find_return_loads", input: {} }],
        stopReason: "tool_use",
      },
      { content: [{ type: "text", text: "¿En qué ciudad descargas?" }], stopReason: "end_turn" },
    );
    const events: AgentEvent[] = [];
    const messages = await runAgent({
      llm,
      system: "s",
      messages: [],
      tools: [failing],
      emit: (e) => events.push(e),
    });
    expect(events[1]).toMatchObject({
      type: "tool_result",
      ok: false,
      error: "position: invalid city",
    });
    expect(events[2]).toEqual({ type: "text", text: "¿En qué ciudad descargas?" });
    expect((messages[1]!.content as AgentContentBlock[])[0]).toMatchObject({ is_error: true });
  });

  it("stops after maxSteps even if the model keeps calling tools", async () => {
    const loop = {
      content: [{ type: "tool_use" as const, id: "t", name: "find_return_loads", input: {} }],
      stopReason: "tool_use",
    };
    const { llm } = scripted(loop, loop, loop, loop);
    const events: AgentEvent[] = [];
    await runAgent({
      llm,
      system: "s",
      messages: [],
      tools: [echoTool],
      emit: (e) => events.push(e),
      maxSteps: 2,
    });
    expect(events.filter((e) => e.type === "tool_call")).toHaveLength(2);
    expect(events.at(-1)?.type).toBe("done");
  });
});
