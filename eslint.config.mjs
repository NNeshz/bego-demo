// Shared ESLint config for the TypeScript packages in packages/*.
// apps/web has its own config that extends eslint-config-next.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["**/dist/**", "**/coverage/**", "**/node_modules/**", "apps/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Build scripts run in Node.
    files: ["**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly", URL: "readonly" },
    },
  },
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
]);
