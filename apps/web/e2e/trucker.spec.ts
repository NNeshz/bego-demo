import { expect, test, tripQuery } from "./fixtures";

test("runs in deterministic mode (no DB, no AI)", async ({ request }) => {
  const health = await (await request.get("/api/v1/health")).json();
  expect(health).toMatchObject({ status: "ok", dataSource: "memory", aiEnabled: false });
});

test.describe("trucker flow", () => {
  test("free text → recommendations → detail → accept on WhatsApp", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("note")).toHaveText(/no afiliado a BeGo/);

    await page.getByRole("button", { name: /Descargo en Laredo mañana/ }).click();
    await expect(page.getByText("Leído sin IA")).toBeVisible();
    // Scoped to the form rows: the home page also shows an example result for the same trip.
    await expect(page.getByRole("button", { name: /Descargas en/ })).toContainText("Nuevo Laredo");
    await expect(page.getByRole("button", { name: /Tu unidad/ })).toContainText("Caja seca 53'");
    await expect(page.getByRole("button", { name: /Tu base/ })).toContainText("Querétaro");

    await page.getByRole("button", { name: /Ver cargas de regreso/ }).click();
    await expect(page).toHaveURL(/\/cargas\?desde=nuevo-laredo/);
    // Scoped to the result cards: Next keeps the previous page (with its example card) mounted but hidden.
    const cards = page.locator('a[href^="/cargas/CRG"]');
    await expect(cards.first()).toContainText("Mejor opción");
    await expect(cards).toHaveCount(5);
    await expect(cards.first()).toContainText(/\+\$[\d,]+/);

    await cards.first().click();
    await expect(page).toHaveURL(/\/cargas\/CRG-\d{4}\?/);
    await expect(page.getByText(/^Te conviene porque/)).toBeVisible();
    await expect(page.getByText("Explicación automática")).toBeVisible();
    await expect(page.getByRole("table", { name: "Desglose del dinero" })).toBeVisible();

    const whatsapp = page.getByRole("link", { name: /Aceptar por WhatsApp/ });
    const href = decodeURIComponent((await whatsapp.getAttribute("href")) ?? "");
    expect(href).toMatch(/^https:\/\/wa\.me\/\?text=Hola, me interesa esta carga/);
    expect(href).toMatch(/CRG-\d{4}/);

    const feedback = page.waitForRequest(
      (r) => r.url().endsWith("/api/v1/events") && r.method() === "POST",
    );
    await page.getByRole("button", { name: "No me interesa" }).click();
    expect((await feedback).postDataJSON()).toMatchObject({ action: "rejected", rank: 1 });
    await expect(page.getByText(/lo tomamos en cuenta/)).toBeVisible();
  });

  test("asks a follow-up question when something is missing", async ({ page }) => {
    await page.goto("/");
    await page
      .locator("#trip-text")
      .fill("descargo en Saltillo hoy a las 6 de la tarde con plataforma");
    await page.keyboard.press("Enter");
    await expect(page.getByText("¿Dónde está tu base?")).toBeVisible();
    await expect(page.getByRole("button", { name: /Ver cargas de regreso/ })).toBeDisabled();

    await page.locator("#trip-text").fill("Monterrey");
    await page.keyboard.press("Enter");
    await expect(page.getByText("¿Dónde está tu base?")).toBeHidden();
    await expect(page.getByRole("button", { name: /Ver cargas de regreso/ })).toBeEnabled();
  });

  test("tells the trucker what to do when the service is busy or down", async ({ page }) => {
    await page.route("**/api/v1/parse-trip", (route) =>
      route.fulfill({
        status: 429,
        json: { error: { code: "rate_limited", message: "Too many requests." } },
      }),
    );
    await page.goto("/");
    await page.locator("#trip-text").fill("descargo en Saltillo");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Espera un minuto o llena los datos abajo/)).toBeVisible();

    await page.unroute("**/api/v1/parse-trip");
    await page.route("**/api/v1/parse-trip", (route) => route.abort("internetdisconnected"));
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Revisa tu señal o llena los datos abajo/)).toBeVisible();
  });

  test("the fallback form works without typing", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Descargas en/ }).click();
    await page.getByRole("combobox", { name: "Ciudad" }).selectOption("monterrey");
    await page.getByRole("button", { name: /Quedas libre/ }).click();
    await page.getByLabel("Fecha y hora en que quedas libre").fill("2030-01-10T08:00");
    await page.getByRole("button", { name: /Tu unidad/ }).click();
    await page.getByRole("button", { name: "Torton" }).click();
    await page.getByRole("button", { name: /Tu base/ }).click();
    await page.getByRole("combobox", { name: "Ciudad" }).selectOption("queretaro");
    await expect(page.getByRole("button", { name: /Ver cargas de regreso/ })).toBeEnabled();
  });

  test("2-load chains open their own detail", async ({ page }) => {
    await page.goto(`/cargas?${tripQuery()}`);
    await page.getByRole("tab", { name: /Cadenas de 2/ }).click();
    await page.locator('a[href^="/cadenas/"]').first().click();
    await expect(page).toHaveURL(/\/cadenas\/CRG-\d{4}\/CRG-\d{4}/);
    // Wait for the destination content first: during the client navigation the results page is still mounted.
    await expect(page.getByText(/^Carga 1 · CRG/)).toBeVisible();
    await expect(page.getByText(/^Carga 2 · CRG/)).toBeVisible();
    await expect(page.locator("header").getByText("Cadena de 2 cargas")).toBeVisible();
  });

  test("explains an empty market instead of showing nothing", async ({ page }) => {
    // A load window far in the future: nothing reachable.
    const query = new URLSearchParams(tripQuery());
    query.set("hora", "2031-01-01T10:00:00-06:00");
    await page.goto(`/cargas?${query}`);
    await expect(page.getByText(/Las cargas cercanas ya cerraron|No hay cargas/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Cambiar hora o unidad/ })).toBeVisible();
  });

  test("handles broken links gracefully", async ({ page }) => {
    await page.goto("/cargas?desde=atlantis");
    await expect(page.getByText("Nos faltan datos de tu viaje")).toBeVisible();

    await page.goto(`/cargas/CRG-9999?${tripQuery()}`);
    await expect(page.getByText("Esta carga ya no está disponible")).toBeVisible();

    const response = await page.goto("/no-existe");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Esta ruta no existe")).toBeVisible();
  });
});
