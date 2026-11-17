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
      const { scrollWidth, clientWidth, clipped } = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        // Content can also be cut off without scrolling (an ancestor with overflow: hidden),
        // so check every element's box too. Children of horizontal scrollers (carousels), the
        // map canvas and decorative art (aria-hidden, e.g. the terrain waves) overflow on purpose.
        const scrollsX = (el: Element | null): boolean => {
          for (let node = el?.parentElement; node; node = node.parentElement) {
            const { overflowX } = getComputedStyle(node);
            if (overflowX === "auto" || overflowX === "scroll") return true;
            if (node.classList.contains("maplibregl-map")) return true;
          }
          return false;
        };
        const clipped = [...document.querySelectorAll("body *")]
          .filter((el) => {
            const box = el.getBoundingClientRect();
            return (
              box.width > 0 &&
              box.right > width + 1 &&
              !el.closest('[aria-hidden="true"]') &&
              !scrollsX(el)
            );
          })
          .slice(0, 3)
          .map(
            (el) =>
              `<${el.tagName.toLowerCase()} class="${(el.getAttribute("class") ?? "").slice(0, 80)}">`,
          );
        return { scrollWidth: document.documentElement.scrollWidth, clientWidth: width, clipped };
      });
      expect(
        scrollWidth,
        `page is ${scrollWidth - clientWidth}px wider than the viewport`,
      ).toBeLessThanOrEqual(clientWidth);
      expect(clipped, "elements extend past the right edge of the screen").toEqual([]);
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no serious accessibility violations (${colorScheme})`, async ({ page }) => {
        // Reduced motion: axe must measure elements at rest, not mid fade-in (half-opaque text
        // fails contrast). The app honors this setting for real users too.
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
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
