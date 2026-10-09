// Westside numbers. The shared planner stays free of this district's streets.
import { geoToLocal } from '../../world/geo';
import type { SprawlFace, SprawlParams } from '../_shared/sprawl/plan';

export const BEARING = 0;
export const BLOCK_A = 190;
export const BLOCK_B = 100;
export const STREET = 18;
/** Driving line, metres from the centreline. Fits an 18 m street and stays at or above 5 m. */
export const LANE = 5.4;

export const LATTICE = {
  i0: -37,
  i1: 22,
  j0: -218,
  j1: -24,
  prefix: 'ws',
  id: 'westside-streets',
} as const;

/**
 * East-west street lines (axis A index), snapped to the 190 m grid.
 * Santa Monica Blvd through Beverly Hills, Wilshire, Olympic, Pico, Venice.
 */
export const STRIP_A = [12, 6, 2, -3, -7] as const;
/** North-south street lines (axis B index), snapped to the 100 m grid. */
export const STRIP_B = [-44, -60, -93, -109, -123] as const;
/** Wilshire only. The other arterials stay at the 3–12 storey band. */
export const WILSHIRE_A = [6] as const;

const [hubX, hubZ] = geoToLocal(34.0434, -118.4215);
const [centX, centZ] = geoToLocal(34.0586, -118.4176);
const [edgeN0, edgeN1] = geoToLocal(34.08, -118.27);
const [edgeS0, edgeS1] = geoToLocal(34.04, -118.276);

/** Polygon east edge, north point to south point. The district is on the positive side. */
export const EAST_EDGE: SprawlFace = {
  x0: edgeN0,
  z0: edgeN1,
  x1: edgeS0,
  z1: edgeS1,
  side: 1,
  band: 780,
};

export const HUB = { x: hubX, z: hubZ, lat: 34.0434, lon: -118.4215 };
export const CENTURY = { x: centX, z: centZ, radius: 380 };

export const WESTSIDE_PARAMS: SprawlParams = {
  id: 'westside',
  module: 3.4,
  storeys: [3, 12],
  cap: 60,
  lit: [0.16, 0.38],
  tint: [0.58, 0.8],
  strips: { a: STRIP_A, b: STRIP_B },
  towers: {
    lines: { a: WILSHIRE_A },
    clusters: [{ x: centX, z: centZ, radius: CENTURY.radius }],
    lineChance: 0.16,
  },
  hub: { x: hubX, z: hubZ },
  rise: EAST_EDGE,
  walls: true,
};
