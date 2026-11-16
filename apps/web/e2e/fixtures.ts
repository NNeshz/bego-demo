import { test as base, expect } from "@playwright/test";

export const FLAGSHIP = "Descargo en Laredo mañana a las 10 con caja seca, mi base es Querétaro";

/** A trip query for tomorrow 10:00 Mexico City (data is rebased to "today", so dates must be relative). */
export function tripQuery(): string {
  const tomorrow = new Date(Date.now() + 86_400_000);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(
    tomorrow,
  );
  return new URLSearchParams({
    desde: "nuevo-laredo",
    hora: `${day}T10:00:00-06:00`,
    unidad: "dry_van_53",
    base: "queretaro",
  }).toString();
}

/**
 * Every test fails if the page throws or logs an error. Map tile requests to
 * the external tile CDN are ignored (network-dependent, not our code).
 */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        if (/tiles\.openfreemap\.org|Failed to load resource/.test(text)) return;
        errors.push(`console: ${text}`);
      });
      await use(errors);
      expect(errors, "page errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
