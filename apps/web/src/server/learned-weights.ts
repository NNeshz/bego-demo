/**
 * Weights learned by services/ml, with the same rule as every other dependency:
 * if the ML service is not configured, slow, down or has no published model, rank
 * with the hand-set defaults. The demo never breaks.
 */
import { DEFAULT_WEIGHTS, type ScoreWeights } from "@retorno/engine";
import { z } from "zod";

export type WeightsSource =
  | { kind: "learned"; version: number; scope: "trucker" | "global" }
  | { kind: "default"; reason: "not_configured" | "unavailable" | "no_model" }
  | { kind: "request" };

export interface ResolvedWeights {
  weights: ScoreWeights;
  source: WeightsSource;
}

const WeightsSchema = z.object({
  home: z.number().min(0).max(5),
  deadheadPenaltyMxnPerKm: z.number().min(0).max(50),
  waitPenaltyMxnPerHour: z.number().min(0).max(2_000),
});

const WeightsResponse = z.object({
  version: z.number().int(),
  scope: z.enum(["trucker", "global"]),
  weights: WeightsSchema,
});

const ModelSummarySchema = z.object({
  version: z.number().int(),
  trainedAt: z.string(),
  trainedOn: z.number().int(),
  published: z.boolean(),
  weights: WeightsSchema,
  truckers: z.number().int(),
  metrics: z.record(z.string(), z.unknown()),
  demoTruckers: z.array(
    z.object({
      truckId: z.string(),
      persona: z.string(),
      description: z.string().nullable(),
      weights: WeightsSchema,
    }),
  ),
});
export type ModelSummary = z.infer<typeof ModelSummarySchema>;

export interface WeightsProvider {
  readonly enabled: boolean;
  get(truckId?: string): Promise<ResolvedWeights>;
  /** Latest model report (published or not), or null if unavailable. */
  model(): Promise<ModelSummary | null>;
  /** Forget cached weights and reports (after retraining). */
  invalidate(): void;
  readonly baseUrl: string | undefined;
}

export interface WeightsProviderOptions {
  baseUrl?: string | undefined;
  fetch?: typeof fetch;
  /** Ranking must stay fast: give up on the ML service quickly. */
  timeoutMs?: number;
  /**
   * The /modelo report streams behind its own skeleton, so it can wait longer: enough for a
   * scaled-to-zero service to wake up (Fly resumes a suspended machine in ~2–3 s).
   */
  modelTimeoutMs?: number;
  ttlMs?: number;
  /** After a failure, don't retry for this long (avoids hammering a down service). */
  failureTtlMs?: number;
  now?: () => number;
}

const fallback = (
  reason: Extract<WeightsSource, { kind: "default" }>["reason"],
): ResolvedWeights => ({
  weights: { ...DEFAULT_WEIGHTS },
  source: { kind: "default", reason },
});

export function createWeightsProvider(options: WeightsProviderOptions): WeightsProvider {
  const baseUrl = options.baseUrl?.replace(/\/$/, "");
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 800;
  const ttlMs = options.ttlMs ?? 60_000;
  // Short: a sleeping service that just got woken up by a timed-out request is usually
  // ready a few seconds later.
  const failureTtlMs = options.failureTtlMs ?? 5_000;
  const modelTimeoutMs = options.modelTimeoutMs ?? 5_000;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { value: ResolvedWeights; expiresAt: number }>();
  let modelCache: { value: ModelSummary | null; expiresAt: number } | undefined;

  async function getJson(
    path: string,
    timeout = timeoutMs,
  ): Promise<{ status: number; body: unknown }> {
    const response = await doFetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(timeout),
      cache: "no-store",
    });
    return {
      status: response.status,
      body: response.ok ? await response.json() : await response.body?.cancel(),
    };
  }

  return {
    enabled: Boolean(baseUrl),
    baseUrl,
    invalidate() {
      cache.clear();
      modelCache = undefined;
    },

    async get(truckId) {
      if (!baseUrl) return fallback("not_configured");
      const key = truckId ?? "*";
      const hit = cache.get(key);
      if (hit && hit.expiresAt > now()) return hit.value;

      let value: ResolvedWeights;
      let ttl = ttlMs;
      try {
        const query = truckId ? `?truck_id=${encodeURIComponent(truckId)}` : "";
        const { status, body } = await getJson(`/weights${query}`);
        if (status === 404) {
          value = fallback("no_model");
        } else {
          const parsed = WeightsResponse.parse(body);
          value = {
            weights: parsed.weights,
            source: { kind: "learned", version: parsed.version, scope: parsed.scope },
          };
        }
      } catch {
        value = fallback("unavailable");
        ttl = failureTtlMs;
      }
      cache.set(key, { value, expiresAt: now() + ttl });
      return value;
    },

    async model() {
      if (!baseUrl) return null;
      if (modelCache && modelCache.expiresAt > now()) return modelCache.value;
      let value: ModelSummary | null = null;
      try {
        const { status, body } = await getJson("/model", modelTimeoutMs);
        value = status === 200 ? ModelSummarySchema.parse(body) : null;
      } catch {
        value = null;
      }
      modelCache = { value, expiresAt: now() + (value ? ttlMs : failureTtlMs) };
      return value;
    },
  };
}
