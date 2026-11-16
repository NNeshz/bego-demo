/**
 * Protocol-level tests: the official MCP client talks to our route handler
 * through an in-process fetch, exactly like Claude Desktop or the Inspector would.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createAiService, RateLimiter } from "@retorno/ai";
import { CITIES, createMemorySource } from "@retorno/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "@/app/api/mcp/route";
import { setContextForTests } from "./context";

const NOW = new Date("2026-11-16T16:00:00.000Z");
const now = () => NOW;

const routeFetch = async (input: string | URL | Request, init?: RequestInit) => {
  const request = new Request(input, init);
  const handler = { GET, POST, DELETE }[request.method as "GET" | "POST" | "DELETE"];
  return handler ? handler(request) : new Response(null, { status: 405 });
};

let client: Client;

beforeEach(async () => {
  setContextForTests({
    data: createMemorySource({ now }),
    ai: createAiService({ cities: CITIES, now }),
    cities: CITIES,
    now,
    clientLimiter: new RateLimiter({ capacity: 100, refillPerMinute: 0 }),
  });
  client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), { fetch: routeFetch }),
  );
});

afterEach(async () => {
  await client.close();
});

const trip = {
  position: "nuevo-laredo",
  base: "queretaro",
  unit_type: "dry_van_53",
  available_at: "2026-11-17T10:00:00-06:00",
};

describe("MCP server", () => {
  it("advertises itself and its read-only tools", async () => {
    expect(client.getServerVersion()).toMatchObject({ name: "retorno" });
    expect(client.getInstructions()).toMatch(/not affiliated with BeGo/);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "explain_recommendation",
      "find_return_loads",
      "get_fleet_empty_km",
      "plan_load_chain",
    ]);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.inputSchema.type).toBe("object");
    }
    const find = tools.find((t) => t.name === "find_return_loads")!;
    expect(find.inputSchema.required).toEqual(
      expect.arrayContaining(["position", "base", "unit_type"]),
    );
  });

  it("find_return_loads returns engine numbers as structured content", async () => {
    const result = await client.callTool({
      name: "find_return_loads",
      arguments: { ...trip, limit: 2 },
    });
    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as {
      recommendations: Array<{ rank: number; gain_vs_empty_mxn: number }>;
      empty_return: { km: number };
    };
    expect(data.recommendations).toHaveLength(2);
    expect(data.recommendations[0]!.gain_vs_empty_mxn).toBeGreaterThan(0);
    expect(data.empty_return.km).toBeGreaterThan(800);
    // Text content mirrors the structured data for clients that only read text.
    expect(JSON.parse((result.content as Array<{ text: string }>)[0]!.text)).toEqual(data);
  });

  it("explain_recommendation explains a load from find_return_loads", async () => {
    const found = await client.callTool({
      name: "find_return_loads",
      arguments: { ...trip, limit: 1 },
    });
    const loadId = (found.structuredContent as { recommendations: Array<{ load_id: string }> })
      .recommendations[0]!.load_id;
    const result = await client.callTool({
      name: "explain_recommendation",
      arguments: { ...trip, load_id: loadId },
    });
    expect(result.structuredContent).toMatchObject({
      load_id: loadId,
      available: true,
      explanation_source: "template",
    });
    expect((result.structuredContent as { explanation: string }).explanation).toMatch(
      /^Te conviene porque/,
    );
  });

  it("plan_load_chain and get_fleet_empty_km work", async () => {
    const chains = await client.callTool({ name: "plan_load_chain", arguments: trip });
    expect((chains.structuredContent as { chains: unknown[] }).chains.length).toBeGreaterThan(0);

    const fleet = await client.callTool({ name: "get_fleet_empty_km", arguments: { days: 3 } });
    const report = fleet.structuredContent as {
      today: { empty_km_pct: number };
      with_retorno: { empty_km_pct: number };
      top_empty_corridors_today: unknown[];
    };
    expect(report.with_retorno.empty_km_pct).toBeLessThan(report.today.empty_km_pct);
    expect(report.top_empty_corridors_today.length).toBeGreaterThan(0);
  });

  it("rejects invalid arguments so the model can correct itself", async () => {
    const result = await client.callTool({
      name: "find_return_loads",
      arguments: { ...trip, position: "atlantis" },
    });
    expect(result.isError).toBe(true);
  });

  it("hides internal errors from the model", async () => {
    const broken = createMemorySource({ now });
    broken.listLoads = () => Promise.reject(new Error("secret connection string"));
    setContextForTests({
      data: broken,
      ai: createAiService({ cities: CITIES, now }),
      cities: CITIES,
      now,
      clientLimiter: new RateLimiter({ capacity: 100, refillPerMinute: 0 }),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await client.callTool({ name: "find_return_loads", arguments: trip });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).not.toContain("secret");
  });
});

describe("MCP transport", () => {
  it("rejects GET and DELETE with 405 (stateless: no SSE stream, no sessions)", async () => {
    for (const method of ["GET", "DELETE"] as const) {
      const response = await routeFetch("http://localhost/api/mcp", {
        method,
        headers: { accept: "text/event-stream" },
      });
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("POST");
    }
  });
});
