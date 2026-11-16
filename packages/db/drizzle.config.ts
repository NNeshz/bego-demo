import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Share the web app's local env file so there is a single place for secrets.
const envFile = "../../apps/web/.env.local";
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
