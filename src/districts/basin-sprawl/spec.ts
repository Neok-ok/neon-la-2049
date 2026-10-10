// Basin sprawl numbers. The shared planner stays free of this district's streets.
// The default district covers every unnamed sector, on the existing north-aligned grid.
import type { SprawlParams } from '../_shared/sprawl/plan';

export const BEARING = 0;
/** Centre-to-centre spacing. Matches `defaultDistrict.grid.block` in the JSON. */
export const BLOCK_A = 180;
export const BLOCK_B = 95;
export const STREET = 16;
/**
 * Driving line, metres from the centreline. An 16 m street can hold this and stay
 * at or above 5 m, so the cars stay cars and the 74 / 112 m spinner park stays on.
 */
export const LANE = 5.1;

/**
 * Inclusive node range over the playable bounds (34.16–33.68 N, 118.60–118.05 W).
 * Edges whose midpoint is not this district, ocean, or reserved are dropped.
 */
export const LATTICE = {
  i0: -230,
  i1: 68,
  j0: -347,
  j1: 190,
  prefix: 'bs',
  id: 'basin-streets',
} as const;

/**
 * East-west street lines (axis A index), snapped to the 180 m grid.
 * Ventura Blvd, Colorado Blvd, Century Blvd, Florence Ave.
 */
export const STRIP_A = [61, 57, -66, -48] as const;
/** North-south street lines (axis B index), snapped to the 95 m grid. */
export const STRIP_B = [-199, -216, 91, 166, -106] as const;

/** Snapped crossing of Century Blvd and La Brea Ave. A pin, not a venue. */
export const STRIP_PIN = { lat: 33.944761, lon: -118.352882 };

/**
 * 2–10 storeys at 3.4 m is 6.8–34.0 m, inside the 6–35 m row.
 * Cap 35 so a later dial cannot clear the row. Towers, the hub, the rise and the wall stay off.
 */
export const BASIN_PARAMS: SprawlParams = {
  id: 'basin-sprawl',
  module: 3.4,
  storeys: [2, 10],
  cap: 35,
  lit: [0.08, 0.22],
  tint: [0.42, 0.64],
  strips: { a: STRIP_A, b: STRIP_B },
};
