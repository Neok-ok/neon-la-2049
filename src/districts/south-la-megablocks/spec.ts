// South LA numbers. The shared planner stays free of this district's coordinates.
import { geoToLocal } from '../../world/geo';
import { faceDistance, type FaceBand, type ResidentialParams } from '../_shared/residential/plan';

export const BEARING = 0;
export const BLOCK_A = 200;
export const BLOCK_B = 120;
export const STREET = 24;
/** Driving line, metres from the centreline. Fits a 24 m street and stays at or above 5 m. */
export const LANE = 5.6;

export const LATTICE = {
  i0: -78,
  i1: -10,
  j0: -78,
  j1: 22,
  prefix: 'sl',
  id: 'south-la-streets',
} as const;

/**
 * East-west street lines (axis A index). Present-day MLK, Slauson, Florence,
 * Manchester and Century, snapped to the 200 m grid.
 */
export const SPINE_A = [-23, -35, -43, -51, -59] as const;
/**
 * North-south street lines (axis B index). Crenshaw, Western, Vermont,
 * Figueroa and Central, snapped to the 120 m grid. Figueroa sits west of the 110 trench.
 */
export const SPINE_B = [-67, -50, -37, -30, -10] as const;

const [hubX, hubZ] = geoToLocal(34.014, -118.288);
const [edgeN0, edgeN1] = geoToLocal(34.025, -118.24);
const [edgeS0, edgeS1] = geoToLocal(33.92, -118.22);

/** Polygon east edge, north point to south point. The district is on the positive side. */
export const EAST_EDGE: FaceBand = {
  x0: edgeN0,
  z0: edgeN1,
  x1: edgeS0,
  z1: edgeS1,
  side: 1,
  band: 1500,
  wall: 190,
};

export const HUB = { x: hubX, z: hubZ, lat: 34.014, lon: -118.288 };

export function eastDistance(x: number, z: number): number {
  return faceDistance(x, z, EAST_EDGE);
}

export const SOUTH_LA_PARAMS: ResidentialParams = {
  module: 3.2,
  height: [45, 130],
  residential: [0.84, 1],
  lit: [0.22, 0.4],
  tint: [0.46, 0.68],
  weights: { bar: 0.22, podium: 0.26, courtyard: 0.3, stepped: 0.12, walkup: 0.1 },
  marketEvery: 5,
  heightBias: 0.55,
  courtReach: 0.94,
  courtCap: 0.98,
  courtBias: 0.7,
  hub: { x: hubX, z: hubZ },
  spines: { a: SPINE_A, b: SPINE_B },
  face: EAST_EDGE,
};
