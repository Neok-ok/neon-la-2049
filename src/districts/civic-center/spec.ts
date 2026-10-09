// Pure module (worker-safe). Shared metres for the LAPD tower, City Hall, the mall between them
// and the police pads. Landmarks, pad lanes, the plaza dresser and the screenshot cameras all read this
// so a pad the mesh draws is the pad a spinner flies to.
import { bearingToYaw } from '../../world/geo';

/** LAPD shaft, crown and podium. Heights match the landmark JSON (216 m, crown 62 m). */
export const HQ = {
  height: 216,
  podiumW: 86,
  podiumD: 118,
  podiumH: 18,
  shaftW: 72,
  shaftD: 100,
  crownW: 132,
  crownD: 165,
  crownH: 62,
  lobbyFloor: 5.2,
  lobbyCeil: 12.4,
  doorHalf: 8.2,
  pad: 22,
  padH: 0.9,
} as const;

export const SHAFT_Y = HQ.height - HQ.crownH;

/** Spinner hover over a pad: above the pad collider, close enough to read as a flare. */
export const HOVER_Y = 222.5;

export const PADS = [
  { id: 'lapd-pad-a', lx: -28, lz: -38 },
  { id: 'lapd-pad-b', lx: 28, lz: -38 },
  { id: 'lapd-pad-c', lx: -28, lz: 38 },
  { id: 'lapd-pad-d', lx: 28, lz: 38 },
] as const;

/** The walk up to the lobby, on the face toward City Hall (local −Z). */
export const STAIR = {
  width: 30,
  /** Outer edge, further from the door. */
  z0: -77.8,
  /** Inner edge, at the threshold. */
  z1: -59.15,
  y0: 0.18,
  y1: HQ.lobbyFloor,
  n: 32,
} as const;

/** City Hall massing. The JSON height (138 m) is the beacon, not the stone pyramid. */
export const HALL = {
  height: 138,
  baseW: 92,
  baseD: 62,
  baseH: 28,
  shaft: 34,
  shaftTop: 100,
  neck: 26,
  neckTop: 114,
  pyramidTop: 132,
  lanternTop: 136,
} as const;

/** Ceremonial stair on the face toward LAPD (local +Z). */
export const HALL_STAIR = {
  width: 22,
  /** Outer tread, at street level. */
  z0: 50.6,
  /** Inner tread, at the landing. */
  z1: 36.4,
  y0: 0.16,
  y1: 3.6,
  n: 22,
} as const;

export function yawOf(bearingDeg: number): number {
  return bearingToYaw(bearingDeg);
}

/** Landmark-local metres to world XZ. Matches GeoWriter: offset (lx cos + lz sin, −lx sin + lz cos). */
export function localToWorld(x: number, z: number, yaw: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}

/**
 * The paved mall between the two monuments. `along` is metres from LAPD toward City Hall.
 * Forecourts stay inside the reserves; this clears the fabric in the gap so the slabs can face each other.
 */
export function inCivicMall(
  ax: number, az: number, bx: number, bz: number,
  x: number, z: number, radius = 40,
): boolean {
  const abx = bx - ax, abz = bz - az;
  const L2 = abx * abx + abz * abz || 1;
  let t = ((x - ax) * abx + (z - az) * abz) / L2;
  t = Math.max(0, Math.min(1, t));
  const px = ax + abx * t, pz = az + abz * t;
  if (Math.hypot(x - px, z - pz) > radius) return false;
  const along = t * Math.sqrt(L2);
  const len = Math.sqrt(L2);
  return along > 100 && along < len - 52;
}

/** Distance from the LAPD→Hall axis, and metres along it from LAPD. */
export function mallAxis(
  ax: number, az: number, bx: number, bz: number, x: number, z: number,
): { along: number; off: number; len: number } {
  const abx = bx - ax, abz = bz - az;
  const len = Math.hypot(abx, abz) || 1;
  const ux = abx / len, uz = abz / len;
  const along = (x - ax) * ux + (z - az) * uz;
  const off = Math.hypot(x - ax - ux * along, z - az - uz * along);
  return { along, off, len };
}
