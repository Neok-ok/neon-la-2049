// Pure wall geometry for the Sepulveda and Harbor sea walls.
// The cross-section matches the Stage 1 extrusion in Landmarks.buildSeaWalls.
// Distances are metres. +across is seaward, +along follows the polyline (A → B).
import type { CityLayout, SeaWall } from '../../world/layout';

export const SEA_Y = 6;
export const PIECE_M = 72;
export const HARBOR_PIECE_M = 128;
export const JOINT_M = 40;
/** Stair centre, metres along the wall from the point nearest `sea-wall-fight`. */
export const STAIR_ALONG = 8;
export const STAIR_GAP = 4.6;
export const PARAPET_H = 1.15;
export const PARAPET_T = 0.46;
export const TOWER_EVERY = 520;
export const HARBOR_TOWER_EVERY = 780;
export const TOWER_ACROSS = -6;
export const TOWER_SIZE = 4.7;
export const TOWER_H = 7.7;
export const COLLIDER_RUN = 160;
export const COLLIDER_OVERLAP = 12;

export interface WallProfile {
  id: string;
  H: number;
  base: number;
  crest: number;
  terraces: number;
  land: number;
  toeAcross: number;
  toeY: number;
  pts: [number, number][];
  treads: { inner: number; outer: number; y: number }[];
}

export interface WallFrame {
  x: number;
  z: number;
  nx: number;
  nz: number;
  tx: number;
  tz: number;
  yaw: number;
  H: number;
  crest: number;
}

export interface WallPiece {
  key: string;
  wallId: string;
  harbor: boolean;
  index: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  len: number;
  chain0: number;
  frame: WallFrame;
  profile: WallProfile;
}

export interface WallHit {
  piece: WallPiece;
  across: number;
  along: number;
  dist: number;
  x: number;
  z: number;
  chain: number;
  frame: WallFrame;
}

export interface Slice {
  across0: number;
  across1: number;
  y0: number;
  top: number;
}

export interface WaveState {
  storm: number;
  period: number;
  phase: number;
  impact: number;
  amp: number;
}

export interface CoastBudget {
  cap: number;
  reach: number;
  waves: boolean;
  ribbonX: number;
  ribbonZ: number;
  spray: number;
}

export function wallProfile(wall: Pick<SeaWall, 'id' | 'crestHeight' | 'baseWidth' | 'crestWidth' | 'terraces'>): WallProfile {
  const H = wall.crestHeight;
  const base = wall.baseWidth;
  const crest = wall.crestWidth;
  const T = wall.terraces;
  const land = -crest / 2 - 8;
  const pts: [number, number][] = [[land, -2], [-crest / 2, H], [crest / 2, H]];
  const run = base - crest;
  const treads: WallProfile['treads'] = [];
  for (let k = 0; k < T; k++) {
    const x0 = crest / 2 + (run * k) / T;
    const yBot = H - (H * (k + 1)) / T;
    pts.push([x0 + (run / T) * 0.35, yBot + 2]);
    pts.push([x0 + run / T, yBot]);
    treads.push({ inner: x0, outer: x0 + run / T, y: yBot });
  }
  const toeAcross = base - crest / 2 + 4;
  pts.push([toeAcross, -12]);
  return { id: wall.id, H, base, crest, terraces: T, land, toeAcross, toeY: -12, pts, treads };
}

/** Last profile crossing of sea level. The landward batter also crosses y = 6; that one is not the toe. */
export function waterlineAcross(p: WallProfile, sea = SEA_Y): number {
  let last = p.toeAcross;
  for (let i = 0; i < p.pts.length - 1; i++) {
    const [a, ay] = p.pts[i]!;
    const [b, by] = p.pts[i + 1]!;
    if ((ay - sea) * (by - sea) > 0 || ay === by) continue;
    const t = (sea - ay) / (by - ay);
    last = a + (b - a) * t;
  }
  return last;
}

/** Walkable mass, stepped so a 0.45 m step-up cannot climb the batter. */
export function massSlices(p: WallProfile): Slice[] {
  const slices: Slice[] = [];
  const steps = 5;
  const a0 = p.land;
  const a1 = -p.crest / 2;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const top = -2 + (p.H + 2) * t1;
    slices.push({
      across0: a0 + (a1 - a0) * t0,
      across1: a0 + (a1 - a0) * t1,
      y0: -16,
      top,
    });
  }
  slices.push({ across0: -p.crest / 2, across1: p.crest / 2, y0: -16, top: p.H });
  for (const t of p.treads) {
    slices.push({ across0: t.inner, across1: t.outer, y0: -16, top: t.y });
  }
  const lip = p.treads[p.treads.length - 1]?.outer ?? p.crest / 2;
  slices.push({ across0: lip, across1: p.toeAcross + 2, y0: -18, top: -2 });
  return slices;
}

export function framePoint(f: WallFrame, across: number, along: number): { x: number; z: number } {
  return {
    x: f.x + f.nx * across + f.tx * along,
    z: f.z + f.nz * across + f.tz * along,
  };
}

export function frameAt(piece: WallPiece, u: number): WallFrame {
  const t = Math.max(0, Math.min(1, u));
  return {
    ...piece.frame,
    x: piece.ax + (piece.bx - piece.ax) * t,
    z: piece.az + (piece.bz - piece.az) * t,
  };
}

/** Along-intervals for a parapet of half-length `half`, with a stair gap in local along. */
export function parapetRuns(half: number, stairLocal: number | null, gap = STAIR_GAP): [number, number][] {
  if (stairLocal === null || stairLocal < -half - 1 || stairLocal > half + 1) return [[-half, half]];
  const a = stairLocal - gap / 2;
  const b = stairLocal + gap / 2;
  const runs: [number, number][] = [];
  if (a > -half + 0.25) runs.push([-half, Math.min(a, half)]);
  if (b < half - 0.25) runs.push([Math.max(b, -half), half]);
  if (!runs.length) runs.push([-half, half]);
  return runs;
}

export function coastBudget(tier: 'low' | 'medium' | 'high' | 'ultra'): CoastBudget {
  if (tier === 'low') return { cap: 2, reach: 420, waves: false, ribbonX: 0, ribbonZ: 0, spray: 0 };
  if (tier === 'medium') return { cap: 4, reach: 780, waves: true, ribbonX: 40, ribbonZ: 12, spray: 16 };
  if (tier === 'high') return { cap: 7, reach: 1000, waves: true, ribbonX: 64, ribbonZ: 16, spray: 32 };
  return { cap: 10, reach: 1200, waves: true, ribbonX: 80, ribbonZ: 18, spray: 48 };
}

/** Shared by the breaker shader and the surf bus so impacts land on the same frame. */
export function waveClock(time: number, rain: number, wind: number): WaveState {
  const storm = Math.max(0, Math.min(1, rain * 0.72 + Math.min(wind, 12) / 18));
  const period = 9.2 - storm * 4.4;
  const phase = period > 0 ? (time % period) / period : 0;
  const impact = Math.max(0, 1 - Math.abs(phase - 0.78) / 0.065);
  const amp = 0.42 + storm * 1.85;
  return { storm, period, phase, impact, amp };
}

export function orientSegment(layout: CityLayout, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz) || 1;
  let nx = -dz / len;
  let nz = dx / len;
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  if (!layout.isOcean(mx + nx * 400, mz + nz * 400) && layout.isOcean(mx - nx * 400, mz - nz * 400)) {
    nx = -nx;
    nz = -nz;
  }
  return { nx, nz, tx: dx / len, tz: dz / len, yaw: Math.atan2(nx, nz), len };
}

let pieceCache: { layout: CityLayout; pieces: WallPiece[] } | null = null;

export function wallPieces(layout: CityLayout): WallPiece[] {
  if (pieceCache?.layout === layout) return pieceCache.pieces;
  const pieces: WallPiece[] = [];
  for (const wall of layout.seaWalls) {
    const profile = wallProfile(wall);
    const harbor = wall.id === 'harbor-sea-wall';
    const step = harbor ? HARBOR_PIECE_M : PIECE_M;
    let chain = 0;
    let index = 0;
    for (let i = 0; i < wall.pts.length - 1; i++) {
      const ax0 = wall.pts[i]![0];
      const az0 = wall.pts[i]![1];
      const bx0 = wall.pts[i + 1]![0];
      const bz0 = wall.pts[i + 1]![1];
      const o = orientSegment(layout, ax0, az0, bx0, bz0);
      for (let s = 0; s < o.len - 0.4; s += step) {
        const e = Math.min(o.len, s + step);
        const ax = ax0 + o.tx * s;
        const az = az0 + o.tz * s;
        const bx = ax0 + o.tx * e;
        const bz = az0 + o.tz * e;
        const len = e - s;
        const frame: WallFrame = {
          x: (ax + bx) / 2,
          z: (az + bz) / 2,
          nx: o.nx,
          nz: o.nz,
          tx: o.tx,
          tz: o.tz,
          yaw: o.yaw,
          H: profile.H,
          crest: profile.crest,
        };
        pieces.push({
          key: `${wall.id}:${index}`,
          wallId: wall.id,
          harbor,
          index,
          ax, az, bx, bz, len,
          chain0: chain + s,
          frame,
          profile,
        });
        index++;
      }
      chain += o.len;
    }
  }
  pieceCache = { layout, pieces };
  return pieces;
}

export function projectPiece(piece: WallPiece, x: number, z: number) {
  const dx = x - piece.ax;
  const dz = z - piece.az;
  let along = dx * piece.frame.tx + dz * piece.frame.tz;
  along = Math.max(0, Math.min(piece.len, along));
  const qx = piece.ax + piece.frame.tx * along;
  const qz = piece.az + piece.frame.tz * along;
  const vx = x - qx;
  const vz = z - qz;
  return {
    across: vx * piece.frame.nx + vz * piece.frame.nz,
    along,
    qx,
    qz,
    dist: Math.hypot(vx, vz),
    chain: piece.chain0 + along,
  };
}

export function nearestWall(layout: CityLayout, x: number, z: number): WallHit {
  const pieces = wallPieces(layout);
  let best = pieces[0]!;
  let bestP = projectPiece(best, x, z);
  for (let i = 1; i < pieces.length; i++) {
    const piece = pieces[i]!;
    const p = projectPiece(piece, x, z);
    if (p.dist < bestP.dist) {
      best = piece;
      bestP = p;
    }
  }
  const frame: WallFrame = { ...best.frame, x: bestP.qx, z: bestP.qz };
  return {
    piece: best,
    across: bestP.across,
    along: bestP.along,
    dist: bestP.dist,
    x: bestP.qx,
    z: bestP.qz,
    chain: bestP.chain,
    frame,
  };
}

let fightCache: { layout: CityLayout; hit: WallHit } | null = null;

export function fightHit(layout: CityLayout): WallHit {
  if (fightCache?.layout === layout) return fightCache.hit;
  const poi = layout.poiById('sea-wall-fight');
  const hit = nearestWall(layout, poi?.x ?? 0, poi?.z ?? 0);
  fightCache = { layout, hit };
  return hit;
}

export function stairChain(layout: CityLayout): number {
  const hit = fightHit(layout);
  return hit.chain + STAIR_ALONG;
}

export interface TowerSite {
  wallId: string;
  chain: number;
  frame: WallFrame;
}

let towerCache: { layout: CityLayout; sites: TowerSite[] } | null = null;

export function towerSites(layout: CityLayout): TowerSite[] {
  if (towerCache?.layout === layout) return towerCache.sites;
  const sites: TowerSite[] = [];
  const fight = fightHit(layout);
  const stair = fight.chain + STAIR_ALONG;
  const pieces = wallPieces(layout);
  const byWall = new Map<string, WallPiece[]>();
  for (const p of pieces) {
    const list = byWall.get(p.wallId);
    if (list) list.push(p);
    else byWall.set(p.wallId, [p]);
  }
  for (const [wallId, list] of byWall) {
    const harbor = list[0]?.harbor ?? false;
    const every = harbor ? HARBOR_TOWER_EVERY : TOWER_EVERY;
    const last = list[list.length - 1];
    const total = last ? last.chain0 + last.len : 0;
    for (let chain = every * 0.5; chain < total - 20; chain += every) {
      if (wallId === fight.piece.wallId && Math.abs(chain - stair) < 48) continue;
      const piece = list.find((p) => chain >= p.chain0 && chain <= p.chain0 + p.len);
      if (!piece) continue;
      sites.push({ wallId, chain, frame: frameAt(piece, (chain - piece.chain0) / piece.len) });
    }
  }
  towerCache = { layout, sites };
  return sites;
}

export function nearSeaWall(layout: CityLayout, x: number, z: number, extra = 22): boolean {
  for (const w of layout.seaWalls) {
    let best = Infinity;
    for (let i = 0; i < w.pts.length - 1; i++) {
      const ax = w.pts[i]![0];
      const az = w.pts[i]![1];
      const bx = w.pts[i + 1]![0];
      const bz = w.pts[i + 1]![1];
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < best) best = d;
    }
    if (best < w.baseWidth / 2 + extra) return true;
  }
  return false;
}
