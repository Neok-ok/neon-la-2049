// Pure module (worker-safe). Deterministic hashing + seeded RNG so every chunk regenerates identically.

export function hash2i(a: number, b: number, c = 0): number {
  let h = (a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return h >>> 0;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Screenshot seed. Unset in normal play, so `trueRandomSeed` and `visualUnit` stay on crypto / Math.random.
 * Set from `?seed=` before weather, precipitation, traffic, or the env map are constructed.
 */
let visualPin: number | undefined;

export function pinVisualSeed(seed: number | undefined): void {
  if (seed === undefined || !Number.isFinite(seed)) {
    visualPin = undefined;
    return;
  }
  visualPin = seed >>> 0 || 1;
}

/** Named uint32 draw from the pinned seed. Undefined when nothing is pinned. */
export function visualSeed(label: string): number | undefined {
  if (visualPin === undefined) return undefined;
  return hash2i(visualPin, hashString(label), 0x51eed);
}

/** Named unit draw in [0, 1). Undefined when nothing is pinned. */
export function visualUnit(label: string): number | undefined {
  const s = visualSeed(label);
  return s === undefined ? undefined : s / 4294967296;
}

/**
 * Sim seconds held while `?seed=` is set. Rain, signs, beacons and the ocean sample this phase
 * instead of the wall clock, so a deep link renders the same frame twice.
 */
export const VISUAL_CLOCK_SEC = 48;

/** mulberry32 */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** Skewed toward low values; k > 1 = more skew. */
  skew(a: number, b: number, k: number): number {
    return a + (b - a) * Math.pow(this.next(), k);
  }
}

export function trueRandomSeed(): number {
  const pinned = visualSeed('true-random');
  if (pinned !== undefined) return pinned;
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}
