import { explainRecommendation, type ExplainInput, type ExplainResult } from "./explain";
import { createAnthropicClient, type LlmClient } from "./llm";
import {
  parseTripIntent,
  type FallbackReason,
  type ParseTripContext,
  type ParseTripResult,
} from "./parse-trip";
import type { CityRef } from "./trip";
import { RateLimiter, TtlCache } from "./util";

export * from "./trip";
export { parseTripRules, parseWhen } from "./rules";
export {
  parseTripIntent,
  type ParseTripResult,
  type ParseTripContext,
  type FallbackReason,
} from "./parse-trip";
export {
  explainRecommendation,
  templateExplanation,
  buildFacts,
  numbersAreGrounded,
  money,
  type ExplainInput,
  type ExplainResult,
} from "./explain";
export { createAnthropicClient, type LlmClient, type GenerateObjectRequest } from "./llm";
export { RateLimiter, TtlCache, TimeoutError, withTimeout, startOfDayMx, toMxIso } from "./util";

export interface AiServiceOptions {
  cities: readonly CityRef[];
  /** Without a key (and without `llm`) everything runs on deterministic fallbacks. */
  apiKey?: string | undefined;
  model?: string;
  /** Inject a custom client (tests, other providers). Takes precedence over `apiKey`. */
  llm?: LlmClient;
  now?: () => Date;
  timeoutMs?: number;
  /** Claude calls allowed per minute across the whole instance (budget guard). Default 30. */
  callsPerMinute?: number;
  onFallback?: (
    operation: "parse" | "explain",
    reason: FallbackReason | string,
    error?: unknown,
  ) => void;
}

export interface AiService {
  readonly aiEnabled: boolean;
  parseTrip(text: string, context?: ParseTripContext): Promise<ParseTripResult>;
  explain(input: ExplainInput): Promise<ExplainResult>;
}

/** One instance per server process: caches and the rate limiter are shared across requests. */
export function createAiService(options: AiServiceOptions): AiService {
  const llm =
    options.llm ??
    (options.apiKey
      ? createAnthropicClient({
          apiKey: options.apiKey,
          model: options.model ?? "claude-haiku-5-5",
        })
      : undefined);
  const callsPerMinute = options.callsPerMinute ?? 30;
  const limiter = new RateLimiter({ capacity: callsPerMinute, refillPerMinute: callsPerMinute });
  const parseCache = new TtlCache<ParseTripResult>({ max: 500, ttlMs: 60 * 60_000 });
  const explainCache = new TtlCache<ExplainResult>({ max: 1_000, ttlMs: 24 * 60 * 60_000 });

  return {
    aiEnabled: Boolean(llm),
    parseTrip: (text, context = {}) =>
      parseTripIntent(text, context, {
        cities: options.cities,
        llm,
        ...(options.now ? { now: options.now } : {}),
        timeoutMs: options.timeoutMs ?? 6_000,
        cache: parseCache,
        limiter,
        onFallback: (reason, error) => options.onFallback?.("parse", reason, error),
      }),
    explain: (input) =>
      explainRecommendation(input, {
        llm,
        timeoutMs: options.timeoutMs ?? 6_000,
        cache: explainCache,
        limiter,
        onFallback: (reason, error) => options.onFallback?.("explain", reason, error),
      }),
  };
}
export {
  runAgent,
  createAnthropicAgentLlm,
  type AgentLlm,
  type AgentTool,
  type AgentEvent,
  type AgentMessage,
  type AgentContentBlock,
} from "./agent";
