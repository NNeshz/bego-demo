/**
 * Minimal tool-use agent loop: the model asks for tools, we run them, feed the
 * results back, repeat until it answers. Provider details live behind
 * `AgentLlm`, so tests (and other providers) can plug in.
 */
import Anthropic from "@anthropic-ai/sdk";
import { withTimeout } from "./util";

export type AgentContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface AgentMessage {
  role: "user" | "assistant";
  content: string | AgentContentBlock[];
}

export interface AgentTool {
  name: string;
  description: string;
  /** JSON Schema for the input (type: "object"). */
  inputSchema: Record<string, unknown>;
  run(input: unknown): Promise<unknown>;
}

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; ok: true; data: unknown }
  | { type: "tool_result"; id: string; name: string; ok: false; error: string }
  | { type: "done"; messages: AgentMessage[] };

export interface AgentLlm {
  next(
    request: { system: string; messages: AgentMessage[]; tools: AgentTool[] },
    signal: AbortSignal,
  ): Promise<{ content: AgentContentBlock[]; stopReason: string | null }>;
}

export interface RunAgentOptions {
  llm: AgentLlm;
  system: string;
  messages: AgentMessage[];
  tools: AgentTool[];
  emit: (event: AgentEvent) => void;
  /** Model round-trips before giving up. Default 6. */
  maxSteps?: number;
  /** Per model call. Default 25 s. */
  timeoutMs?: number;
}

export async function runAgent(options: RunAgentOptions): Promise<AgentMessage[]> {
  const { llm, system, tools, emit } = options;
  const messages = [...options.messages];
  const maxSteps = options.maxSteps ?? 6;

  for (let step = 0; step < maxSteps; step++) {
    const response = await withTimeout(
      (signal) => llm.next({ system, messages, tools }, signal),
      options.timeoutMs ?? 25_000,
    );
    messages.push({ role: "assistant", content: response.content });

    const calls = response.content.filter(
      (b): b is Extract<AgentContentBlock, { type: "tool_use" }> => b.type === "tool_use",
    );
    const final = calls.length === 0 || response.stopReason !== "tool_use";

    // Text next to a tool call is the model thinking out loud ("let me check…"):
    // kept in history, not shown. Only final answers reach the user.
    if (final) {
      for (const block of response.content) {
        if (block.type === "text" && block.text.trim())
          emit({ type: "text", text: block.text.trim() });
      }
      break;
    }

    const results: AgentContentBlock[] = [];
    for (const call of calls) {
      emit({ type: "tool_call", id: call.id, name: call.name, input: call.input });
      const tool = tools.find((t) => t.name === call.name);
      try {
        if (!tool) throw new Error(`Unknown tool: ${call.name}`);
        const data = await tool.run(call.input);
        emit({ type: "tool_result", id: call.id, name: call.name, ok: true, data });
        results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(data) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Tool failed";
        emit({ type: "tool_result", id: call.id, name: call.name, ok: false, error: message });
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: message,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: results });
  }

  emit({ type: "done", messages });
  return messages;
}

/** Claude implementation of AgentLlm (tool use, thinking off for snappy turns). */
export function createAnthropicAgentLlm({
  apiKey,
  model,
}: {
  apiKey: string;
  model: string;
}): AgentLlm {
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  return {
    async next({ system, messages, tools }, signal) {
      const response = await client.messages.create(
        {
          model,
          max_tokens: 1_024,
          thinking: { type: "disabled" },
          system,
          messages: messages as Anthropic.MessageParam[],
          tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
          })),
        },
        { signal },
      );
      const content = response.content.flatMap((block): AgentContentBlock[] => {
        if (block.type === "text") return [{ type: "text", text: block.text }];
        if (block.type === "tool_use")
          return [{ type: "tool_use", id: block.id, name: block.name, input: block.input }];
        return []; // other block types are not used by this agent
      });
      return { content, stopReason: response.stop_reason };
    },
  };
}
