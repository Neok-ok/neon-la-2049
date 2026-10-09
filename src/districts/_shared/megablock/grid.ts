// Pure module (worker-safe). Downtown grid helpers shared by the megablock kit, the DTLA dresser,
// the street graph and the screenshot cameras. The 38° / 205×125 m grid is the one DTLA, the Financial
// District and Civic Center all use, so a lane or a walkway height agreed here meets across district edges.
import { hash2i } from '../../../core/rng';
import { bearingToDir } from '../../../world/geo';

export const DOWNTOWN_BEARING = 38;
/** Centre-to-centre block size along grid A / B. Street width is district-specific. */
export const DOWNTOWN_BLOCK_A = 205;
export const DOWNTOWN_BLOCK_B = 125;

/** Deck heights (m). Low pair sits under the 90 m minimum mass; high pair is the canyon's upper walk. */
export const WALK_LEVELS = [46, 68, 92, 118] as const;

export function gridAxes(bearing = DOWNTOWN_BEARING): { ax: number; az: number; bx: number; bz: number } {
  const [ax, az] = bearingToDir(bearing);
  const [bx, bz] = bearingToDir(bearing + 90);
  return { ax, az, bx, bz };
}

/** Block indices whose centre is nearest (x, z) on the downtown grid. */
export function blockIndexAt(x: number, z: number): { i: number; j: number } {
  const { ax, az, bx, bz } = gridAxes();
  const s = x * ax + z * az;
  const t = x * bx + z * bz;
  return { i: Math.round(s / DOWNTOWN_BLOCK_A - 0.5), j: Math.round(t / DOWNTOWN_BLOCK_B - 0.5) };
}

export function blockCenter(i: number, j: number): { x: number; z: number } {
  const { ax, az, bx, bz } = gridAxes();
  const s = (i + 0.5) * DOWNTOWN_BLOCK_A;
  const t = (j + 0.5) * DOWNTOWN_BLOCK_B;
  return { x: ax * s + bx * t, z: az * s + bz * t };
}

/**
 * Deck height for the street on grid line (`i`, `j`).
 * `axis` 0: the line of constant j (the street runs along A). `axis` 1: constant i, street runs along B.
 * Both blocks that share the line must call this with the line index, not their own block index.
 */
export function lineWalkY(i: number, j: number, axis: 0 | 1, high: boolean): number {
  const h = hash2i(i, j, axis + (high ? 40 : 7));
  return high ? WALK_LEVELS[2 + (h % 2)]! : WALK_LEVELS[h % 2]!;
}

/** A second, higher deck on about three streets in five. */
export function lineHasHigh(i: number, j: number, axis: 0 | 1): boolean {
  return hash2i(i, j, axis + 90) % 100 < 62;
}
