import AxeBuilder from "@axe-core/playwright";
import { expect, test, tripQuery } from "./fixtures";

const PAGES = (): Array<[string, string]> => [
  ["home", "/"],
  ["results", `/cargas?${tripQuery()}`],
  ["detail", `/cargas/CRG-0134?${tripQuery()}`],
  ["dispatcher", "/despacho"],
  ["widget", "/embed"],
  ["agent", "/agent"],
  ["model", "/modelo"],
];

for (const [name, path] of PAGES()) {
  test.describe(name, () => {
    test("has no horizontal overflow", async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        scrollWidth,
        `page is ${scrollWidth - clientWidth}px wider than the viewport`,
      ).toBeLessThanOrEqual(clientWidth);
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no serious accessibility violations (${colorScheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          // Third-party map canvas and attribution are outside our control.
          .exclude(".maplibregl-map")
          .analyze();
        const serious = results.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map(
            (v) =>
              `${v.id} (${v.impact}): ${v.help} → ${v.nodes
                .slice(0, 3)
                .map((n) => n.target.join(" "))
                .join(" | ")}`,
          );
        expect(serious).toEqual([]);
      });
    }
  });
}
