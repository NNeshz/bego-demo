import { z } from "zod";

/**
 * Server-side environment, validated once at startup.
 *
 * Every external dependency is optional on purpose: without an Anthropic key the
 * app falls back to rule-based parsing and templated explanations, and without a
 * database it serves the deterministic in-memory seed. The demo must never break.
 */
const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ANTHROPIC_API_KEY: z.preprocess(emptyToUndefined, z.string().startsWith("sk-ant-").optional()),
  ANTHROPIC_MODEL: z.preprocess(emptyToUndefined, z.string().default("claude-haiku-5-5")),
  DATABASE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  NEXT_PUBLIC_APP_URL: z.preprocess(emptyToUndefined, z.url().default("http://localhost:3100")),
});

export type Env = z.infer<typeof envSchema> & {
  aiEnabled: boolean;
  dbEnabled: boolean;
};

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return {
    ...result.data,
    aiEnabled: Boolean(result.data.ANTHROPIC_API_KEY),
    dbEnabled: Boolean(result.data.DATABASE_URL),
  };
}

export const env = parseEnv(process.env);
