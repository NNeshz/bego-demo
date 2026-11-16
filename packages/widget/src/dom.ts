type Child = Node | string | number | null | undefined | false;

/**
 * Tiny element factory. Text children always go through text nodes, never
 * innerHTML, so data from the API can't inject markup into the host page.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string | number | boolean | EventListener | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      el.setAttribute(key, "");
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === "object" ? child : document.createTextNode(String(child)));
  }
  return el;
}

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});
const int = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });

export const money = (v: number) => mxn.format(Math.round(v));
export const signedMoney = (v: number) => {
  const r = Math.round(v);
  return r === 0 ? mxn.format(0) : `${r > 0 ? "+" : "−"}${mxn.format(Math.abs(r))}`;
};
export const km = (v: number) => `${int.format(Math.round(v))} km`;
export const hours = (v: number) =>
  v >= 24 ? `${(v / 24).toFixed(1).replace(/\.0$/, "")} días` : `${Math.round(v)} h`;

const when = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
export const pickupTime = (iso: string) => when.format(new Date(iso)).replace(/\./g, "");
