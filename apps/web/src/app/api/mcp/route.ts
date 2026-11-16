import { clientKey, enforceRateLimit, errorResponse } from "@/server/api/http";
import { getContext } from "@/server/context";
import { handleMcpRequest } from "@/server/mcp";

/** MCP endpoint (Streamable HTTP, stateless, read-only tools). */
async function handle(request: Request): Promise<Response> {
  try {
    const ctx = getContext();
    // Only tool calls count against the per-client budget (they can hit the AI);
    // handshakes and tools/list are cheap and a single session sends several.
    if (request.method === "POST" && (await request.clone().text()).includes('"tools/call"')) {
      enforceRateLimit(ctx.clientLimiter.tryTake(`mcp:${clientKey(request)}`));
    }
    return await handleMcpRequest(ctx, request);
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = handle;

/**
 * Stateless server: no standalone SSE stream (GET) and no sessions to end (DELETE).
 * The spec allows 405 here; it also avoids long-lived connections on serverless.
 */
function methodNotAllowed(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed. Use POST." },
      id: null,
    }),
    { status: 405, headers: { Allow: "POST", "Content-Type": "application/json" } },
  );
}
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
