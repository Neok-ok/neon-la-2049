// LAX Off-World apron. The Stage 1 polygon, bearing and block stay.
// The archetype id does not: `spaceport` is the unused Stage 1 body.
import { localToGeo } from '../../world/geo';

export const BEARING = 0;
export const BLOCK_A = 420;
export const BLOCK_B = 260;
export const STREET = 60;
/**
 * Driving line, metres from the centreline. A 60 m apron street.
 * Stays above 5 m so the mix is service vehicles, not rickshaws.
 */
export const LANE = 11.5;
/** Office module inside BIBLE §4 (4.0–5.5 m). Terminal roofs are whole floors of this. */
export const FLOOR = 5.0;
/** Hangar eave module, the top of the office range. */
export const BAY = 5.5;

export const ARCHETYPE = 'lax-apron';

export const LATTICE = {
  i0: -34,
  i1: -26,
  j0: -67,
  j1: -48,
  prefix: 'lx',
  id: 'lax-streets',
} as const;

/** 14 floors. The Stage 1 terminal was 70 m. */
export const TERMINAL_H = 14 * FLOOR;
/** Four bays. A clear-span shed, not stacked floors. */
export const HANGAR_H = 4 * BAY;
/** Two bays. A dock office beside the sheds. */
export const SHED_H = 2 * BAY;
/** Three bays. A flood mast, taller than the §4 street lamp so it clears the sheds. */
export const PYLON_H = 3 * BAY;
/** Eleven floors. The standby stack on the pad. It does not leave the ground. */
export const STACK_H = 11 * FLOOR;

export const HALL_S = 148;
export const HALL_A = 48;
export const HALL_B = 168;

/** South row, facing the pads across one street. */
export const TERMINAL_I = -31;
export const TERMINAL_J0 = -64;
export const TERMINAL_J1 = -54;
/** Aligned with the centre pad. */
export const DOOR_J = -59;

/**
 * Block centres nearest the Stage 1 gantry offsets, so the 60 m streets
 * stay off the shafts. Order is west, centre, east.
 */
export const PAD_BLOCKS: ReadonlyArray<readonly [number, number]> = [
  [-29, -62],
  [-30, -59],
  [-29, -56],
];

/** Street line between the centre pad and the terminal. Shuttle altitude is above the roof. */
export const SHUTTLE_LINE = -30;
export const SHUTTLE_Y = 96;

export function blockCenter(i: number, j: number): { x: number; z: number } {
  return { x: (j + 0.5) * BLOCK_B, z: -(i + 0.5) * BLOCK_A };
}

export function indexOf(cx: number, cz: number): { i: number; j: number } {
  return {
    i: Math.round(-cz / BLOCK_A - 0.5),
    j: Math.round(cx / BLOCK_B - 0.5),
  };
}

export function isPad(i: number, j: number): boolean {
  for (const [a, b] of PAD_BLOCKS) if (a === i && b === j) return true;
  return false;
}

export function isTerminal(i: number, j: number): boolean {
  return i === TERMINAL_I && j >= TERMINAL_J0 && j <= TERMINAL_J1;
}

export function padCenter(index: number): { x: number; z: number } {
  const pair = PAD_BLOCKS[index] ?? PAD_BLOCKS[1]!;
  return blockCenter(pair[0], pair[1]);
}

/** North face of the door hall, just outside the solid, on the apron. */
export function doorSite(): { x: number; z: number; lat: number; lon: number } {
  const c = blockCenter(TERMINAL_I, DOOR_J);
  const s = HALL_S + HALL_A / 2 + 1.2;
  const z = c.z - s;
  const [lat, lon] = localToGeo(c.x, z);
  return { x: c.x, z, lat, lon };
}
