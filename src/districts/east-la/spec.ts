// East LA numbers. The shared planner stays free of this district's streets.
import { hash2i } from '../../core/rng';
import { bearingToDir, geoToLocal, localToGeo } from '../../world/geo';
import type { SprawlFace, SprawlParams } from '../_shared/sprawl/plan';

export const BEARING = 0;
export const BLOCK_A = 170;
export const BLOCK_B = 95;
export const STREET = 16;
/**
 * Driving line, metres from the centreline. A 16 m street holds 5.1 m and stays
 * at or above 5 m, so the cars stay cars. Same fit the basin uses on 16 m streets.
 */
export const LANE = 5.1;

export const ARCHETYPE = 'east-la-sprawl';
export const DISTRICT = 'east-la';

/** Nodes, not block indices. Edges whose midpoint leaves the polygon are dropped. */
export const LATTICE = {
  i0: -22,
  i1: 20,
  j0: 13,
  j1: 112,
  prefix: 'el',
  id: 'east-la-streets',
} as const;

/**
 * East-west street lines (axis A index), snapped to the 170 m grid.
 * Whittier, a mid-basin arterial, Cesar Chavez.
 */
export const STRIP_A = [-19, -10, -4] as const;
/** North-south street lines (axis B index), snapped to the 95 m grid. Soto, Indiana, Atlantic. */
export const STRIP_B = [23, 50, 82] as const;

/** Block that holds the covered market. Indices are the generator's i, j. */
export const HUB_I = -5;
export const HUB_J = 49;

/** Deck surface above the grade at a crossing. Grade streaks on the 5 and the 710 sit at +0.28 m. */
export const DECK_TOP = 0.22;
/** Slab thickness. Soffit is DECK_TOP − this. */
export const DECK_THICK = 0.58;
/** Plan radius of a connector ribbon. The chord stays inside the ground cut. */
export const RAMP_RADIUS = 46;
export const DECK_WIDTH = 16;
export const DECK_LENGTH = 108;

const [ax, az] = bearingToDir(BEARING);
const [bx, bz] = bearingToDir(BEARING + 90);

export function blockCentre(i: number, j: number): { x: number; z: number } {
  const s = (i + 0.5) * BLOCK_A;
  const t = (j + 0.5) * BLOCK_B;
  return { x: ax * s + bx * t, z: az * s + bz * t };
}

const hub = blockCentre(HUB_I, HUB_J);
const [hubLat, hubLon] = localToGeo(hub.x, hub.z);

/** Door is 51 m north of the block centre (la/2 − 26 on this grid). Faces south. */
const doorZ = hub.z - (BLOCK_A - STREET) / 2 + 26;
const [doorLat, doorLon] = localToGeo(hub.x, doorZ);

export const HUB = { x: hub.x, z: hub.z, lat: hubLat, lon: hubLon };
export const MARKET_DOOR = { x: hub.x, z: doorZ, lat: doorLat, lon: doorLon };

const [edgeN0, edgeN1] = geoToLocal(34.08, -118.228);
const [edgeS0, edgeS1] = geoToLocal(34.03, -118.229);

/**
 * Polygon west edge, north point to south point. The district is on the negative
 * cross of that segment, so `side` is −1 and the signed distance stays positive inside.
 */
export const WEST_EDGE: SprawlFace = {
  x0: edgeN0,
  z0: edgeN1,
  x1: edgeS0,
  z1: edgeS1,
  side: -1,
  band: 640,
};

export const EAST_LA_PARAMS: SprawlParams = {
  id: DISTRICT,
  module: 3.4,
  storeys: [3, 12],
  cap: 60,
  lit: [0.24, 0.5],
  tint: [0.64, 0.9],
  strips: { a: STRIP_A, b: STRIP_B },
  towers: {
    lines: { a: STRIP_A, b: STRIP_B },
    clusters: [{ x: hub.x, z: hub.z, radius: 280 }],
    lineChance: 0.2,
  },
  hub: { x: hub.x, z: hub.z },
  rise: WEST_EDGE,
  walls: true,
};

/** Same integer the chunk worker stores. The detail buffer ships it as float32. */
export function blockSeed(i: number, j: number, index: number): number {
  return hash2i(i + 100000, j + 100000, index * 7919 + 13);
}
