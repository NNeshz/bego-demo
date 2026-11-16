import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { API_VERSION } from "./api/openapi";
import type { ServerContext } from "./context";
import { runTool, TOOLS, ToolInputError } from "./tools";

const INSTRUCTIONS = `Retorno helps Mexican owner-operator truckers avoid driving home empty.
Unofficial concept by Neftalí Hernández, not affiliated with BeGo. All data is synthetic.
Workflow: find_return_loads → (optionally) explain_recommendation for the top pick → plan_load_chain if no single load gets the trucker home.
Money values are computed by the engine in MXN; report them as-is, never recompute them.`;

function createServer(ctx: ServerContext): McpServer {
  const server = new McpServer(
    { name: "retorno", title: "Retorno", version: API_VERSION },
    { instructions: INSTRUCTIONS },
  );
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.shape,
        annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
      },
      async (input: unknown) => {
        try {
          const result = await runTool(ctx, tool.name, input);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
            structuredContent: result,
          };
        } catch (error) {
          // Tool errors go back to the model (isError) so it can correct itself, instead of failing the request.
          const message =
            error instanceof ToolInputError
              ? error.message
              : "Internal error while running the tool.";
          if (!(error instanceof ToolInputError)) console.error(`[mcp] ${tool.name} failed`, error);
          return { content: [{ type: "text" as const, text: message }], isError: true };
        }
      },
    );
  }
  return server;
}

/**
 * Stateless Streamable HTTP: a fresh server + transport per request, JSON
 * responses (no SSE). Nothing lives in memory between requests, which is what
 * serverless platforms need.
 */
export async function handleMcpRequest(ctx: ServerContext, request: Request): Promise<Response> {
  const server = createServer(ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
