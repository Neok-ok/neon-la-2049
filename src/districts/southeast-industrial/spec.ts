// Southeast Refinery Belt. The Stage 1 polygon, bearing and block stay.
// The archetype id does not: `industrial` stays registered and unused. South Bay is `south-bay-refinery`.
import { hash2i } from '../../core/rng';
import { geoToLocal } from '../../world/geo';
import type { CityLayout } from '../../world/layout';
import type { RefineryParams } from '../_shared/refinery/params';
import type { RefineryBlock } from '../_shared/refinery/plan';

export const BEARING = 0;
export const BLOCK_A = 260;
export const BLOCK_B = 170;
export const STREET = 26;
/** Driving line, metres from the centreline. A 26 m street. Stays above 5 m so trucks are not rickshaws. */
export const LANE = 6.6;

export const LATTICE = {
  i0: -45,
  i1: -9,
  j0: 30,
  j1: 68,
  prefix: 'se',
  id: 'southeast-streets',
} as const;

/** Freight spinner run on the north-south street at this grid line. East of both pyramid reserves. */
export const FREIGHT_J = 62;
/** Above a 140 m stack, with the same kind of gap the works use over theirs. */
export const FREIGHT_Y = 188;

/**
 * Door of the pump house, not the block centre.
 * Block i = −18, j = 38, south face at DOOR_S.
 */
export const PUMP = { lat: 34.010527, lon: -118.172738 } as const;
export const DOOR_S = -58;

export const SOUTHEAST_PARAMS: RefineryParams = {
  tanks: true,
  racks: true,
  towers: true,
  flares: true,
  tankShare: 0.4,
  towerShare: 0.22,
  pipeShare: 0.2,
  rackOnEdge: 0.62,
  flareOnYard: 0.22,
  stack: [84, 140],
  tower: [32, 58],
  doorS: DOOR_S,
};

const [pumpX, pumpZ] = geoToLocal(PUMP.lat, PUMP.lon);

export function blockIndexAt(x: number, z: number): { i: number; j: number } {
  return { i: Math.floor(-z / BLOCK_A), j: Math.floor(x / BLOCK_B) };
}

/** Same seed the fabric generator uses, so a camera plan matches the mesh. */
export function southeastBlock(layout: CityLayout, i: number, j: number): RefineryBlock | null {
  const d = layout.districts.find((x) => x.id === 'southeast-industrial');
  if (!d) return null;
  const cx = (j + 0.5) * BLOCK_B;
  const cz = -(i + 0.5) * BLOCK_A;
  return {
    cx, cz,
    ax: 0, az: -1, bx: 1, bz: 0,
    la: BLOCK_A - STREET,
    lb: BLOCK_B - STREET,
    street: STREET,
    seed: hash2i(i + 100000, j + 100000, d.index * 7919 + 13),
    ground: layout.heightAt(cx, cz),
  };
}

export function isPumpBlock(block: RefineryBlock): boolean {
  return Math.hypot(block.cx - pumpX, block.cz - pumpZ) < 110;
}

export function doorWorld(block: RefineryBlock): { x: number; y: number; z: number } {
  return {
    x: block.cx + block.ax * DOOR_S,
    y: block.ground,
    z: block.cz + block.az * DOOR_S,
  };
}

export function pumpBlock(layout: CityLayout): RefineryBlock | null {
  const { i, j } = blockIndexAt(pumpX, pumpZ);
  const block = southeastBlock(layout, i, j);
  if (!block) return null;
  if (layout.districtAt(block.cx, block.cz).id !== 'southeast-industrial') return null;
  return block;
}
