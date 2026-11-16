/**
 * Seeded pseudo-random generator (mulberry32). Same seed → same sequence,
 * on every machine. This is what makes the synthetic market reproducible.
 */
export function createRng(seed: number) {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };

  return {
    next,
    /** Float in [min, max). */
    float: (min: number, max: number) => min + next() * (max - min),
    /** Integer in [min, max]. */
    int: (min: number, max: number) => Math.floor(min + next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error("pick() on empty list");
      return items[Math.floor(next() * items.length)]!;
    },
    weighted: <T>(items: readonly T[], weight: (item: T) => number): T => {
      const total = items.reduce((sum, item) => sum + weight(item), 0);
      let roll = next() * total;
      for (const item of items) {
        roll -= weight(item);
        if (roll < 0) return item;
      }
      return items[items.length - 1]!;
    },
  };
}

export type Rng = ReturnType<typeof createRng>;
