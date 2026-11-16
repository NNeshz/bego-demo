import { describe, expect, it } from "vitest";
import { RateLimiter, TimeoutError, TtlCache, withTimeout } from "./util";

describe("TtlCache", () => {
  it("expires entries and evicts the least recently used", () => {
    let t = 0;
    const cache = new TtlCache<number>({ max: 2, ttlMs: 100, now: () => t });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a"); // "a" is now the most recent
    cache.set("c", 3); // evicts "b"
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    t = 150;
    expect(cache.get("a")).toBeUndefined();
  });
});

describe("RateLimiter", () => {
  it("allows a burst, blocks, then refills over time", () => {
    let t = 0;
    const limiter = new RateLimiter({ capacity: 2, refillPerMinute: 60, now: () => t });
    expect(limiter.tryTake()).toBe(true);
    expect(limiter.tryTake()).toBe(true);
    expect(limiter.tryTake()).toBe(false);
    t = 1_000; // one token per second
    expect(limiter.tryTake()).toBe(true);
    expect(limiter.tryTake("other-key")).toBe(true);
  });
});

describe("withTimeout", () => {
  it("resolves fast tasks and aborts slow ones", async () => {
    await expect(withTimeout(async () => "ok", 50)).resolves.toBe("ok");
    let aborted = false;
    const slow = withTimeout(
      (signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => (aborted = true));
          setTimeout(resolve, 1_000);
        }),
      10,
    );
    await expect(slow).rejects.toBeInstanceOf(TimeoutError);
    expect(aborted).toBe(true);
  });

  it("reports a timeout even when the task rejects as soon as it is aborted", async () => {
    // Real SDKs throw their own AbortError on abort; it must not mask the timeout.
    const abortsEagerly = withTimeout(
      (signal) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
      10,
    );
    await expect(abortsEagerly).rejects.toBeInstanceOf(TimeoutError);
  });
});
