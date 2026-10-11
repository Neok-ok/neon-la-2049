// Screen-space error. The geometric error of a LOD, projected into pixels.
// Refine while that error is larger than the tier's threshold. Hysteresis keeps
// a level that is already showing from flipping when the camera jitters.

/** Metres of error when that LOD is what we draw. Index 0 is the street mesh. */
export const LOD_ERROR_M = [0.5, 8, 32] as const;

/** Pixels. Ultra refines sooner; low tolerates a coarser silhouette. */
export const SSE_THRESHOLD = { low: 14, medium: 8, high: 5, ultra: 3.5 } as const;

const HYST = 0.18;

export function screenSpaceError(errorM: number, distanceM: number, fovYRad: number, viewportPx: number): number {
  const d = Math.max(1, distanceM);
  const fov = Math.min(Math.PI * 0.9, Math.max(0.2, fovYRad));
  const h = Math.max(1, viewportPx);
  return (errorM * h) / (2 * d * Math.tan(fov * 0.5));
}

export interface LodPick {
  distance: number;
  fovY: number;
  viewport: number;
  threshold: number;
  /** Governor multiplier. 1 at rest. Higher keeps coarser LODs. */
  scale?: number;
  /** LOD on screen, or -1 if nothing is showing. */
  current: number;
  /** Finest LOD the tier radius allows. 0 is full detail. */
  finest: number;
}

/**
 * One step toward the coarsest LOD whose projected error fits the threshold,
 * and never finer than `finest`. Stepping one level per call is the hysteresis
 * against a pop: a fast camera does not skip straight from a silhouette to street props.
 */
export function pickLod(opts: LodPick): number {
  const finest = Math.max(0, Math.min(2, opts.finest | 0));
  const threshold = opts.threshold * (opts.scale ?? 1);
  const err = (lod: number) => screenSpaceError(LOD_ERROR_M[lod] ?? 32, opts.distance, opts.fovY, opts.viewport);
  const current = opts.current;
  if (current >= finest && current <= 2) {
    if (current > finest && err(current) > threshold * (1 + HYST)) return current - 1;
    if (current < 2 && err(current + 1) < threshold * (1 - HYST)) return current + 1;
    return current;
  }
  for (let lod = 2; lod >= finest; lod--) {
    if (err(lod) <= threshold) return lod;
  }
  return finest;
}
