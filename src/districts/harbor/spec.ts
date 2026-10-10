// Harbor and container port. The Stage 1 polygon, bearing and block stay.
// The archetype id does not: `port` stays registered and unused.
import { hash2i } from '../../core/rng';
import type { CityLayout } from '../../world/layout';

export const BEARING = 0;
export const BLOCK_A = 300;
export const BLOCK_B = 180;
export const STREET = 30;
/**
 * Driving line, metres from the centreline. A 30 m street.
 * Stays above 5 m so haulers are not rickshaws.
 */
export const LANE = 7.5;

export const ARCHETYPE = 'harbor-port';
export const DISTRICT = 'harbor';

/** Nodes, not block indices. Edges whose midpoint leaves the polygon are dropped. */
export const LATTICE = {
  i0: -123,
  i1: -94,
  j0: -29,
  j1: 47,
  prefix: 'hb',
  id: 'harbor-streets',
} as const;

/**
 * North-south street through the yards, clear of the 110 on the west
 * and the river / 710 on the east. Above an 80 m crane house.
 */
export const FREIGHT_J = 6;
/** Above the 80 m house, under the 155 m ambient floor. */
export const FREIGHT_Y = 128;

/** Stall-band container. 2.6 m is inside 2.4–3.4. Length is 3 × 4.0 m. */
export const BOX_L = 12;
export const BOX_W = 2.4;
export const BOX_H = 2.6;

/** 14 × 5.0 m and 16 × 5.0 m. The house is the top of the 10–80 m row. */
export const BOOM_Y = 70;
export const HOUSE_Y = 80;
/** 5 × 5.0 m. */
export const MAST_Y = 25;

/** 24 × 4.0 m hull, beam 4 × 5.0 m, freeboard 4 × 5.0 m from the basin floor. */
export const SHIP_L = 96;
export const SHIP_B = 20;
export const SHIP_H = 20;

/** Metres landward of the harbor-wall centreline. The reserve is 70 m. */
export const SHIP_ACROSS = 150;
export const CRANE_BEHIND = 52;

export interface HarborBlock {
  i: number;
  j: number;
  cx: number;
  cz: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  la: number;
  lb: number;
  street: number;
  ground: number;
  index: number;
}

export function blockIndexAt(x: number, z: number): { i: number; j: number } {
  return { i: Math.round(-z / BLOCK_A - 0.5), j: Math.round(x / BLOCK_B - 0.5) };
}

/** Same seed the fabric generator uses. The chunk buffer stores it as float32. */
export function blockSeed(i: number, j: number, index: number): number {
  return hash2i(i + 100000, j + 100000, index * 7919 + 13);
}

export function harborBlock(layout: CityLayout, i: number, j: number): HarborBlock | null {
  const d = layout.districts.find((x) => x.id === DISTRICT);
  if (!d) return null;
  const cx = (j + 0.5) * BLOCK_B;
  const cz = -(i + 0.5) * BLOCK_A;
  return {
    i, j, cx, cz,
    ax: 0, az: -1, bx: 1, bz: 0,
    la: BLOCK_A - STREET,
    lb: BLOCK_B - STREET,
    street: STREET,
    ground: layout.heightAt(cx, cz),
    index: d.index,
  };
}

/** Distance from a point to the nearest street centreline of this grid. */
export function streetGap(x: number, z: number): number {
  const i = Math.round(-z / BLOCK_A);
  const j = Math.round(x / BLOCK_B);
  const dz = Math.abs(z + i * BLOCK_A);
  const dx = Math.abs(x - j * BLOCK_B);
  return Math.min(dx, dz);
}
