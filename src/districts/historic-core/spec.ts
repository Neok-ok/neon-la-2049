// Broadway / historic-core grid. Same bearing as downtown, different block and street.
// +A is NNE (bearing 38°). Broadway runs along A. +B is mostly east. South along Broadway is −A.
import { bearingToYaw } from '../../world/geo';

export const BEARING = 38;
export const BLOCK_A = 110;
export const BLOCK_B = 70;
export const STREET = 18;
/** Driving line, metres off the centre of an 18 m street. Downtown avenues stay at 7.2. */
export const LANE = 3.15;

const RAD = (BEARING * Math.PI) / 180;
export const AX = Math.sin(RAD);
export const AZ = -Math.cos(RAD);
export const BX = Math.cos(RAD);
export const BZ = Math.sin(RAD);

/** East Broadway frontage: block row j = −3, face b−, street centre t = −210. */
export const BROADWAY_J = -3;
export const BROADWAY_T = BROADWAY_J * BLOCK_B;
/** The next street east (Spring-side). The footbridge spans this one, not Broadway. */
export const BRIDGE_J = -2;
export const BRIDGE_T = BRIDGE_J * BLOCK_B;

/** Published Bradbury pin, snapped so the 48 m depth is centred behind the east façade. */
export const BRADBURY_S = -381.26;
export const BRADBURY_T = -177;
/** Stage-1 footbridge pin, snapped 11 m onto the Spring-side centreline. */
export const BRIDGE_S = -718.41;

/**
 * GeoWriter yaw whose local +Z faces the Broadway street (−B, toward decreasing t).
 * Local +X is then −A (south along the street).
 */
export const FACE_YAW = Math.atan2(-BX, -BZ);

/** Bridge deck runs across the street. Local +X is +B, local +Z is −A. */
export const BRIDGE_YAW = bearingToYaw(BEARING);

/** Block (i, j) that owns the Bradbury footprint. Side bays in that block still build. */
export const BRADBURY_I = -4;
export const BRADBURY_J = BROADWAY_J;
/** Block-local hole, metres from the block centre. Includes the side and back jackets. */
export const BRADBURY_HOLE = { s0: -18, s1: 23.5, t0: -26.5, t1: 25 };

export function gridToWorld(s: number, t: number): [number, number] {
  return [AX * s + BX * t, AZ * s + BZ * t];
}

export function worldToGrid(x: number, z: number): [number, number] {
  return [x * AX + z * AZ, x * BX + z * BZ];
}

export function localToWorld(x: number, z: number, yaw: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}

/** Compass heading (radians) whose forward is (sin h, −cos h). */
export function headingAlong(dx: number, dz: number): number {
  return Math.atan2(dx, -dz);
}
