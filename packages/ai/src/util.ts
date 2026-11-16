/** Small, dependency-free utilities: Mexico City time, TTL cache, rate limiter, timeout. */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Mexico City is UTC−6 all year (no DST since 2022). */
export const MX_OFFSET_MS = -6 * HOUR_MS;

/** Midnight (Mexico City) of the day containing `now`, as UTC epoch ms. */
export function startOfDayMx(now: Date): number {
  const local = now.getTime() + MX_OFFSET_MS;
  return local - (((local % DAY_MS) + DAY_MS) % DAY_MS) - MX_OFFSET_MS;
}

/** Mexico City wall-clock parts for `now`. */
export function mxParts(now: Date): { weekday: number; hour: number; minute: number } {
  const local = new Date(now.getTime() + MX_OFFSET_MS);
  return { weekday: local.getUTCDay(), hour: local.getUTCHours(), minute: local.getUTCMinutes() };
}

/** ISO-8601 with the Mexico City offset, e.g. 2026-11-17T10:00:00-06:00 (friendlier for the LLM). */
export function toMxIso(date: Date): string {
  const local = new Date(date.getTime() + MX_OFFSET_MS);
  return `${local.toISOString().slice(0, 19)}-06:00`;
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** LRU cache with per-entry TTL. Map preserves insertion order, so the first key is the oldest. */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();

  constructor(private readonly options: { max: number; ttlMs: number; now?: () => number }) {}

  private now() {
    return this.options.now?.() ?? Date.now();
  }

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh recency.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.options.ttlMs });
    while (this.entries.size > this.options.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size() {
    return this.entries.size;
  }
}

/**
 * Token bucket: `capacity` calls in a burst, refilled at `refillPerMinute`.
 * Protects the Claude budget; when empty, callers degrade to deterministic fallbacks.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(
    private readonly options: { capacity: number; refillPerMinute: number; now?: () => number },
  ) {}

  tryTake(key = "global"): boolean {
    const now = this.options.now?.() ?? Date.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.options.capacity, updatedAt: now };
    const refilled = ((now - bucket.updatedAt) / 60_000) * this.options.refillPerMinute;
    bucket.tokens = Math.min(this.options.capacity, bucket.tokens + refilled);
    bucket.updatedAt = now;
    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return allowed;
  }
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms} ms`);
    this.name = "TimeoutError";
  }
}

/** Run `task` with an AbortSignal that fires after `ms`; rejects with TimeoutError. */
export async function withTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Order matters: settle the race with TimeoutError BEFORE aborting, because
      // abort() synchronously makes the task reject with its own abort error.
      reject(new TimeoutError(ms));
      controller.abort();
    }, ms);
  });
  try {
    return await Promise.race([task(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
