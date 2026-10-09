// Shared Stage 7 measures. Pure (no three.js): the fabric worker can import this.
// Profile and the entrance must stay in lockstep with `_shared/megatower/pyramid.ts`
// (`look: 'wallace'`, entrance face 2, batter 0.42, 7×3 steps, apex cap).

export const PYRAMID_H = 3500;
export const PYRAMID_BASE = 3200;
export const PYRAMID_TOP = 420;
export const PYRAMID_TIERS = 7;
export const PYRAMID_STEPS = 3;
export const PYRAMID_N = PYRAMID_TIERS * PYRAMID_STEPS;
export const BATTER = 0.42;
/** Kit face 2, local −Z. At bearing 0 that is compass north, toward downtown. */
export const ENTRANCE_FACE = 2 as const;

const FN = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;

export function pyramidApex(): number {
  return Math.min(220, PYRAMID_H * 0.06);
}

export function pyramidStepH(): number {
  return (PYRAMID_H - pyramidApex()) / PYRAMID_N;
}

export function widthAt(i: number): number {
  return PYRAMID_BASE + (PYRAMID_TOP - PYRAMID_BASE) * (i / PYRAMID_N);
}

export interface StepProfile {
  y0: number;
  y1: number;
  wb: number;
  wt: number;
}

export function stepProfile(i: number): StepProfile {
  const stepH = pyramidStepH();
  const wb = widthAt(i);
  const wn = widthAt(i + 1);
  const wt = wb - (wb - wn) * BATTER;
  return { y0: i * stepH, y1: (i + 1) * stepH, wb, wt };
}

/** Half-width of the stone at height y (0 at the base). Above the body, the apex footprint. */
export function halfWidthAtY(y: number): number {
  const body = PYRAMID_H - pyramidApex();
  if (y <= 0) return PYRAMID_BASE / 2;
  if (y >= body) return PYRAMID_TOP / 2;
  const i = Math.min(PYRAMID_N - 1, Math.floor(y / pyramidStepH()));
  const s = stepProfile(i);
  const v = (y - s.y0) / Math.max(0.01, s.y1 - s.y0);
  return (s.wb + (s.wt - s.wb) * v) / 2;
}

export interface FaceSample {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Point on a battered step face. `u` is −1..1 across the face ( +1 toward +X on the north face).
 * `v` is 0..1 up the step. Normal points outward and slightly up.
 */
export function faceSample(step: number, face: 0 | 1 | 2 | 3, u: number, v: number): FaceSample {
  const s = stepProfile(step);
  const y = s.y0 + (s.y1 - s.y0) * v;
  const half = (s.wb + (s.wt - s.wb) * v) / 2;
  const [nx, nz] = FN[face];
  const tx = -nz;
  const tz = nx;
  const dHalf = (s.wt - s.wb) / 2;
  const stepH = s.y1 - s.y0;
  let nnx = nx * stepH;
  let nny = -dHalf;
  let nnz = nz * stepH;
  const len = Math.hypot(nnx, nny, nnz) || 1;
  nnx /= len; nny /= len; nnz /= len;
  return {
    x: tx * u * half + nx * half,
    y,
    z: tz * u * half + nz * half,
    nx: nnx, ny: nny, nz: nnz,
  };
}

/** Entrance masses the Stage 3 generator already builds. Local kit metres. */
export function entranceMetrics() {
  const half = PYRAMID_BASE / 2;
  const portalW = PYRAMID_BASE * 0.09;
  const portalH = pyramidStepH() * 1.25;
  const plinthZ = -(half + 200);
  const plinthD = 320;
  const plinthW = portalW * 2.2;
  return {
    half,
    portalW,
    portalH,
    portalZ: -(half + 1.5),
    plinthZ,
    plinthD,
    plinthW,
    plinthH: 3,
    plinthNorth: plinthZ - plinthD / 2,
    plinthSouth: plinthZ + plinthD / 2,
  };
}

/** Walkable court, stair and causeway in kit-local metres (entrance = −Z). */
export const COURT = {
  /** North end of the walled causeway, inside the reserve and short of the district edge. */
  roadNorth: -2360,
  roadSouth: -2100,
  roadHalf: 15,
  wallT: 1.5,
  wallH: 8.6,
  courtHalfW: 220,
  courtNorth: -2100,
  /** Eight risers of 0.375 m (under the 0.45 m step-up) climb onto the Stage 3 plinth. */
  stairRise: 0.375,
  stairTread: 2.4,
  stairN: 8,
  stairHalfW: 56,
  deckY: 3,
  /** Stone bridge from the plinth's south edge to a human door in front of the portal. */
  bridgeHalfW: 4.2,
  doorZ: -1606,
  doorHalfW: 1.15,
  doorH: 2.7,
};

export function stairNorthZ(): number {
  const e = entranceMetrics();
  return e.plinthNorth - COURT.stairN * COURT.stairTread;
}

/** Midpoint of the causeway, kit-local Z. */
export function roadZMid(): number {
  return (COURT.roadNorth + COURT.roadSouth) / 2;
}

export function yawOf(bearingDeg: number): number {
  return (-bearingDeg * Math.PI) / 180;
}

/** Same mapping as the megatower kit frame. */
export function localToWorld(x: number, z: number, yaw: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}

/** A north-south street just west of the 2,400 m reserve, snapped to the 160 m grid. */
export function factoryStreetX(pyramidX: number): number {
  return Math.round((pyramidX - 2620) / 160) * 160;
}

/** An east-west street in the western belt, snapped to the 240 m grid. */
export function factoryStreetZ(pyramidZ: number): number {
  return Math.round((pyramidZ + 1480) / 240) * 240;
}
