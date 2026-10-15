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
  low: { launch: 300, ground: 150, stack: 120, vent: 48, grate: 96, stall: 52, exhaust: 54 },
  medium: { launch: 540, ground: 240, stack: 240, vent: 100, grate: 170, stall: 84, exhaust: 130 },
  high: { launch: 1000, ground: 380, stack: 440, vent: 190, grate: 270, stall: 130, exhaust: 250 },
  ultra: { launch: 1540, ground: 540, stack: 660, vent: 180, grate: 150, stall: 90, exhaust: 380 },
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
