import { expect, test } from "./fixtures";

test.describe("dispatcher", () => {
  test("simulate week: today vs. with Retorno", async ({ page }) => {
    await page.goto("/despacho");
    await expect(page.getByRole("radio", { name: "Hoy" })).toBeChecked();
    // Opens at the end of the week: the result is visible without playing anything.
    await expect(
      page.getByText(/En 7 días simulados: km en vacío \d+\.\d% → \d+\.\d%/),
    ).toBeVisible();
    await expect(page.getByText("Ganancia extra")).toBeVisible();
    await expect(page.getByText(/Día 7 de 7 · cierre/)).toBeVisible();

    // Playing rewinds to the start, then the clock must advance.
    await page.getByRole("button", { name: "Simular semana" }).click();
    await expect(page.getByText(/Día 1 de 7/)).toBeVisible();
    await expect(page.getByText(/Día [2-7] de 7/)).toBeVisible({ timeout: 15_000 });

    // Jump to the end with the scrubber.
    const scrubber = page.getByRole("slider", { name: "Momento de la semana" });
    await scrubber.fill((await scrubber.getAttribute("max")) ?? "0");
    const summary = page.getByText("Resultado de la semana").locator("..");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(/De \d+\.\d% a \d+\.\d% de km en vacío/);
    await expect(summary).toContainText(/\+\$[\d,]+/);

    await page.getByRole("button", { name: /Ver la semana con Retorno/ }).click();
    await expect(page.getByRole("radio", { name: "Con Retorno" })).toBeChecked();
    await expect(page.getByText("Flota · Con Retorno")).toBeVisible();
  });

  test("on a phone the fleet list starts short and expands", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes("mobile"), "phone layout only");
    await page.goto("/despacho");
    await expect(page.getByRole("button", { name: /^U-005/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^U-006/ })).toBeHidden();
    await page.getByRole("button", { name: /Ver los \d+ camiones/ }).click();
    await expect(page.getByRole("button", { name: /^U-006/ })).toBeVisible();
  });

  test("fleet table selects a truck", async ({ page }) => {
    await page.goto("/despacho");
    const firstTruck = page.getByRole("button", { name: /^U-001/ });
    await firstTruck.click();
    await expect(firstTruck).toHaveAttribute("aria-pressed", "true");
  });
});
