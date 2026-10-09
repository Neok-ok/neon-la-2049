// Arts District Works. Grid and pins. The Stage 1 polygon, bearing and block stay.
import { hash2i } from '../../core/rng';
import { geoToLocal } from '../../world/geo';
import type { CityLayout } from '../../world/layout';

export const BEARING = 0;
export const BLOCK_A = 160;
export const BLOCK_B = 110;
export const STREET = 20;
/** Driving line, metres from the centreline. A 20 m street; stays above 5 m so trucks are not rickshaws. */
export const LANE = 6.4;

export const LATTICE = {
  i0: -15,
  i1: -1,
  j0: 3,
  j1: 12,
  prefix: 'ad',
  id: 'arts-streets',
} as const;

/** Freight spinner run on the north-south street at this grid line. Above the 140 m stacks. */
export const FREIGHT_J = 7;
export const FREIGHT_Y = 176;

/**
 * Enterable pour hall, then two more glowing halls.
 * Each pin sits inside one block; 70 m is less than the gap to the next centre.
 */
export const FOUNDRIES = [
  { id: 'pour', lat: 34.041, lon: -118.2345, enter: true },
  { id: 'north', lat: 34.0472, lon: -118.2332, enter: false },
  { id: 'south', lat: 34.0343, lon: -118.2333, enter: false },
] as const;

export type FoundryId = (typeof FOUNDRIES)[number]['id'];

/** South face of the pour hall, block-local metres along A. The door is this face. */
export const DOOR_S = -64;
export const HALL = {
  s0: DOOR_S,
  s1: -18,
  t0: -22,
  t1: 22,
  wall: 0.55,
  /** Half-width of the street opening. Wider than the interior corridor. */
  gap: 1.85,
  roofY: 14.6,
  roofH: 0.7,
  clerestoryY: 11.4,
  clerestoryH: 2.4,
} as const;

export interface ArtsBlock {
  cx: number;
  cz: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  la: number;
  lb: number;
  street: number;
  seed: number;
  ground: number;
}

export function blockIndexAt(x: number, z: number): { i: number; j: number } {
  return { i: Math.floor(-z / BLOCK_A), j: Math.floor(x / BLOCK_B) };
}

/** Same seed the fabric generator uses, so a camera plan matches the mesh. */
export function artsBlock(layout: CityLayout, i: number, j: number): ArtsBlock {
  const d = layout.districts.find((x) => x.id === 'arts-district');
  const cx = (j + 0.5) * BLOCK_B;
  const cz = -(i + 0.5) * BLOCK_A;
  return {
    cx, cz,
    ax: 0, az: -1, bx: 1, bz: 0,
    la: BLOCK_A - STREET,
    lb: BLOCK_B - STREET,
    street: STREET,
    seed: d ? hash2i(i + 100000, j + 100000, d.index * 7919 + 13) : 1,
    ground: layout.heightAt(cx, cz),
  };
}

export function foundryAt(block: ArtsBlock): FoundryId | null {
  for (const f of FOUNDRIES) {
    const [x, z] = geoToLocal(f.lat, f.lon);
    if (Math.hypot(block.cx - x, block.cz - z) < 70) return f.id;
  }
  return null;
}

export function doorWorld(block: ArtsBlock): { x: number; y: number; z: number } {
  return {
    x: block.cx + block.ax * DOOR_S,
    y: block.ground,
    z: block.cz + block.az * DOOR_S,
  };
}

const [pourX, pourZ] = geoToLocal(FOUNDRIES[0].lat, FOUNDRIES[0].lon);

export function pourBlock(layout: CityLayout): ArtsBlock | null {
  const { i, j } = blockIndexAt(pourX, pourZ);
  const block = artsBlock(layout, i, j);
  if (layout.districtAt(block.cx, block.cz).id !== 'arts-district') return null;
  return block;
}
