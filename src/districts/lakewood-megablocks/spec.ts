// Lakewood / Downey numbers. The shared planner stays free of this district's coordinates.
import { geoToLocal } from '../../world/geo';
import type { ResidentialParams } from '../_shared/residential/plan';

export const BEARING = 0;
export const BLOCK_A = 210;
export const BLOCK_B = 130;
export const STREET = 26;
/** Driving line, metres from the centreline. Fits a 26 m street (about 4 m of sidewalk, then the lane). */
export const LANE = 6.2;

export const LATTICE = {
  i0: -136,
  i1: -66,
  j0: 14,
  j1: 126,
  prefix: 'lw',
  id: 'lakewood-streets',
} as const;

const [hubX, hubZ] = geoToLocal(33.853, -118.141);
const [kX, kZ] = geoToLocal(33.8585, -118.124);

export const HUB = { x: hubX, z: hubZ, lat: 33.853, lon: -118.141 };
export const K_TOWER = { x: kX, z: kZ };

export const LAKEWOOD_PARAMS: ResidentialParams = {
  module: 3.4,
  height: [45, 130],
  residential: [0.74, 1],
  lit: [0.15, 0.35],
  tint: [0.74, 0.96],
  weights: { bar: 0.3, podium: 0.18, courtyard: 0.24, stepped: 0.14, walkup: 0.14 },
  marketEvery: 8,
  hub: { x: hubX, z: hubZ },
  seam: { x: kX, z: kZ, radius: 1450 },
  seamLit: [0.15, 0.24],
};
