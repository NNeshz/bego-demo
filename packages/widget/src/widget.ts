import { h, hours, km, money, pickupTime, signedMoney } from "./dom";
import { STYLES } from "./styles";
import type {
  AcceptDetail,
  ApiCity,
  ApiRecommendation,
  ApiRecommendationsResponse,
  ErrorDetail,
  LoadDetail,
  TripInput,
  UnitType,
} from "./types";

declare const __WIDGET_VERSION__: string;
export const VERSION = __WIDGET_VERSION__;

const UNIT_LABELS: Record<UnitType, string> = {
  dry_van_53: "Caja seca 53'",
  reefer_53: "Refrigerada 53'",
  flatbed_48: "Plataforma 48'",
  full_double: "Full",
  torton: "Torton",
};
const UNIT_TYPES = Object.keys(UNIT_LABELS) as UnitType[];

type View =
  | { kind: "form"; cities: ApiCity[] | null }
  | { kind: "loading" }
  | { kind: "ready"; data: ApiRecommendationsResponse; trip: TripInput }
  | { kind: "error"; message: string };

/**
 * <retorno-widget position="nuevo-laredo" base="queretaro" unit-type="dry_van_53"></retorno-widget>
 *
 * Attributes: position, base, unit-type, available-at (ISO), limit (1–10, default 3),
 *   explain (adds an AI sentence per load), theme (light | dark | auto),
 *   api-base (defaults to the origin that served widget.js), no-feedback.
 * Events (bubble, composed): retorno-load, retorno-accept, retorno-reject, retorno-error.
 *   `retorno-accept` is cancelable: call preventDefault() to keep the card un-accepted
 *   (e.g. if your own booking flow fails).
 * API: `el.refresh()`, `el.trip` (read-only).
 */
export class RetornoWidget extends HTMLElement {
  static observedAttributes = [
    "position",
    "base",
    "unit-type",
    "available-at",
    "limit",
    "explain",
    "api-base",
  ];
  /** Set by register.ts from document.currentScript, so cross-origin embeds call the right API. */
  static defaultApiBase = "";

  readonly #root: ShadowRoot;
  #view: View = { kind: "loading" };
  #decisions = new Map<string, "accepted" | "rejected">();
  #abort: AbortController | null = null;
  #scheduled = false;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (!this.hasAttribute("theme")) this.setAttribute("theme", "auto");
    this.#schedule();
  }

  disconnectedCallback() {
    this.#abort?.abort();
  }

  attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue !== newValue && this.isConnected) this.#schedule();
  }

  /** Reload recommendations with the current attributes. */
  refresh(): Promise<void> {
    return this.#load();
  }

  get trip(): TripInput | null {
    const position = this.getAttribute("position");
    const base = this.getAttribute("base");
    const unitType = this.getAttribute("unit-type") as UnitType | null;
    if (!position || !base || !unitType || !UNIT_TYPES.includes(unitType)) return null;
    return {
      position,
      base,
      unitType,
      availableAt: this.getAttribute("available-at") ?? undefined,
    };
  }

  get #apiBase(): string {
    return (this.getAttribute("api-base") ?? RetornoWidget.defaultApiBase ?? "").replace(/\/$/, "");
  }

  get #limit(): number {
    const n = Number(this.getAttribute("limit") ?? 3);
    return Number.isFinite(n) ? Math.min(10, Math.max(1, Math.round(n))) : 3;
  }

  /** Several attributes often change together: coalesce them into one request. */
  #schedule() {
    if (this.#scheduled) return;
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      void this.#load();
    });
  }

  async #load(): Promise<void> {
    this.#abort?.abort();
    const controller = new AbortController();
    this.#abort = controller;
    const trip = this.trip;

    if (!trip) {
      this.#set({ kind: "form", cities: null });
      try {
        const res = await fetch(`${this.#apiBase}/api/v1/cities`, { signal: controller.signal });
        const { cities } = (await res.json()) as { cities: ApiCity[] };
        if (!controller.signal.aborted) this.#set({ kind: "form", cities });
      } catch (error) {
        if (!controller.signal.aborted) this.#fail(error);
      }
      return;
    }

    this.#set({ kind: "loading" });
    this.#decisions.clear();
    try {
      const res = await fetch(`${this.#apiBase}/api/v1/recommendations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          truck: {
            unitType: trip.unitType,
            position: { cityId: trip.position },
            base: { cityId: trip.base },
            ...(trip.availableAt ? { availableAt: trip.availableAt } : {}),
          },
          limit: this.#limit,
          explain: this.hasAttribute("explain"),
        }),
      });
      const body = (await res.json()) as ApiRecommendationsResponse & {
        error?: { message: string };
      };
      if (!res.ok)
        throw Object.assign(new Error(body.error?.message ?? `HTTP ${res.status}`), {
          status: res.status,
        });
      if (controller.signal.aborted) return;
      this.#set({ kind: "ready", data: body, trip });
      this.#emit<LoadDetail>("retorno-load", { count: body.recommendations.length, trip });
    } catch (error) {
      if (!controller.signal.aborted) this.#fail(error);
    }
  }

  #fail(error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    const status = (error as { status?: number }).status;
    this.#set({ kind: "error", message });
    this.#emit<ErrorDetail>("retorno-error", { message, ...(status ? { status } : {}) });
  }

  #emit<T>(type: string, detail: T, cancelable = false): boolean {
    return this.dispatchEvent(
      new CustomEvent<T>(type, { detail, bubbles: true, composed: true, cancelable }),
    );
  }

  #decide(
    action: "accepted" | "rejected",
    recommendation: ApiRecommendation,
    rank: number,
    trip: TripInput,
  ) {
    const detail: AcceptDetail = { recommendation, rank, trip };
    const proceed = this.#emit(
      action === "accepted" ? "retorno-accept" : "retorno-reject",
      detail,
      action === "accepted",
    );
    if (!proceed) return;
    this.#decisions.set(recommendation.load.id, action);
    this.#render();
    if (!this.hasAttribute("no-feedback")) {
      void fetch(`${this.#apiBase}/api/v1/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          action,
          loadIds: [recommendation.load.id],
          rank,
          scorePerHour: recommendation.scorePerHour,
          gainVsEmptyMxn: recommendation.gainVsEmptyMxn,
          features: {
            deadheadKm: recommendation.deadheadKm,
            loadedKm: recommendation.loadedKm,
            totalHours: recommendation.totalHours,
            kmCloserToBase: recommendation.kmCloserToBase,
            source: 1, // 1 = embedded widget
          },
        }),
      })
        // Discard the body: an unread response keeps the request open until garbage collection.
        .then((response) => response.body?.cancel())
        .catch(() => {});
    }
  }

  #set(view: View) {
    this.#view = view;
    this.#render();
  }

  #render() {
    const view = this.#view;
    const root = h("div", { class: "root", part: "root" });

    if (view.kind === "form") root.append(...this.#renderForm(view.cities));
    if (view.kind === "loading") {
      root.append(
        h("div", { class: "head" }, h("p", { class: "title" }, "Buscando cargas de regreso…")),
        h("div", { class: "skeleton", "aria-hidden": "true" }),
        h("div", { class: "skeleton", "aria-hidden": "true" }),
      );
      root.setAttribute("aria-busy", "true");
    }
    if (view.kind === "error") {
      root.append(
        h(
          "div",
          { class: "state", role: "alert" },
          "No pudimos cargar las recomendaciones.",
          h(
            "button",
            { class: "btn", type: "button", onclick: () => void this.#load() },
            "Reintentar",
          ),
        ),
      );
    }
    if (view.kind === "ready") root.append(...this.#renderResults(view.data, view.trip));

    root.append(h("div", { class: "foot" }, "Retorno · concepto no oficial"));
    this.#root.replaceChildren(h("style", {}, STYLES), root);
  }

  #renderResults(data: ApiRecommendationsResponse, trip: TripInput): Node[] {
    const first = data.recommendations[0];
    const head = h(
      "div",
      { class: "head" },
      h("p", { class: "title" }, "Cargas de regreso"),
      h(
        "p",
        { class: "sub" },
        `${UNIT_LABELS[trip.unitType]} · ${data.stats.feasible} te convienen`,
      ),
    );
    const baseline = h(
      "div",
      { class: "baseline" },
      h("span", {}, "Si regresas vacío"),
      h("span", {}, `${km(data.emptyReturn.km)} · −${money(data.emptyReturn.costMxn)}`),
    );
    if (!first) {
      return [
        head,
        h(
          "div",
          { class: "state" },
          "Hoy no hay cargas compatibles que te convengan más que regresar vacío.",
        ),
      ];
    }
    const list = h("ol", { class: "list", "aria-label": "Recomendaciones" });
    data.recommendations.forEach((rec, i) => list.append(this.#renderCard(rec, i + 1, trip)));
    return [head, baseline, list];
  }

  #renderCard(rec: ApiRecommendation, rank: number, trip: TripInput): HTMLElement {
    const decision = this.#decisions.get(rec.load.id);
    const chips = h("div", { class: "chips" });
    chips.append(
      h(
        "span",
        { class: "chip" },
        rec.deadheadKm < 5 ? "Sale de donde descargas" : `${km(rec.deadheadKm)} vacío`,
      ),
    );
    if (rec.kmCloserToBase > 20) {
      chips.append(
        h(
          "span",
          { class: "chip" },
          rec.returnHomeKm < 30 ? "Termina en tu base" : `Te acerca ${km(rec.kmCloserToBase)}`,
        ),
      );
    }
    chips.append(h("span", { class: "chip" }, hours(rec.totalHours)));

    const actions =
      decision === "accepted"
        ? h("p", { class: "done", role: "status" }, "✓ Aceptada")
        : decision === "rejected"
          ? h("p", { class: "meta", role: "status" }, "Descartada")
          : h(
              "div",
              { class: "actions" },
              h(
                "button",
                {
                  class: "btn btn-primary",
                  type: "button",
                  part: "accept",
                  onclick: () => this.#decide("accepted", rec, rank, trip),
                },
                "Aceptar",
              ),
              h(
                "button",
                {
                  class: "btn",
                  type: "button",
                  part: "reject",
                  onclick: () => this.#decide("rejected", rec, rank, trip),
                },
                "No me interesa",
              ),
            );

    return h(
      "li",
      { class: "card", part: "card", "data-best": rank === 1, "data-load-id": rec.load.id },
      h(
        "div",
        { class: "row" },
        h(
          "span",
          { class: "route", title: `${rec.load.origin.name} → ${rec.load.destination.name}` },
          `${rec.load.origin.name} → ${rec.load.destination.name}`,
        ),
        rank === 1 && h("span", { class: "badge" }, "Mejor"),
      ),
      h(
        "span",
        { class: "meta" },
        `${rec.load.commodity} · recoge ${pickupTime(rec.pickupArrival)} · ${money(rec.load.rateMxn)}`,
      ),
      h(
        "div",
        { class: "gain" },
        signedMoney(rec.gainVsEmptyMxn),
        h("small", {}, "vs. regresar vacío"),
      ),
      chips,
      rec.explanation && h("p", { class: "why" }, rec.explanation.text),
      actions,
    );
  }

  #renderForm(cities: ApiCity[] | null): Node[] {
    const sorted = [...(cities ?? [])].sort((a, b) => a.name.localeCompare(b.name, "es"));
    const citySelect = (name: string, label: string, value: string | null) => {
      const select = h("select", { name, required: true, disabled: !cities });
      select.append(h("option", { value: "" }, cities ? "Elige…" : "Cargando…"));
      for (const city of sorted) {
        const option = h("option", { value: city.id }, city.name);
        if (city.id === value) option.selected = true;
        select.append(option);
      }
      return h("label", {}, label, select);
    };
    const unitSelect = h("select", { name: "unit-type", required: true });
    for (const unit of UNIT_TYPES) {
      const option = h("option", { value: unit }, UNIT_LABELS[unit]);
      if (unit === this.getAttribute("unit-type")) option.selected = true;
      unitSelect.append(option);
    }
    const form = h(
      "form",
      {
        onsubmit: (event: Event) => {
          event.preventDefault();
          const data = new FormData(event.target as HTMLFormElement);
          for (const name of ["position", "base", "unit-type"])
            this.setAttribute(name, String(data.get(name) ?? ""));
        },
      },
      citySelect("position", "Descargas en", this.getAttribute("position")),
      citySelect("base", "Tu base", this.getAttribute("base")),
      h("label", {}, "Unidad", unitSelect),
      h("button", { class: "btn btn-primary", type: "submit", disabled: !cities }, "Buscar"),
    );
    return [h("div", { class: "head" }, h("p", { class: "title" }, "¿Dónde descargas?")), form];
  }
}
