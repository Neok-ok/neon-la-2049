// Near-range sea-wall surface. One straight piece in or out per frame.
// The far extrusion in Landmarks stays the distant wall.
import { Group, Mesh } from 'three/webgpu';
import type { CityLayout } from '../../world/layout';
import { GeoWriter, type FaceStyle } from '../../world/landmarks/GeoWriter';
import { getCityMaterial } from '../../world/materials/cityMaterial';
import { Style } from '../../world/fabric/types';
import {
  JOINT_M,
  PARAPET_H,
  PARAPET_T,
  TOWER_ACROSS,
  TOWER_H,
  TOWER_SIZE,
  coastBudget,
  fightHit,
  frameAt,
  framePoint,
  parapetRuns,
  stairChain,
  towerSites,
  wallPieces,
  type WallPiece,
} from './profile';
import { stairLocalOn } from './collision';

const BOARD: FaceStyle = { style: Style.Solid, lit: 0.02, tint: 0.78, seed: 0.16 };
const CONCRETE: FaceStyle = { style: Style.Solid, lit: 0.015, tint: 0.62, seed: 0.51 };
const STAIN: FaceStyle = { style: Style.Solid, lit: 0.01, tint: 0.34, seed: 0.44 };
const LADDER: FaceStyle = { style: Style.Glow, lit: 0.32, tint: 1.9, seed: 0.19 };
const JOINT: FaceStyle = { style: Style.Solid, lit: 0, tint: 0.2, seed: 0.71 };
const METAL: FaceStyle = { style: Style.Solid, lit: 0.04, tint: 0.46, seed: 0.33 };
const RUST: FaceStyle = { style: Style.Solid, lit: 0.03, tint: 0.62, seed: 0.88 };
const GLOW: FaceStyle = { style: Style.Glow, lit: 0.9, tint: 1.9, seed: 0.27 };

const built = new Map<string, Mesh>();
let parent: Group | null = null;

function quadOut(
  w: GeoWriter,
  a: number[],
  b: number[],
  c: number[],
  d: number[],
  out: number[],
  st: FaceStyle,
): void {
  const ax = b[0]! - a[0]!;
  const ay = b[1]! - a[1]!;
  const az = b[2]! - a[2]!;
  const bx = d[0]! - a[0]!;
  const by = d[1]! - a[1]!;
  const bz = d[2]! - a[2]!;
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;
  const face = nx * out[0]! + ny * out[1]! + nz * out[2]! >= 0 ? [a, b, c, d] : [a, d, c, b];
  w.quad(face, [[0, 0], [1, 0], [1, 1], [0, 1]], st);
}

function edgeNormal(a0: number, y0: number, a1: number, y1: number): { ax: number; ay: number } {
  const da = a1 - a0;
  const dy = y1 - y0;
  const l = Math.hypot(dy, da) || 1;
  return { ax: -dy / l, ay: da / l };
}

function buildPiece(w: GeoWriter, piece: WallPiece, layout: CityLayout): void {
  const prof = piece.profile;
  const f = piece.frame;
  const harbor = piece.harbor;
  const boardSpacing = harbor ? 2.5 : 1.35;
  const pts = prof.pts;
  const at = (u: number, across: number, y: number, liftA: number, liftY: number): number[] => {
    const x = piece.ax + (piece.bx - piece.ax) * u;
    const z = piece.az + (piece.bz - piece.az) * u;
    return [
      x + f.nx * (across + liftA),
      y + liftY,
      z + f.nz * (across + liftA),
    ];
  };

  for (let e = 0; e < pts.length - 1; e++) {
    const [a0, y0] = pts[e]!;
    const [a1, y1] = pts[e + 1]!;
    const sl = Math.hypot(a1 - a0, y1 - y0);
    const steep = Math.abs(y1 - y0) > Math.abs(a1 - a0) * 0.45;
    const spacing = steep ? boardSpacing : boardSpacing * 2.3;
    const n = Math.max(1, Math.floor(sl / spacing));
    const N = edgeNormal(a0, y0, a1, y1);
    const out = [f.nx * N.ax, N.ay, f.nz * N.ax];
    const low = Math.min(y0, y1) < 22;
    // Solid skin so the Stage 1 window grid does not show on the near wall.
    const skin = 0.05;
    quadOut(
      w,
      at(0, a0, y0, N.ax * skin, N.ay * skin),
      at(1, a0, y0, N.ax * skin, N.ay * skin),
      at(1, a1, y1, N.ax * skin, N.ay * skin),
      at(0, a1, y1, N.ax * skin, N.ay * skin),
      out,
      low ? STAIN : CONCRETE,
    );
    for (let s = 0; s < n; s++) {
      const f0 = s / n;
      const f1 = (s + 0.16) / n;
      const aa = a0 + (a1 - a0) * f0;
      const ya = y0 + (y1 - y0) * f0;
      const ab = a0 + (a1 - a0) * f1;
      const yb = y0 + (y1 - y0) * f1;
      const lift = 0.14;
      quadOut(
        w,
        at(0, aa, ya, N.ax * lift, N.ay * lift),
        at(1, aa, ya, N.ax * lift, N.ay * lift),
        at(1, ab, yb, N.ax * lift, N.ay * lift),
        at(0, ab, yb, N.ax * lift, N.ay * lift),
        out,
        BOARD,
      );
    }
  }

  for (let c = Math.ceil((piece.chain0 + 1) / JOINT_M) * JOINT_M; c < piece.chain0 + piece.len - 1; c += JOINT_M) {
    const u0 = (c - piece.chain0) / piece.len;
    const du = 0.32 / piece.len;
    for (let e = 0; e < pts.length - 1; e++) {
      const [a0, y0] = pts[e]!;
      const [a1, y1] = pts[e + 1]!;
      const N = edgeNormal(a0, y0, a1, y1);
      const out = [f.nx * N.ax, N.ay, f.nz * N.ax];
      const lift = 0.18;
      quadOut(
        w,
        at(u0, a0, y0, N.ax * lift, N.ay * lift),
        at(u0 + du, a0, y0, N.ax * lift, N.ay * lift),
        at(u0 + du, a1, y1, N.ax * lift, N.ay * lift),
        at(u0, a1, y1, N.ax * lift, N.ay * lift),
        out,
        JOINT,
      );
    }
  }

  const drains = harbor ? (piece.index % 2 === 0 ? 1 : 0) : 2;
  for (let d = 0; d < drains; d++) {
    const u = drains === 1 ? 0.5 : 0.32 + d * 0.36;
    const face = prof.treads.find((t) => t.y <= 30 && t.y >= 12) ?? prof.treads[0]!;
    const across = face.outer - 0.4;
    const y = face.y + 0.4;
    const fr = frameAt(piece, u);
    const p = framePoint(fr, across, 0);
    w.box(p.x, p.z, y, 1.3, 0.7, 0.55, fr.yaw, METAL);
    const N = edgeNormal(face.inner, face.y + 6, face.outer, face.y);
    const out = [fr.nx * N.ax, N.ay, fr.nz * N.ax];
    const bot = at(u, across + 1.2, y - 5.5, N.ax * 0.2, 0);
    const side = 0.22 / piece.len;
    quadOut(
      w,
      at(u - side, across, y, N.ax * 0.22, 0),
      at(u + side, across, y, N.ax * 0.22, 0),
      [bot[0]! + fr.tx * 0.22, bot[1]!, bot[2]! + fr.tz * 0.22],
      [bot[0]! - fr.tx * 0.22, bot[1]!, bot[2]! - fr.tz * 0.22],
      out,
      RUST,
    );
  }

  const fight = fightHit(layout);
  const stair = stairChain(layout);
  const onStair = piece.wallId === fight.piece.wallId
    && stair >= piece.chain0 - 4 && stair <= piece.chain0 + piece.len + 4;
  const ladderHere = !onStair && (harbor ? piece.index % 6 === 1 : piece.index % 3 === 1);
  if (ladderHere) {
    const dry = prof.treads.filter((t) => t.y >= 8);
    for (let i = 0; i < dry.length - 1; i++) {
      const hi = dry[i]!;
      const lo = dry[i + 1]!;
      if (lo.y >= hi.y) continue;
      // Steep face from the upper lip down to the next nose. A vertical
      // ladder at hi.outer sits inside the concrete.
      const span = lo.outer - lo.inner;
      const a0 = hi.outer;
      const yA = hi.y;
      const a1 = lo.inner + span * 0.35;
      const yB = lo.y + 2;
      const N = edgeNormal(a0, yA, a1, yB);
      const gap = 0.7;
      const u = 0.58;
      const fr = frameAt(piece, u);
      const steps = Math.max(8, Math.round(Math.hypot(a1 - a0, yB - yA) / 1.05));
      const segH = Math.abs(yA - yB) / steps + 0.2;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const across = a0 + (a1 - a0) * t + N.ax * gap;
        const y = yA + (yB - yA) * t + N.ay * gap;
        for (const side of [-0.5, 0.5]) {
          const p = framePoint(fr, across, side);
          w.box(p.x, p.z, y - segH * 0.5, 0.28, 0.22, segH, fr.yaw, LADDER);
        }
        if (s > 0 && s < steps) {
          const p = framePoint(fr, across, 0);
          w.box(p.x, p.z, y - 0.08, 1.12, 0.2, 0.18, fr.yaw, LADDER);
        }
      }
      if (i === 0) {
        const p = framePoint(fr, a0 + N.ax * gap, 0);
        w.box(p.x, p.z, yA + 0.15, 0.42, 0.28, 0.16, fr.yaw, GLOW);
      }
    }
  }

  if (!harbor && !onStair && piece.index % 2 === 0) {
    const cat = prof.treads.filter((t) => t.y >= 15);
    for (let i = 0; i < cat.length; i += 2) {
      const t = cat[i]!;
      const p = framePoint(f, t.outer - 0.55, 0);
      w.box(p.x, p.z, t.y + 0.08, piece.len * 0.92, 0.85, 0.08, f.yaw, BOARD);
      const rail = framePoint(f, t.outer - 0.2, 0);
      w.box(rail.x, rail.z, t.y + 0.9, piece.len * 0.9, 0.08, 0.08, f.yaw, METAL);
    }
  }

  const lampStep = harbor ? 64 : 28;
  for (let c = Math.ceil((piece.chain0 + 6) / lampStep) * lampStep; c < piece.chain0 + piece.len - 4; c += lampStep) {
    const u = (c - piece.chain0) / piece.len;
    const fr = frameAt(piece, u);
    const p = framePoint(fr, prof.crest / 2 - 6, 0);
    w.box(p.x, p.z, prof.H, 0.16, 0.16, 4.4, fr.yaw, METAL);
    w.box(p.x, p.z, prof.H + 4.25, 0.7, 0.32, 0.14, fr.yaw, GLOW);
  }

  const half = piece.len / 2;
  const local = stairLocalOn(piece.chain0, piece.len, stair, piece.wallId === fight.piece.wallId);
  const land = framePoint(f, -prof.crest / 2 - PARAPET_T * 0.35, 0);
  w.box(land.x, land.z, prof.H, piece.len, PARAPET_T, PARAPET_H, f.yaw, BOARD);
  for (const [a, b] of parapetRuns(half, local)) {
    const sea = framePoint(f, prof.crest / 2 + PARAPET_T * 0.35, (a + b) / 2);
    w.box(sea.x, sea.z, prof.H, b - a, PARAPET_T, PARAPET_H, f.yaw, BOARD);
  }

  for (const site of towerSites(layout)) {
    if (site.wallId !== piece.wallId) continue;
    if (site.chain < piece.chain0 || site.chain > piece.chain0 + piece.len) continue;
    const p = framePoint(site.frame, TOWER_ACROSS, 0);
    w.box(p.x, p.z, site.frame.H, TOWER_SIZE, TOWER_SIZE, TOWER_H, site.frame.yaw, BOARD);
    w.box(p.x, p.z, site.frame.H + TOWER_H - 0.35, TOWER_SIZE + 0.6, TOWER_SIZE + 0.6, 0.35, site.frame.yaw, METAL);
    w.box(p.x, p.z, site.frame.H + TOWER_H, 0.45, 0.45, 0.7, site.frame.yaw, GLOW);
  }
}

function addPiece(piece: WallPiece, layout: CityLayout): void {
  if (!parent || built.has(piece.key)) return;
  const w = new GeoWriter();
  buildPiece(w, piece, layout);
  const mesh = new Mesh(w.build(), getCityMaterial());
  mesh.name = `sea-wall-detail-${piece.key}`;
  mesh.frustumCulled = true;
  parent.add(mesh);
  built.set(piece.key, mesh);
}

export function wallSegmentCount(): number {
  return built.size;
}

export function warmWall(group: Group, layout: CityLayout, tier: CoastBudgetTier): void {
  parent = group;
  const fight = fightHit(layout);
  const budget = coastBudget(tier);
  const near = wallPieces(layout)
    .filter((p) => !p.harbor)
    .map((p) => ({ p, d: Math.hypot(p.frame.x - fight.x, p.frame.z - fight.z) }))
    .filter((x) => x.d < 240)
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.min(8, budget.cap));
  for (const x of near) addPiece(x.p, layout);
}

type CoastBudgetTier = 'low' | 'medium' | 'high' | 'ultra';

function wanted(layout: CityLayout, x: number, z: number, tier: CoastBudgetTier): WallPiece[] {
  const budget = coastBudget(tier);
  const ranked = wallPieces(layout).map((p) => {
    const dx = p.frame.x - x;
    const dz = p.frame.z - z;
    const dist = Math.hypot(dx, dz);
    const reach = p.harbor ? budget.reach * 0.62 : budget.reach;
    return { p, dist, reach };
  }).filter((r) => r.dist <= r.reach);
  ranked.sort((a, b) => a.dist - b.dist);
  return ranked.slice(0, budget.cap).map((r) => r.p);
}

/** One add or one remove. Startup warm is the only multi-piece burst. */
export function updateWall(layout: CityLayout, x: number, z: number, tier: CoastBudgetTier): void {
  if (!parent) return;
  const want = wanted(layout, x, z, tier);
  const keys = new Set(want.map((p) => p.key));
  let victim: string | null = null;
  let victimD = -1;
  for (const key of built.keys()) {
    if (keys.has(key)) continue;
    const piece = wallPieces(layout).find((p) => p.key === key);
    const d = piece ? Math.hypot(piece.frame.x - x, piece.frame.z - z) : 1e9;
    if (d > victimD) {
      victimD = d;
      victim = key;
    }
  }
  if (victim) {
    const mesh = built.get(victim);
    if (mesh) {
      mesh.geometry.dispose();
      mesh.removeFromParent();
      mesh.dispose();
    }
    built.delete(victim);
    return;
  }
  for (const piece of want) {
    if (!built.has(piece.key)) {
      addPiece(piece, layout);
      return;
    }
  }
}

export function wallParent(group: Group): void {
  parent = group;
}
