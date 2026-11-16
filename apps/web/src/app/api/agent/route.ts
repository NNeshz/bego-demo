import type { AgentEvent, AgentMessage } from "@retorno/ai";
import { z } from "zod";
import { ApiError, clientKey, enforceRateLimit, errorResponse, readJson } from "@/server/api/http";
import { runRetornoAgent, trimHistory } from "@/server/agent";
import { getContext } from "@/server/context";

const Block = z.record(z.string(), z.unknown());
const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.union([z.string().max(4_000), z.array(Block).max(20)]),
      }),
    )
    .min(1)
    .max(60),
});

/**
 * In-app agent. Streams NDJSON events (text, tool_call, tool_result, done)
 * so the UI can show each tool as it runs. Not part of the public API v1.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = getContext();
    const { messages } = await readJson(request, Body, 256 * 1024);
    const last = messages.at(-1)!;
    if (last.role !== "user" || typeof last.content !== "string" || !last.content.trim()) {
      throw new ApiError(
        400,
        "invalid_request",
        "The last message must be a non-empty user message.",
      );
    }
    enforceRateLimit(ctx.clientLimiter.tryTake(`agent:${clientKey(request)}`));

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: AgentEvent | { type: "error"; message: string }) =>
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        try {
          await runRetornoAgent(ctx, trimHistory(messages as AgentMessage[]), emit);
        } catch (error) {
          console.error("[agent] failed", error);
          emit({ type: "error", message: "No pude completar la respuesta. Intenta de nuevo." });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
