// Long Beach secondary core. The Stage 1 polygon, bearing and block stay.
// The archetype id does not: `megablock-downtown` stays DTLA's body.
import { hash2i } from '../../core/rng';
import { localToGeo } from '../../world/geo';
import type { CityLayout } from '../../world/layout';

export const BEARING = 0;
export const BLOCK_A = 190;
export const BLOCK_B = 120;
export const STREET = 30;
/**
 * Driving line, metres from the centreline. A 30 m street.
 * Stays above 5 m so the mix stays cars and vans, not rickshaws.
 * Distinct from the harbor's 7.5 m line on the same street width.
 */
export const LANE = 6.8;

export const ARCHETYPE = 'long-beach-core';
export const DISTRICT = 'long-beach';

/** Nodes, not block indices. Edges whose midpoint leaves the polygon are dropped. */
export const LATTICE = {
  i0: -179,
  i1: -147,
  j0: 72,
  j1: 118,
  prefix: 'lb',
  id: 'long-beach-streets',
} as const;

/**
 * East-west street on the south side of the core slab.
 * Above a 180 m roof, under the 220 m ambient floor.
 */
export const FREIGHT_I = -163;
/** Clears the 180 m roof. Roof plant can reach about 204 m, but it sits on the block, not this centreline. */
export const FREIGHT_Y = 200;

/** Office module inside the §4 4.0–5.5 m band. Roofs snap to this. */
export const MODULE = 5;

/** Two invented peaks. The field stays at or under 155 m so these two own the skyline. */
export const HERO_A = { i: -163, j: 95, height: 180 } as const;
export const HERO_B = { i: -161, j: 99, height: 165 } as const;

/** South face of the concourse, block-local metres along A. Faces the street (yaw 0). */
export const DOOR_S = -78;

export interface LongBeachBlock {
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

export function longBeachBlock(layout: CityLayout, i: number, j: number): LongBeachBlock | null {
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

export interface ConcourseDoor {
  x: number;
  y: number;
  z: number;
  yaw: number;
  lat: number;
  lon: number;
}

/** Threshold on the south face. Yaw 0 points local +Z south, so the room runs north into the shell. */
export function concourseDoor(layout: CityLayout): ConcourseDoor {
  const b = longBeachBlock(layout, HERO_A.i, HERO_A.j);
  const cx = b?.cx ?? (HERO_A.j + 0.5) * BLOCK_B;
  const cz = b?.cz ?? -(HERO_A.i + 0.5) * BLOCK_A;
  const ground = b?.ground ?? 0;
  const x = cx;
  const z = cz - DOOR_S;
  const [lat, lon] = localToGeo(x, z);
  return { x, y: ground, z, yaw: 0, lat, lon };
}
