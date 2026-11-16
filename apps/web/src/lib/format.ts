/** Display formatting. Always Mexico City time and Mexican Spanish conventions. */

const TZ = "America/Mexico_City";

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});
const integer = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

export const money = (value: number) => mxn.format(Math.round(value));
export function signedMoney(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return mxn.format(0);
  return `${rounded > 0 ? "+" : "−"}${mxn.format(Math.abs(rounded))}`;
}
export const km = (value: number) => `${integer.format(Math.round(value))} km`;
export const tons = (kg: number) => `${oneDecimal.format(kg / 1000)} t`;

export function hours(value: number): string {
  if (value < 1) return `${Math.max(1, Math.round(value * 60))} min`;
  const h = Math.floor(value);
  const m = Math.round((value - h) * 60);
  if (h >= 24) {
    const days = oneDecimal.format(value / 24);
    return days === "1" ? "1 día" : `${days} días`;
  }
  return m >= 5 && h < 10 ? `${h} h ${m} min` : `${Math.round(value)} h`;
}

const dayTime = new Intl.DateTimeFormat("es-MX", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const timeOnly = new Intl.DateTimeFormat("es-MX", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dayKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "hoy 10:00", "mañana 14:30" or "jue 19 nov, 09:00". */
export function when(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const days = Math.round(
    (Date.parse(dayKey.format(date)) - Date.parse(dayKey.format(now))) / 86_400_000,
  );
  if (days === 0) return `hoy ${timeOnly.format(date)}`;
  if (days === 1) return `mañana ${timeOnly.format(date)}`;
  return dayTime.format(date).replace(/\./g, "");
}

/** Value for <input type="datetime-local"> in Mexico City time. */
export function toLocalInput(iso: string): string {
  const local = new Date(Date.parse(iso) - 6 * 3_600_000);
  return local.toISOString().slice(0, 16);
}

/** <input type="datetime-local"> value (Mexico City) → ISO with offset. */
export function fromLocalInput(value: string): string {
  return `${value}:00-06:00`;
}
