import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    exclude: ["e2e/**", "node_modules/**"],
    // Tests must not depend on a developer's local services or API keys.
    env: { DATABASE_URL: "", ANTHROPIC_API_KEY: "" },
  },
});
