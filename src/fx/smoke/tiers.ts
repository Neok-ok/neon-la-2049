import type { Tier } from '../../core/quality';

/** Billboard slots. Allocated for the tier that is showing, not the ultra count. */
export const SMOKE_CAP: Record<Tier, number> = {
  low: 96,
  medium: 320,
  high: 520,
  ultra: 720,
};

/** Launch ground-cloud cards held back from the street budget. */
export const LAUNCH_GROUND_CAP: Record<Tier, number> = {
  low: 14,
  medium: 32,
  high: 56,
  ultra: 80,
};

export const LAUNCH_COLUMN_CAP: Record<Tier, number> = {
  // Sixteen cards on a kilometre head read as beads. Low draws the pad cloud.
  low: 0,
  medium: 40,
  high: 72,
  ultra: 110,
};

/**
 * Samples along a launch ray. The march is the plume on every tier, so low
 * is a coarser column rather than a card pad. The loop is six wide; extra
 * taps are masked. A 12-step march with two noise octaves did not finish a
 * frame on a software rasterizer, so each tap is one noise sample.
 */
export const VOLUME_STEPS: Record<Tier, number> = {
  low: 3,
  medium: 4,
  high: 5,
  ultra: 6,
};

/**
 * Samples inside a street puff (manhole sheet or exhaust wake). The box is a
 * few metres, so the same cap of five stays cheap on the software rasterizer.
 */
export const PUFF_STEPS: Record<Tier, number> = {
  low: 3,
  medium: 4,
  high: 4,
  ultra: 5,
};

/** Manhole sheets and exhaust wakes sharing one instanced box. */
export const PUFF_CAP: Record<Tier, number> = {
  low: 4,
  medium: 8,
  high: 12,
  ultra: 16,
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
