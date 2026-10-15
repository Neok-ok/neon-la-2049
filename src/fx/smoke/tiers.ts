import type { Tier } from '../../core/quality';
import { KIND_NAME } from './types';

/** Instance buffer for the tier on screen. Low does not allocate the ultra count. */
export const PUFF_CAP: Record<Tier, number> = {
  low: 820,
  medium: 1560,
  high: 2800,
  ultra: 4200,
};

/**
 * Alive targets. Low keeps a plume and a column, with larger puffs.
 * High and ultra spend the count on smaller wisps. Nothing is gated off.
 */
export const ALIVE: Record<Tier, Record<(typeof KIND_NAME)[number], number>> = {
  low: { launch: 440, ground: 120, stack: 200, vent: 36, grate: 200, stall: 28, exhaust: 96 },
  medium: { launch: 700, ground: 180, stack: 320, vent: 70, grate: 280, stall: 40, exhaust: 160 },
  high: { launch: 1100, ground: 280, stack: 480, vent: 120, grate: 400, stall: 56, exhaust: 220 },
  ultra: { launch: 1500, ground: 360, stack: 560, vent: 150, grate: 520, stall: 72, exhaust: 280 },
};

/** Puff scale. Low is softer and larger so the same sources still read. */
export const PUFF_SCALE: Record<Tier, number> = {
  low: 1.42,
  medium: 1.12,
  high: 0.96,
  ultra: 0.84,
};

/** Second noise mask. Low stays on the first octave. */
export const PUFF_DETAIL: Record<Tier, number> = {
  low: 0,
  medium: 0.45,
  high: 1,
  ultra: 1,
};

export function aliveBudget(tier: Tier, kind: (typeof KIND_NAME)[number]): number {
  return ALIVE[tier][kind];
}
