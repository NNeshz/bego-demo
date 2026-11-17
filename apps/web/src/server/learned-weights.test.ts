import { DEFAULT_WEIGHTS } from "@retorno/engine";
import { describe, expect, it, vi } from "vitest";
import { createWeightsProvider } from "./learned-weights";

const learned = { home: 2.4, deadheadPenaltyMxnPerKm: 4.6, waitPenaltyMxnPerHour: 168 };

function fakeFetch(handler: (url: string) => Response | Promise<Response>) {
  return vi.fn(async (input: string | URL | Request) =>
    handler(String(input)),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("createWeightsProvider", () => {
  it("uses defaults without a configured service (and never calls the network)", async () => {
    const fetch = fakeFetch(() => Response.json({}));
    const provider = createWeightsProvider({ fetch });
    expect(await provider.get("U-1")).toEqual({
      weights: DEFAULT_WEIGHTS,
      source: { kind: "default", reason: "not_configured" },
    });
    expect(provider.enabled).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns personal weights and caches them", async () => {
    const fetch = fakeFetch(() =>
      Response.json({ version: 3, scope: "trucker", weights: learned }),
    );
    const provider = createWeightsProvider({ baseUrl: "http://ml", fetch });
    const first = await provider.get("sim-casa-1");
    await provider.get("sim-casa-1");
    expect(first).toEqual({
      weights: learned,
      source: { kind: "learned", version: 3, scope: "trucker" },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe("http://ml/weights?truck_id=sim-casa-1");
  });

  it("falls back to defaults when there is no published model", async () => {
    const provider = createWeightsProvider({
      baseUrl: "http://ml",
      fetch: fakeFetch(() => new Response(null, { status: 404 })),
    });
    expect((await provider.get()).source).toEqual({ kind: "default", reason: "no_model" });
  });

  it("falls back when the service is down, slow or returns garbage, and backs off", async () => {
    let t = 0;
    const down = fakeFetch(() => Promise.reject(new TypeError("fetch failed")));
    const provider = createWeightsProvider({
      baseUrl: "http://ml",
      fetch: down,
      now: () => t,
      failureTtlMs: 1_000,
    });
    expect((await provider.get()).source).toEqual({ kind: "default", reason: "unavailable" });
    await provider.get();
    expect(down).toHaveBeenCalledTimes(1); // backing off
    t = 2_000;
    await provider.get();
    expect(down).toHaveBeenCalledTimes(2);

    const garbage = createWeightsProvider({
      baseUrl: "http://ml",
      fetch: fakeFetch(() =>
        Response.json({ version: 1, scope: "global", weights: { home: 999 } }),
      ),
    });
    expect((await garbage.get()).source).toEqual({ kind: "default", reason: "unavailable" });

    const slow = createWeightsProvider({
      baseUrl: "http://ml",
      timeoutMs: 20,
      fetch: ((_: string, init?: RequestInit) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)),
        )) as typeof fetch,
    });
    expect((await slow.get()).source).toEqual({ kind: "default", reason: "unavailable" });
  });
});
