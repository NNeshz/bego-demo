import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ApiRecommendation, ApiRecommendationsResponse } from "./types";
import { RetornoWidget } from "./widget";

beforeAll(() => {
  if (!customElements.get("retorno-widget")) customElements.define("retorno-widget", RetornoWidget);
  RetornoWidget.defaultApiBase = "https://retorno.example";
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const place = (cityId: string, name: string) => ({ cityId, name, lat: 0, lng: 0 });

function rec(id: string, overrides: Partial<ApiRecommendation> = {}): ApiRecommendation {
  return {
    load: {
      id,
      origin: place("nuevo-laredo", "Nuevo Laredo"),
      destination: place("puebla", "Puebla"),
      unitType: "dry_van_53",
      weightKg: 20_000,
      rateMxn: 38_100,
      commodity: "electrónicos",
      shipper: "Shipper",
    },
    deadheadKm: 0,
    loadedKm: 1_185,
    pickupArrival: "2026-11-17T16:00:00.000Z",
    totalHours: 24.8,
    returnHomeKm: 357,
    kmCloserToBase: 606,
    gainVsEmptyMxn: 26_750,
    scorePerHour: 1_081,
    breakdown: { netProfitMxn: 17_559, rateMxn: 38_100 },
    ...overrides,
  };
}

const response = (recommendations: ApiRecommendation[]): ApiRecommendationsResponse => ({
  recommendations,
  emptyReturn: { km: 963, hours: 16, costMxn: 14_612 },
  stats: { evaluated: 320, feasible: recommendations.length },
});

function mockFetch(
  handler: (url: string, init?: RequestInit) => { status?: number; body: unknown },
) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const { status = 200, body } = handler(url, init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

async function mount(attrs: Record<string, string>) {
  const el = document.createElement("retorno-widget") as RetornoWidget;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.append(el);
  await settle();
  return el;
}

/** Let microtasks, fetch and re-render complete. */
const settle = () =>
  new Promise((resolve) => setTimeout(resolve, 0)).then(() => new Promise((r) => setTimeout(r, 0)));
const shadow = (el: RetornoWidget) => el.shadowRoot!;
const trip = { position: "nuevo-laredo", base: "queretaro", "unit-type": "dry_van_53" };

describe("<retorno-widget>", () => {
  it("fetches recommendations from the API that served the script and renders cards", async () => {
    const calls = mockFetch(() => ({ body: response([rec("A"), rec("B")]) }));
    const el = await mount({ ...trip, limit: "2" });

    expect(calls[0]!.url).toBe("https://retorno.example/api/v1/recommendations");
    expect(calls[0]!.body).toMatchObject({
      truck: {
        unitType: "dry_van_53",
        position: { cityId: "nuevo-laredo" },
        base: { cityId: "queretaro" },
      },
      limit: 2,
      explain: false,
    });
    const cards = shadow(el).querySelectorAll(".card");
    expect(cards).toHaveLength(2);
    expect(cards[0]!.textContent).toContain("Nuevo Laredo → Puebla");
    expect(cards[0]!.textContent).toContain("+$26,750");
    expect(cards[0]!.hasAttribute("data-best")).toBe(true);
    expect(el.getAttribute("theme")).toBe("auto");
  });

  it("coalesces several attribute changes into a single request", async () => {
    const calls = mockFetch(() => ({ body: response([rec("A")]) }));
    const el = await mount(trip);
    el.setAttribute("position", "monterrey");
    el.setAttribute("base", "cdmx");
    el.setAttribute("unit-type", "reefer_53");
    await settle();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.body).toMatchObject({
      truck: { unitType: "reefer_53", position: { cityId: "monterrey" } },
    });
  });

  it("emits retorno-accept with the recommendation and records feedback", async () => {
    const calls = mockFetch((url) => ({
      body: url.endsWith("/events") ? {} : response([rec("A")]),
    }));
    const el = await mount(trip);
    const onAccept = vi.fn();
    document.body.addEventListener("retorno-accept", onAccept);

    (shadow(el).querySelector("[part=accept]") as HTMLButtonElement).click();
    await settle();

    expect(onAccept).toHaveBeenCalledOnce();
    expect(onAccept.mock.calls[0]![0].detail).toMatchObject({
      rank: 1,
      recommendation: { load: { id: "A" } },
    });
    expect(shadow(el).querySelector(".done")?.textContent).toContain("Aceptada");
    const feedback = calls.find((c) => c.url.endsWith("/api/v1/events"));
    expect(feedback?.body).toMatchObject({ action: "accepted", loadIds: ["A"], rank: 1 });
  });

  it("lets the host veto an accept with preventDefault()", async () => {
    const calls = mockFetch(() => ({ body: response([rec("A")]) }));
    const el = await mount(trip);
    el.addEventListener("retorno-accept", (event) => event.preventDefault());
    (shadow(el).querySelector("[part=accept]") as HTMLButtonElement).click();
    await settle();
    expect(shadow(el).querySelector(".done")).toBeNull();
    expect(calls.some((c) => c.url.endsWith("/events"))).toBe(false);
  });

  it("respects no-feedback", async () => {
    const calls = mockFetch(() => ({ body: response([rec("A")]) }));
    const el = await mount({ ...trip, "no-feedback": "" });
    (shadow(el).querySelector("[part=reject]") as HTMLButtonElement).click();
    await settle();
    expect(calls.some((c) => c.url.endsWith("/events"))).toBe(false);
    expect(shadow(el).textContent).toContain("Descartada");
  });

  it("never interprets API strings as HTML", async () => {
    mockFetch(() => ({
      body: response([
        rec("A", { explanation: { text: "<img src=x onerror=alert(1)>", source: "ai" } }),
      ]),
    }));
    const el = await mount({ ...trip, explain: "" });
    expect(shadow(el).querySelector("img")).toBeNull();
    expect(shadow(el).querySelector(".why")?.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("shows a form when the trip is incomplete, and searches on submit", async () => {
    const calls = mockFetch((url) => ({
      body: url.endsWith("/cities")
        ? {
            cities: [
              { id: "queretaro", name: "Querétaro" },
              { id: "monterrey", name: "Monterrey" },
            ],
          }
        : response([rec("A")]),
    }));
    const el = await mount({});
    expect(calls[0]!.url).toContain("/api/v1/cities");
    const form = shadow(el).querySelector("form")!;
    (form.querySelector("[name=position]") as HTMLSelectElement).value = "monterrey";
    (form.querySelector("[name=base]") as HTMLSelectElement).value = "queretaro";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await settle();
    expect(el.trip).toMatchObject({
      position: "monterrey",
      base: "queretaro",
      unitType: "dry_van_53",
    });
    expect(shadow(el).querySelectorAll(".card")).toHaveLength(1);
  });

  it("shows an error state, emits retorno-error and can retry", async () => {
    let fail = true;
    mockFetch(() =>
      fail
        ? { status: 400, body: { error: { message: "Unknown cityId" } } }
        : { body: response([rec("A")]) },
    );
    const onError = vi.fn();
    document.body.addEventListener("retorno-error", onError);
    const el = await mount(trip);
    expect(onError.mock.calls[0]![0].detail).toEqual({ message: "Unknown cityId", status: 400 });
    expect(shadow(el).querySelector("[role=alert]")).not.toBeNull();

    fail = false;
    (shadow(el).querySelector("[role=alert] button") as HTMLButtonElement).click();
    await settle();
    expect(shadow(el).querySelectorAll(".card")).toHaveLength(1);
  });

  it("explains an empty result instead of showing nothing", async () => {
    mockFetch(() => ({ body: response([]) }));
    const el = await mount(trip);
    expect(shadow(el).textContent).toContain("no hay cargas compatibles");
  });
});
