import { expect, test } from "./fixtures";

test.describe("widget", () => {
  test("/embed: renders in the host app and reports events", async ({ page }) => {
    await page.goto("/embed");
    // Playwright locators pierce open shadow roots.
    const cards = page.locator("retorno-widget .card");
    await expect(cards).toHaveCount(3);
    await page.locator("retorno-widget [part=accept]").first().click();
    await expect(page.locator("ol[aria-live]")).toContainText("retorno-accept");
    await expect(page.locator("retorno-widget .done")).toHaveText(/Aceptada/);

    // Attribute changes re-query the API.
    const reload = page.waitForResponse((r) => r.url().endsWith("/api/v1/recommendations"));
    await page
      .locator("label", { hasText: "unit-type" })
      .locator("select")
      .selectOption("reefer_53");
    expect((await reload).ok()).toBe(true);
    await expect(page.locator("retorno-widget")).toHaveAttribute("unit-type", "reefer_53");
  });

  test("works embedded on a different origin (CORS)", async ({ page, baseURL }) => {
    // about:blank has an opaque origin: every API call is cross-origin and needs CORS.
    await page.setContent(`
      <script src="${baseURL}/widget.js"></script>
      <retorno-widget position="nuevo-laredo" base="queretaro" unit-type="dry_van_53" limit="2" theme="light"></retorno-widget>
      <output id="log"></output>
      <script>document.addEventListener("retorno-accept", (e) => { document.getElementById("log").textContent = e.detail.recommendation.load.id; });</script>
    `);
    await expect(page.locator("retorno-widget .card")).toHaveCount(2);
    await page.locator("retorno-widget [part=accept]").first().click();
    await expect(page.locator("#log")).toHaveText(/CRG-\d{4}/);
  });
});

test.describe("agent", () => {
  test("rule-based fallback calls the engine tools and links into the app", async ({ page }) => {
    await page.goto("/agent");
    // The connection panel also lists tool names: scope to the chat transcript.
    const chat = page.locator('[aria-live="polite"]');
    await page.getByRole("button", { name: /Descargo en Laredo mañana/ }).click();
    await expect(chat.getByText("find_return_loads")).toBeVisible();
    await expect(page.getByText(/le ganas \$[\d,]+ a regresar vacío/)).toBeVisible();
    const firstResult = page.locator('a[href^="/cargas/CRG"]').first();
    await expect(firstResult).toBeVisible();

    await page.locator("#agent-input").fill("¿Y cuánto rueda vacía la flota esta semana?");
    await page.keyboard.press("Enter");
    await expect(chat.getByText("get_fleet_empty_km")).toBeVisible();
    await expect(page.getByText("Ganancia extra")).toBeVisible();
  });
});

test.describe("public API surface", () => {
  test("docs, OpenAPI, MCP and widget bundle are served", async ({ page, request }) => {
    const spec = await (await request.get("/api/v1/openapi.json")).json();
    expect(spec.openapi).toBe("3.1.0");

    const widget = await request.get("/widget.js");
    expect(widget.headers()["access-control-allow-origin"]).toBe("*");
    expect((await widget.body()).byteLength).toBeLessThan(20_000);

    const mcp = await request.post("/api/mcp", {
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    const tools = (await mcp.json()).result.tools.map((t: { name: string }) => t.name);
    expect(tools).toContain("find_return_loads");

    await page.goto("/docs");
    await expect(page).toHaveTitle(/Retorno API/);
  });
});
