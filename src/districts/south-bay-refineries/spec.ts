// South Bay refineries. The Stage 1 polygon, bearing and block stay.
// The archetype id does not: `industrial` stays registered and unused.
import { hash2i } from '../../core/rng';
import type { CityLayout, Landmark } from '../../world/layout';
import type { RefineryParams } from '../_shared/refinery/params';
import type { RefineryBlock } from '../_shared/refinery/plan';

export const BEARING = 0;
export const BLOCK_A = 260;
export const BLOCK_B = 170;
export const STREET = 24;
/**
 * Driving line, metres from the centreline. A 24 m street.
 * Stays above 5 m so tankers are not rickshaws.
 */
export const LANE = 6.2;

export const ARCHETYPE = 'south-bay-refinery';

/** Nodes, not block indices. Edges whose midpoint leaves the polygon are dropped. */
export const LATTICE = {
  i0: -108,
  i1: -52,
  j0: -87,
  j1: 13,
  prefix: 'sb',
  id: 'south-bay-streets',
} as const;

/** North-south street clear of the flare field and the 110. */
export const FREIGHT_J = -30;
/** Above a 140 m stack and the flame head. */
export const FREIGHT_Y = 196;

/**
 * Door of the control room, not the block centre.
 * Block i = −64, j = −36, south face at DOOR_S.
 */
export const CONTROL = { i: -64, j: -36 } as const;
export const DOOR_S = -58;
/** 3 × 4.0 m, the low end of the §4 office module. Taller than the belt's 10.2 m house. */
export const PUMP_H = 12;

/** West of this, sphere farms take a larger share. The sea wall is still the coastal strip's. */
export const COAST_X = -11200;

export const SOUTH_BAY_PARAMS: RefineryParams = {
  tanks: true,
  racks: true,
  towers: true,
  flares: true,
  spheres: true,
  jetty: true,
  tankShare: 0.36,
  sphereShare: 0.14,
  towerShare: 0.2,
  pipeShare: 0.18,
  rackOnEdge: 0.55,
  flareOnYard: 0.36,
  stack: [100, 140],
  tower: [50, 60],
  doorS: DOOR_S,
  pumpH: PUMP_H,
  module: 5,
  sphere: [16.8, 25.2],
};

const doorX = (CONTROL.j + 0.5) * BLOCK_B;
const doorZ = -(CONTROL.i + 0.5) * BLOCK_A - DOOR_S;

export function blockIndexAt(x: number, z: number): { i: number; j: number } {
  return { i: Math.round(-z / BLOCK_A - 0.5), j: Math.round(x / BLOCK_B - 0.5) };
}

/** Same seed the fabric generator uses. The chunk buffer stores it as float32. */
export function blockSeed(i: number, j: number, index: number): number {
  return hash2i(i + 100000, j + 100000, index * 7919 + 13);
}

export function southBayBlock(layout: CityLayout, i: number, j: number): RefineryBlock | null {
  const d = layout.districts.find((x) => x.id === 'south-bay-refineries');
  if (!d) return null;
  const cx = (j + 0.5) * BLOCK_B;
  const cz = -(i + 0.5) * BLOCK_A;
  return {
    cx, cz,
    ax: 0, az: -1, bx: 1, bz: 0,
    la: BLOCK_A - STREET,
    lb: BLOCK_B - STREET,
    street: STREET,
    seed: blockSeed(i, j, d.index),
    ground: layout.heightAt(cx, cz),
  };
}

export function isControlBlock(block: RefineryBlock): boolean {
  return Math.hypot(block.cx - doorX, block.cz - (doorZ + DOOR_S)) < 80;
}

export function doorWorld(block: RefineryBlock): { x: number; y: number; z: number } {
  return {
    x: block.cx + block.ax * DOOR_S,
    y: block.ground,
    z: block.cz + block.az * DOOR_S,
  };
}

export function controlBlock(layout: CityLayout): RefineryBlock | null {
  const block = southBayBlock(layout, CONTROL.i, CONTROL.j);
  if (!block) return null;
  if (layout.districtAt(block.cx, block.cz).id !== 'south-bay-refineries') return null;
  return block;
}

/** The published flare-field rectangle, plus a margin, so fabric does not sit on the stacks. */
export function flareKeepOut(layout: CityLayout): (x: number, z: number) => boolean {
  const lm = layout.landmarkById('el-segundo-refinery');
  return (x, z) => inFlareFootprint(lm, x, z);
}

export function inFlareFootprint(lm: Landmark | undefined, x: number, z: number): boolean {
  if (!lm || lm.type !== 'flare-field') return false;
  const hw = lm.baseWidth / 2 + 18;
  const hd = (lm.baseDepth ?? lm.baseWidth) / 2 + 18;
  return Math.abs(x - lm.x) < hw && Math.abs(z - lm.z) < hd;
}

export function coastParams(block: RefineryBlock): RefineryParams {
  if (block.cx >= COAST_X) return SOUTH_BAY_PARAMS;
  return {
    ...SOUTH_BAY_PARAMS,
    tankShare: 0.24,
    sphereShare: 0.4,
    towerShare: 0.14,
    pipeShare: 0.12,
  };
}
