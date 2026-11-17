import {
  createAiService,
  createAnthropicAgentLlm,
  RateLimiter,
  type AgentLlm,
  type AiService,
} from "@retorno/ai";
import { CITIES, createDataSource, type City, type DataSource } from "@retorno/db";
import { env } from "@/env";
import { createWeightsProvider, type WeightsProvider } from "./learned-weights";

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
  /** Tool-use model for /agent. Undefined without an API key (deterministic fallback agent). */
  agentLlm?: AgentLlm | undefined;
  /** Ranking weights learned by services/ml (falls back to hand-set defaults). */
  weights: WeightsProvider;
}

const store = globalThis as typeof globalThis & {
  __retornoContext?: ServerContext;
  __retornoContextShape?: string;
};

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
    clientLimiter: new RateLimiter({
      capacity: env.RATE_LIMIT_PER_MINUTE,
      refillPerMinute: env.RATE_LIMIT_PER_MINUTE,
    }),
    weights: createWeightsProvider({ baseUrl: env.ML_SERVICE_URL }),
    agentLlm: env.ANTHROPIC_API_KEY
      ? createAnthropicAgentLlm({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL })
      : undefined,
  };
}

export function getContext(): ServerContext {
  // In dev, hot reload re-evaluates this module but globalThis survives: a context built by an
  // older createContext() can lack newly added dependencies. Rebuild when its source changes.
  const shape = process.env.NODE_ENV === "production" ? "" : createContext.toString();
  if (!store.__retornoContext || store.__retornoContextShape !== shape) {
    store.__retornoContext = createContext();
    store.__retornoContextShape = shape;
  }
  return store.__retornoContext;
}

/** Tests inject deterministic dependencies (fixed clock, fake LLM, memory data). */
export function setContextForTests(context: ServerContext | undefined): void {
  store.__retornoContext = context;
  // Pin the injected context: getContext() must not replace it.
  store.__retornoContextShape =
    process.env.NODE_ENV === "production" ? "" : createContext.toString();
}
