// One scheduler for the live bus. Skips a non-finite target instead of throwing,
// and does not queue another event when the target has not moved.
const last = new WeakMap<AudioParam, number>();
const warned = new Set<string>();

/** Parameter names that were skipped because the target was not finite. */
export function nonFiniteParams(): string[] {
  return [...warned];
}

/**
 * `epsilon` is 0.001 for gains and about 1 Hz for a filter frequency.
 * A direct write (`time == null`) is the offline path.
 */
export function scheduleParam(
  param: AudioParam | undefined,
  value: number,
  time: number | null,
  tc: number,
  name: string,
  epsilon = 0.001,
): void {
  if (!param) return;
  if (!Number.isFinite(value) || (time != null && !Number.isFinite(time)) || !Number.isFinite(tc)) {
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(`[nla.audio] skipped non-finite ${name} value=${value} time=${String(time)}`);
    }
    return;
  }
  const prev = last.get(param);
  if (prev !== undefined && Math.abs(prev - value) < epsilon) return;
  last.set(param, value);
  if (time == null) param.value = value;
  else param.setTargetAtTime(value, time, tc);
}
