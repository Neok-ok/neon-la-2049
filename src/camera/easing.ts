// Timing curves for dollies and cranes. Zero slope at both ends so a shot can start and stop without a jerk.

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Quintic smootherstep. Value and first derivative are 0 at 0 and 1. */
export function smootherstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Critically damped follow. `lambda` is the rate in 1/seconds. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * Math.max(0, dt)));
}
