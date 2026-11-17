import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const CI = Boolean(process.env.CI);

/**
 * E2E against a production build in deterministic mode: no database (in-memory
 * seed) and no Claude key (rule-based parser + templates). Free, offline-safe
 * and identical in CI. That mode is also the fallback the app must survive.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
  },
  projects: [
    // Truckers use the app on a phone: 375 px is the design target.
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}/api/v1/health`,
    reuseExistingServer: !CI,
    timeout: 240_000,
    // Empty values win over apps/web/.env.local: process env takes precedence over env files.
    // All test traffic comes from one client (localhost): raise the per-client limit;
    // its behavior is covered by the API tests and the rate-limit test below.
    env: {
      DATABASE_URL: "",
      ANTHROPIC_API_KEY: "",
      NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
      RATE_LIMIT_PER_MINUTE: "10000",
      // No ML service in E2E: ranking uses the hand-set weights (deterministic).
      ML_SERVICE_URL: "",
    },
  },
});
