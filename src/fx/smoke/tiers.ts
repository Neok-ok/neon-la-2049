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
  low: { launch: 440, ground: 80, stack: 280, vent: 72, grate: 160, stall: 96, exhaust: 110 },
  medium: { launch: 700, ground: 140, stack: 420, vent: 100, grate: 240, stall: 96, exhaust: 150 },
  high: { launch: 1100, ground: 220, stack: 640, vent: 140, grate: 360, stall: 140, exhaust: 190 },
  ultra: { launch: 1500, ground: 280, stack: 820, vent: 180, grate: 480, stall: 180, exhaust: 240 },
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
