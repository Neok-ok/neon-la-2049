import type { Tier } from '../../core/quality';

/** Billboard slots. Allocated for the tier that is showing, not the ultra count. */
export const SMOKE_CAP: Record<Tier, number> = {
  low: 64,
  medium: 180,
  high: 380,
  ultra: 560,
};

/** Launch ground-cloud cards held back from the street budget. */
export const LAUNCH_GROUND_CAP: Record<Tier, number> = {
  low: 14,
  medium: 32,
  high: 56,
  ultra: 80,
};

export const LAUNCH_COLUMN_CAP: Record<Tier, number> = {
  low: 16,
  medium: 40,
  high: 72,
  ultra: 110,
};

/** Ray-march steps inside the launch volume. Low and medium stay on billboards. */
export const VOLUME_STEPS: Record<Tier, number> = {
  low: 0,
  medium: 0,
  high: 8,
  ultra: 12,
};

export const RATE_SCALE: Record<Tier, number> = {
  low: 0.4,
  medium: 0.62,
  high: 0.85,
  ultra: 1,
};

/** How far from the camera we keep emitters, metres. */
export const GATHER_RADIUS: Record<Tier, number> = {
  low: 48,
  medium: 80,
  high: 120,
  ultra: 150,
};

export function streetCap(tier: Tier): number {
  return Math.max(8, SMOKE_CAP[tier] - LAUNCH_GROUND_CAP[tier] - LAUNCH_COLUMN_CAP[tier]);
}
