import { createAiService, RateLimiter, type AiService } from "@retorno/ai";
import { CITIES, createDataSource, type City, type DataSource } from "@retorno/db";
import { env } from "@/env";

/**
 * Process-wide dependencies. Created once and reused across requests so that
 * caches, rate limiters and the DB pool are shared. Kept on globalThis so
 * Next's dev hot reload doesn't create a new pool on every edit.
 */
export interface ServerContext {
  data: DataSource;
  ai: AiService;
  cities: readonly City[];
  now: () => Date;
  /** Per-client limiter for expensive endpoints (AI calls). */
  clientLimiter: RateLimiter;
}

const store = globalThis as typeof globalThis & { __retornoContext?: ServerContext };

function createContext(): ServerContext {
  const now = () => new Date();
  return {
    data: createDataSource(env.DATABASE_URL, { now }),
    ai: createAiService({
      cities: CITIES,
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL,
      now,
      onFallback: (operation, reason, error) => {
        if (reason === "disabled") return; // expected without a key; don't spam logs
        console.warn(
          `[ai] ${operation} fell back (${reason})`,
          error instanceof Error ? error.message : "",
        );
      },
    }),
    cities: CITIES,
    now,
    clientLimiter: new RateLimiter({ capacity: 20, refillPerMinute: 20 }),
  };
}

export function getContext(): ServerContext {
  store.__retornoContext ??= createContext();
  return store.__retornoContext;
}

/** Tests inject deterministic dependencies (fixed clock, fake LLM, memory data). */
export function setContextForTests(context: ServerContext | undefined): void {
  store.__retornoContext = context;
}
