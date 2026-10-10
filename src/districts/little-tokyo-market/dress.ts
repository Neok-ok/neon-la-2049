// Pure module (worker-safe). One Little Tokyo block: shophouse masses, the noodle-bar interior,
// stalls, and the prop / light / steam lists the LOD0 kit consumes.
// Both the chunk worker (via the archetype) and the main thread (details, crowds, audio) call this.
import { Rng } from '../../core/rng';
import type { CityLayout } from '../../world/layout';
import { Style, SignColor, type FaceDir } from '../../world/fabric/types';
import { SIGN_RGB } from '../../world/materials/signPalette';
import { phraseSeed } from '../../world/materials/signPhrases';
import type { TemplateId } from '../_shared/kit/templates';
import { lifeSpot, type CrowdLifeSpot } from '../../world/crowdLife';

/** Kit placement. Kept here (not imported from the three.js batcher) so this file stays worker-safe. */
export interface MarketProp {
  template: TemplateId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch?: number;
  sx: number;
  sy: number;
  sz: number;
  color: [number, number, number];
  emissive: [number, number, number];
  metal: number;
  alpha?: number;
  pass?: 'opaque' | 'fade' | 'add';
  rank: number;
}

export interface MarketBlock {
  cx: number;
  cz: number;
  ax: number;
  az: number;
  la: number;
  lb: number;
  street: number;
  seed: number;
  ground: number;
}

export interface DressBox {
  s: number;
  t: number;
  lb: number;
  la: number;
  h: number;
  base: number;
  style: number;
  detail: 0 | 1 | 2;
  lit: number;
  tint: number;
}

export interface DressSign {
  s: number;
  t: number;
  hb: number;
  ha: number;
  face: FaceDir;
  along: number;
  y: number;
  w: number;
  h: number;
  color: number;
  kind: 0 | 1 | 2;
  seed?: number;
}

export interface SteamPoint {
  x: number;
  y: number;
  z: number;
  seed: number;
  rank: number;
}

export interface PoolLight {
  x: number;
  y: number;
  z: number;
  /** Long axis of the streak (atan2). */
  yaw: number;
  len: number;
  wid: number;
  rgb: [number, number, number];
  intensity: number;
  rank: number;
}

export interface MarketAnchor {
  x: number;
  y: number;
  z: number;
  /** Compass heading for the walk camera (0 = north). */
  heading: number;
  /** Yaw for a mesh whose local +Z is its forward. */
  yaw: number;
}

export interface ShopSpot {
  entrance: MarketAnchor;
  cook: MarketAnchor;
  seats: MarketAnchor[];
  street: MarketAnchor;
  alongHeading: number;
}

export interface Dressing {
  boxes: DressBox[];
  signs: DressSign[];
  props: MarketProp[];
  steam: SteamPoint[];
  pools: PoolLight[];
  noodle: ShopSpot | null;
  bibi: ShopSpot | null;
  /** Queues and awning clusters. The chunk worker ignores this. */
  life: CrowdLifeSpot[];
}

interface Axes {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export function blockAxes(b: MarketBlock): Axes {
  return { ax: b.ax, az: b.az, bx: -b.az, bz: b.ax };
}

function toWorld(b: MarketBlock, a: Axes, s: number, t: number): [number, number] {
  return [b.cx + a.ax * s + a.bx * t, b.cz + a.az * s + a.bz * t];
}

/** Half-open ownership of the grid cell (building + half the surrounding streets). */
export function ownsPoint(b: MarketBlock, x: number, z: number): boolean {
  const a = blockAxes(b);
  const dx = x - b.cx, dz = z - b.cz;
  const s = dx * a.ax + dz * a.az;
  const t = dx * a.bx + dz * a.bz;
  const hs = (b.la + b.street) / 2;
  const ht = (b.lb + b.street) / 2;
  return s >= -hs && s < hs && t >= -ht && t < ht;
}

/** Two one-way sidewalk loops on this block's side of the street, so neighbours don't double up. */
export function pedestrianLoops(b: MarketBlock): Array<Array<[number, number]>> {
  const a = blockAxes(b);
  const loops: Array<Array<[number, number]>> = [];
  // Stall fronts end ~1.7 m out from the facade; lanes sit just beyond them.
  for (const out of [2.45, 3.15]) {
    const hs = b.la / 2 + out;
    const ht = b.lb / 2 + out;
    const corners: Array<[number, number]> = [[-hs, -ht], [hs, -ht], [hs, ht], [-hs, ht]];
    loops.push(corners.map(([s, t]) => [b.cx + a.ax * s + a.bx * t, b.cz + a.az * s + a.bz * t]));
  }
  return loops;
}

/** Third loop, just past the stall front (the box ends at 1.72 m) and inside the 2.45 m lane. */
export function stallFrontLoop(b: MarketBlock): Array<[number, number]> {
  const a = blockAxes(b);
  const out = 1.95;
  const hs = b.la / 2 + out;
  const ht = b.lb / 2 + out;
  const corners: Array<[number, number]> = [[-hs, -ht], [hs, -ht], [hs, ht], [-hs, ht]];
  return corners.map(([s, t]) => [b.cx + a.ax * s + a.bx * t, b.cz + a.az * s + a.bz * t]);
}

interface Slot {
  face: FaceDir;
  s: number;
  t: number;
  w: number;
  depth: number;
  os: number;
  ot: number;
  as: number;
  at: number;
  special: 'noodle' | 'bibi' | null;
  open: boolean;
  H: number;
  closed: boolean;
}

const PAL = [SignColor.Red, SignColor.Amber, SignColor.Pink, SignColor.Cyan, SignColor.Yellow, SignColor.Teal, SignColor.Violet];

export function dressBlock(b: MarketBlock, layout: CityLayout): Dressing {
  const rng = new Rng(b.seed);
  const a = blockAxes(b);
  const boxes: DressBox[] = [];
  const signs: DressSign[] = [];
  const props: MarketProp[] = [];
  const steam: SteamPoint[] = [];
  const pools: PoolLight[] = [];
  let noodle: ShopSpot | null = null;
  let bibi: ShopSpot | null = null;
  const life: CrowdLifeSpot[] = [];
  let awningKept = false;
  let stallQueues = 0;

  const world = (s: number, t: number): [number, number] => toWorld(b, a, s, t);
  const yawOf = (nx: number, nz: number) => Math.atan2(nx, nz);
  const headingOf = (fx: number, fz: number) => Math.atan2(fx, -fz);

  const addBox = (s: number, t: number, lb: number, la: number, h: number, base: number, style: number, detail: 0 | 1 | 2, lit: number, tint: number) => {
    boxes.push({ s, t, lb, la, h, base, style, detail, lit, tint });
  };

  const prop = (
    template: TemplateId, x: number, y: number, z: number, yaw: number,
    sx: number, sy: number, sz: number,
    color: [number, number, number], emissive: [number, number, number],
    metal: number, rank: number, alpha = 1, pitch = 0,
  ) => {
    props.push({
      template, x, y, z, yaw, pitch, sx, sy, sz, color, emissive, metal, alpha,
      pass: alpha < 0.98 ? 'fade' : 'opaque', rank,
    });
  };

  const rgb = (i: number): [number, number, number] => {
    const c = SIGN_RGB[i] ?? SIGN_RGB[2];
    return [c[0], c[1], c[2]];
  };

  // --- tower in one corner (mega-tower base rising out of the market) ---
  let tower: { cs: number; ct: number } | null = null;
  if (rng.chance(0.2)) {
    const cs = rng.chance(0.5) ? 1 : -1;
    const ct = rng.chance(0.5) ? 1 : -1;
    const tw = 12.4, td = 11.2;
    const s = cs * (b.la / 2 - tw / 2);
    const t = ct * (b.lb / 2 - td / 2);
    const [wx, wz] = world(s, t);
    if (!layout.isReserved(wx, wz, 6) && !layout.isOcean(wx, wz)) {
      const H = rng.range(72, 112);
      const lit = rng.range(0.35, 0.6);
      addBox(s, t, td, tw, H, 0, rng.chance(0.5) ? Style.Megablock : Style.Neon, 0, lit, rng.range(0.75, 1.05));
      // stacked blades on the two street faces
      const faceA: FaceDir = cs > 0 ? 'a+' : 'a-';
      const faceB: FaceDir = ct > 0 ? 'b+' : 'b-';
      for (let k = 0; k < 5; k++) {
        const col = rng.pick(PAL);
        signs.push({
          s, t, hb: td / 2, ha: tw / 2, face: k % 2 ? faceB : faceA,
          along: rng.range(-2, 2), y: 8 + k * 7.5, w: 0.85, h: rng.range(3.2, 5.4),
          color: col, kind: 1,
        });
      }
      if (rng.chance(0.85)) {
        signs.push({
          s, t, hb: td / 2, ha: tw / 2, face: faceA, along: 0, y: H * 0.62,
          w: Math.min(10, tw * 0.7), h: rng.range(6, 11), color: rng.pick(PAL), kind: 2,
        });
      }
      tower = { cs, ct };
    }
  }

  const slots: Slot[] = [];
  const faces: FaceDir[] = ['a+', 'a-', 'b+', 'b-'];
  for (const face of faces) {
    const alongT = face[0] === 'a';
    const len = alongT ? b.lb : b.la;
    let inset0 = 7.6, inset1 = 7.6;
    if (tower) {
      if (alongT) {
        if (tower.ct < 0) inset0 = 13.2;
        else inset1 = 13.2;
      } else if (tower.cs < 0) inset0 = 13.2;
      else inset1 = 13.2;
    }
    const start = -len / 2 + inset0;
    const end = len / 2 - inset1;
    let cursor = start;
    let guard = 0;
    while (cursor < end - 4.6 && guard++ < 16) {
      const remain = end - cursor;
      let w = rng.range(6.4, Math.min(12.5, remain));
      if (remain < 6.2) break;
      if (w > remain) w = remain;
      if (w < 4.8) break;
      const depth = rng.range(7.2, 9.4);
      const alongC = cursor + w / 2;
      const os = face === 'a+' ? 1 : face === 'a-' ? -1 : 0;
      const ot = face === 'b+' ? 1 : face === 'b-' ? -1 : 0;
      const as = face === 'b+' || face === 'b-' ? 1 : 0;
      const at = face === 'a+' || face === 'a-' ? 1 : 0;
      const s = alongT ? (face === 'a+' ? b.la / 2 - depth / 2 : -b.la / 2 + depth / 2) : alongC;
      const t = alongT ? alongC : (face === 'b+' ? b.lb / 2 - depth / 2 : -b.lb / 2 + depth / 2);
      const [wx, wz] = world(s, t);
      if (!layout.isReserved(wx, wz, 3) && !layout.isOcean(wx, wz)) {
        const tall = rng.chance(0.14);
        const H = tall ? rng.range(22, 40) : rng.skew(8.5, 18, 1.35);
        slots.push({
          face, s, t, w, depth, os, ot, as, at,
          special: null,
          open: rng.chance(0.74),
          H,
          closed: false,
        });
      }
      cursor += w + rng.range(0.2, 0.55);
      if (rng.chance(0.16)) cursor += rng.range(1.3, 2.1);
    }
  }

  const claim = (id: 'noodle-bar' | 'bibis-bar', kind: 'noodle' | 'bibi') => {
    const poi = layout.poiById(id);
    if (!poi || !ownsPoint(b, poi.x, poi.z)) return;
    let best: Slot | null = null;
    let bestD = Infinity;
    for (const sl of slots) {
      if (sl.special) continue;
      const fs = sl.s + sl.os * (sl.depth / 2);
      const ft = sl.t + sl.ot * (sl.depth / 2);
      const [wx, wz] = world(fs, ft);
      const d = Math.hypot(wx - poi.x, wz - poi.z);
      if (d < bestD) { bestD = d; best = sl; }
    }
    if (best && bestD < 28) {
      best.special = kind;
      best.open = true;
      best.H = Math.max(best.H, 11);
      if (kind === 'noodle') best.w = Math.min(best.w, 7.2);
    }
  };
  claim('noodle-bar', 'noodle');
  claim('bibis-bar', 'bibi');

  const SOFFIT = 2.62;

  for (const sl of slots) {
    const alongA = Math.abs(sl.os) > 0.5;
    const slice = (fromInner: number, thick: number) => {
      const d = fromInner + thick / 2;
      return {
        s: sl.s + sl.os * (d - sl.depth / 2),
        t: sl.t + sl.ot * (d - sl.depth / 2),
        la: alongA ? thick : sl.w,
        lb: alongA ? sl.w : thick,
      };
    };
    const fs = sl.s + sl.os * (sl.depth / 2);
    const ft = sl.t + sl.ot * (sl.depth / 2);
    const [fx, fz] = world(fs, ft);
    const nx = a.ax * sl.os + a.bx * sl.ot;
    const nz = a.az * sl.os + a.bz * sl.ot;
    const lx = a.ax * sl.as + a.bx * sl.at;
    const lz = a.az * sl.as + a.bz * sl.at;
    const outYaw = yawOf(nx, nz);
    const alongYaw = yawOf(lx, lz);
    const tint = rng.range(0.62, 1.12);
    const lit = rng.range(0.42, 0.82);
    const col = rng.pick(PAL);
    const col2 = rng.pick(PAL);

    if (sl.special === 'noodle' || sl.special === 'bibi') {
      const bar = sl.special === 'bibi';
      const openD = bar ? 2.5 : 3.35;
      const backD = Math.max(2.4, sl.depth - openD);
      const back = slice(0, backD);
      addBox(back.s, back.t, back.lb, back.la, SOFFIT, 0, Style.Solid, 1, 0.15, tint);
      const upper = slice(0, sl.depth);
      addBox(upper.s, upper.t, upper.lb, upper.la, Math.max(3.2, sl.H - SOFFIT), SOFFIT, Style.Market, 0, lit, tint);
      // side walls of the recess
      const wallT = 0.48;
      for (const side of [-1, 1]) {
        const ws = fs - sl.os * (openD / 2) + sl.as * side * (sl.w / 2 - wallT / 2);
        const wt = ft - sl.ot * (openD / 2) + sl.at * side * (sl.w / 2 - wallT / 2);
        const wla = alongA ? openD : wallT;
        const wlb = alongA ? wallT : openD;
        addBox(ws, wt, wlb, wla, SOFFIT, 0, Style.Solid, 1, 0.08, tint * 0.9);
      }
      // counter
      const cDepth = 0.7;
      const cFromInner = backD + (bar ? 0.15 : 0.35);
      const counter = slice(cFromInner, cDepth);
      // counter is shorter than the shop width
      const cW = sl.w - 1.35;
      if (alongA) counter.lb = cW;
      else counter.la = cW;
      addBox(counter.s, counter.t, counter.lb, counter.la, 1.06, 0, Style.Solid, 1, 0.05, 0.7);
      const [cx, cz] = world(counter.s, counter.t);
      const gy = b.ground;

      // stools in front of the counter (toward the street)
      const stoolFromInner = cFromInner + cDepth + 0.62;
      const nStools = bar ? 3 : Math.max(3, Math.floor((cW - 0.4) / 0.68));
      const seats: MarketAnchor[] = [];
      for (let i = 0; i < nStools; i++) {
        const u = (i - (nStools - 1) / 2) * 0.66;
        const ss = sl.s + sl.os * (stoolFromInner - sl.depth / 2) + sl.as * u;
        const st = sl.t + sl.ot * (stoolFromInner - sl.depth / 2) + sl.at * u;
        const [sx, sz] = world(ss, st);
        prop('stool', sx, gy, sz, outYaw, 1, 1, 1, [0.12, 0.08, 0.07], [0, 0, 0], 0.35, 0);
        seats.push({ x: sx, y: gy, z: sz, heading: headingOf(-nx, -nz), yaw: yawOf(-nx, -nz) });
      }
      // cook stands in the gap behind the counter, not inside the back-wall solid
      const cookD = cFromInner - 0.08;
      const ks = sl.s + sl.os * (cookD - sl.depth / 2);
      const kt = sl.t + sl.ot * (cookD - sl.depth / 2);
      const [kx, kz] = world(ks, kt);
      const cook: MarketAnchor = { x: kx, y: gy, z: kz, heading: headingOf(nx, nz), yaw: outYaw };

      // pots + steam on the counter
      for (let i = 0; i < (bar ? 1 : 2); i++) {
        const u = (i - 0.5) * 0.7;
        const px = cx + lx * u, pz = cz + lz * u;
        prop('cyl', px, gy + 1.12, pz, 0, 0.28, 0.22, 0.28, [0.15, 0.12, 0.1], [0.4, 0.12, 0.02], 0.6, 0);
        steam.push({ x: px, y: gy + 1.28, z: pz, seed: rng.next(), rank: 0 });
      }
      // ceiling strip
      const [mx, mz] = world(fs - sl.os * (openD * 0.45), ft - sl.ot * (openD * 0.45));
      prop('box', mx, gy + 2.48, mz, outYaw, sl.w * 0.55, 0.06, 0.35, [1, 0.55, 0.22], [1.4, 0.55, 0.16], 0, 0);
      // Menu panels on the street side of the back wall. The sign helper offsets 0.35 m
      // past a virtual face, so that face is set just inside the wall.
      const placeFacingStreet = (along: number, y: number, w: number, h: number, color: number, seed: number) => {
        const want = backD - sl.depth / 2 + 0.12;
        const ha = 0.05;
        const hb = 0.05;
        const out = 0.35;
        let s = sl.s;
        let t = sl.t;
        if (sl.face === 'a+' || sl.face === 'a-') {
          const ns = sl.face === 'a+' ? 1 : -1;
          s = sl.s + ns * (want - ha - out);
        } else {
          const nt = sl.face === 'b+' ? 1 : -1;
          t = sl.t + nt * (want - hb - out);
        }
        signs.push({ s, t, hb, ha, face: sl.face, along, y, w, h, color, kind: 0, seed });
      };
      placeFacingStreet(0, 1.95, Math.min(2.6, sl.w * 0.5), 0.58, SignColor.Amber, phraseSeed(bar ? 3 : 0));
      placeFacingStreet(-sl.w * 0.28, 1.72, Math.min(1.3, sl.w * 0.28), 0.7, bar ? SignColor.Violet : SignColor.Red, phraseSeed(bar ? 21 : 9));
      placeFacingStreet(sl.w * 0.28, 1.72, Math.min(1.3, sl.w * 0.28), 0.7, SignColor.Cyan, phraseSeed(bar ? 16 : 40));

      const entranceS = fs - sl.os * 0.85;
      const entranceT = ft - sl.ot * 0.85;
      const [ex, ez] = world(entranceS, entranceT);
      const [laneX, laneZ] = world(fs + sl.os * 2.6, ft + sl.ot * 2.6);
      const spot: ShopSpot = {
        entrance: { x: ex, y: gy, z: ez, heading: headingOf(-nx, -nz), yaw: yawOf(-nx, -nz) },
        cook, seats,
        street: { x: laneX, y: gy, z: laneZ, heading: headingOf(lx, lz), yaw: alongYaw },
        alongHeading: headingOf(lx, lz),
      };
      if (bar) bibi = spot;
      else noodle = spot;
      const mid = seats[Math.floor(seats.length / 2)] ?? seats[0];
      if (mid) {
        life.push(lifeSpot(mid.x + nx * 0.85, mid.z + nz * 0.85, outYaw, 'queue', bar ? 3 : 4));
      }

      // Backsplash and a soffit. Fabric boxes are shells (no underside), so the recess needs its own ceiling.
      const [bwx, bwz] = world(sl.s + sl.os * (backD - sl.depth / 2), sl.t + sl.ot * (backD - sl.depth / 2));
      prop('quadZ', bwx + nx * 0.08, gy + 1.42, bwz + nz * 0.08, outYaw, Math.min(sl.w * 0.88, 5.6), 2.2, 1,
        [0.34, 0.15, 0.07], [1.05, 0.42, 0.12], 0.04, 0);
      const [sox, soz] = world(fs - sl.os * (openD * 0.52), ft - sl.ot * (openD * 0.52));
      prop('box', sox, gy + SOFFIT - 0.06, soz, outYaw, sl.w * 0.98, 0.1, openD * 1.12,
        [0.16, 0.09, 0.05], [0.62, 0.26, 0.08], 0, 0);
      // wood cladding on the street face of the (otherwise black) solid counter
      prop('box', cx + nx * 0.4, gy + 0.54, cz + nz * 0.4, outYaw, cW * 0.98, 1.08, 0.1,
        [0.3, 0.14, 0.06], [0.16, 0.05, 0.02], 0.12, 0);
      prop('box', cx + nx * 0.02, gy + 1.09, cz + nz * 0.02, outYaw, cW * 0.96, 0.05, 0.66,
        [0.2, 0.1, 0.06], [0.28, 0.1, 0.03], 0.2, 0);
      const bowls = bar ? 3 : 4;
      for (let i = 0; i < bowls; i++) {
        const u = (i - (bowls - 1) / 2) * 0.46;
        prop('cyl', cx + lx * u + nx * 0.1, gy + 1.16, cz + lz * u + nz * 0.1, 0, 0.16, 0.07, 0.16,
          [0.82, 0.78, 0.7], [0.2, 0.1, 0.04], 0.08, 0);
      }
      // shelf and bottles on the back wall, above the cook
      const [shx, shz] = world(
        sl.s + sl.os * (backD - sl.depth / 2 + 0.2),
        sl.t + sl.ot * (backD - sl.depth / 2 + 0.2),
      );
      prop('box', shx, gy + 1.78, shz, outYaw, Math.min(cW * 0.72, 3.4), 0.05, 0.26,
        [0.22, 0.12, 0.07], [0.1, 0.04, 0.02], 0.2, 0);
      for (let i = 0; i < 5; i++) {
        const u = (i - 2) * 0.36;
        prop('cyl', shx + lx * u, gy + 1.94, shz + lz * u, 0, 0.07, 0.22, 0.07,
          [0.12, 0.18, 0.16], [0.04, 0.16, 0.1], 0.45, 0);
      }
      // noren strips in the doorway
      for (let i = 0; i < 5; i++) {
        const u = (i - 2) * (sl.w * 0.14);
        prop('quadZ', fx + lx * u + nx * 0.05, gy + 2.2, fz + lz * u + nz * 0.05, outYaw, Math.max(0.28, sl.w * 0.09), 0.72, 1,
          [0.42, 0.05, 0.07], [0.4, 0.05, 0.06], 0.02, 0);
      }
      prop('box', mx, gy + 2.12, mz, outYaw, 0.26, 0.34, 0.26, [0.95, 0.4, 0.1], [1.7, 0.5, 0.1], 0.05, 0);

      // warm pool inside and a neon pool out front
      pools.push({ x: mx, y: gy + 0.04, z: mz, yaw: alongYaw, len: 3.2, wid: 2.2, rgb: [1, 0.45, 0.15], intensity: 1.3, rank: 0 });
    } else if (!sl.open) {
      addBox(sl.s, sl.t, alongA ? sl.w : sl.depth, alongA ? sl.depth : sl.w, sl.H, 0, Style.Market, 0, lit * 0.7, tint);
      prop('quadZ', fx + nx * 0.06, b.ground + 1.35, fz + nz * 0.06, outYaw, sl.w * 0.78, 2.2, 1, [0.1, 0.07, 0.06], [0, 0, 0], 0.2, 1);
    } else {
      const frontD = Math.min(3.1, sl.depth * 0.4);
      const backD = sl.depth - frontD;
      const back = slice(0, backD);
      addBox(back.s, back.t, back.lb, back.la, sl.H, 0, Style.Market, 0, lit, tint);
      const front = slice(backD, frontD);
      addBox(front.s, front.t, front.lb, front.la, Math.max(0.6, sl.H - SOFFIT), SOFFIT, Style.Market, 0, lit, tint);
      // a few open shops get a pier so the arcade reads as separate rooms
      if (rng.chance(0.35)) {
        for (const side of [-1, 1]) {
          const ps = fs - sl.os * (frontD / 2) + sl.as * side * (sl.w / 2 - 0.22);
          const pt = ft - sl.ot * (frontD / 2) + sl.at * side * (sl.w / 2 - 0.22);
          addBox(ps, pt, alongA ? 0.42 : frontD, alongA ? frontD : 0.42, SOFFIT, 0, Style.Solid, 1, 0.05, tint);
        }
      }
    }

    // Soffit under open arcades. Building boxes are shells (no bottom face), so without this
    // you look up through the floor plate into the sky.
    if (sl.open && !sl.special) {
      const frontD = Math.min(3.1, sl.depth * 0.4);
      const [sx, sz] = world(fs - sl.os * (frontD * 0.5), ft - sl.ot * (frontD * 0.5));
      prop('box', sx, b.ground + SOFFIT - 0.04, sz, outYaw, sl.w * 0.94, 0.05, frontD * 0.96,
        [0.08, 0.06, 0.05], [0.12, 0.06, 0.03], 0, 0);
    }

    // awning — every shop, the market's silhouette
    const awn = rng.range(1.55, sl.special ? 2.25 : 1.9);
    if (!awningKept && sl.open) {
      awningKept = true;
      life.push(lifeSpot(fx + nx * (awn * 0.45), fz + nz * (awn * 0.45), outYaw, 'awning', 4));
    }
    prop('awning', fx, b.ground + rng.range(2.32, 2.55), fz, outYaw, sl.w * 0.94, 1, awn,
      rgb(rng.chance(0.5) ? col : SignColor.Red).map((v) => v * 0.18 + 0.05) as [number, number, number],
      [0, 0, 0], 0.05, 0);

    // header sign
    const hw = Math.min(sl.w * 0.72, 3.6);
    signs.push({
      s: sl.s, t: sl.t,
      hb: alongA ? sl.w / 2 : sl.depth / 2,
      ha: alongA ? sl.depth / 2 : sl.w / 2,
      face: sl.face, along: 0, y: 3.15, w: hw, h: 0.72,
      color: sl.special === 'noodle' ? SignColor.Red : sl.special === 'bibi' ? SignColor.Pink : col,
      kind: 0,
      seed: sl.special === 'noodle' ? phraseSeed(1) : sl.special === 'bibi' ? phraseSeed(3) : undefined,
    });
    pools.push({
      x: fx + nx * (awn * 0.45), y: b.ground + 0.05, z: fz + nz * (awn * 0.45),
      yaw: alongYaw, len: 4.5 + hw, wid: 1.5, rgb: rgb(sl.special === 'bibi' ? SignColor.Pink : col),
      intensity: sl.special ? 1.15 : 0.75, rank: 0,
    });

    // blade
    if (rng.chance(sl.special ? 1 : 0.72)) {
      const along = sl.w * 0.32 * (rng.chance(0.5) ? 1 : -1);
      const bh = rng.range(2.6, sl.H > 16 ? 5.2 : 3.8);
      signs.push({
        s: sl.s, t: sl.t,
        hb: alongA ? sl.w / 2 : sl.depth / 2,
        ha: alongA ? sl.depth / 2 : sl.w / 2,
        face: sl.face, along, y: 3.4 + bh * 0.45, w: 0.72, h: bh,
        color: col2, kind: 1,
        seed: sl.special === 'noodle' ? phraseSeed(8) : undefined,
      });
      pools.push({
        x: fx + nx * 1.1 + lx * along, y: b.ground + 0.05, z: fz + nz * 1.1 + lz * along,
        yaw: alongYaw, len: bh * 1.3, wid: 1.15, rgb: rgb(col2), intensity: 0.55, rank: 1,
      });
    }

    // upper wall sign on taller shops
    if (sl.H > 14 && rng.chance(0.55)) {
      signs.push({
        s: sl.s, t: sl.t,
        hb: alongA ? sl.w / 2 : sl.depth / 2,
        ha: alongA ? sl.depth / 2 : sl.w / 2,
        face: sl.face, along: rng.range(-sl.w * 0.2, sl.w * 0.2), y: rng.range(8, Math.min(18, sl.H - 2)),
        w: rng.range(1.6, 3.2), h: rng.range(0.7, 1.4), color: rng.pick(PAL), kind: 0,
      });
    }
    // vertical banner
    if (sl.H > 12 && rng.chance(0.28)) {
      signs.push({
        s: sl.s, t: sl.t,
        hb: alongA ? sl.w / 2 : sl.depth / 2,
        ha: alongA ? sl.depth / 2 : sl.w / 2,
        face: sl.face, along: rng.range(-sl.w * 0.3, sl.w * 0.3), y: 8.5,
        w: 1.05, h: rng.range(3.6, 5.5), color: rng.pick(PAL), kind: 1,
      });
    }

    // stall in the street, not in front of the two bars
    if (!sl.special && rng.chance(0.5)) {
      const sd = 1.5;
      const sw = Math.min(sl.w * 0.7, 3.2);
      const scs = fs + sl.os * (0.22 + sd / 2);
      const sct = ft + sl.ot * (0.22 + sd / 2);
      const sla = alongA ? sd : sw;
      const slb = alongA ? sw : sd;
      addBox(scs, sct, slb, sla, 1.12, 0, Style.Market, 1, 0.9, rng.range(0.7, 1.1));
      const [sx, sz] = world(scs, sct);
      if (stallQueues < 4) {
        stallQueues++;
        life.push(lifeSpot(sx + nx * (sd * 0.5 + 0.75), sz + nz * (sd * 0.5 + 0.75), outYaw, 'queue', 3));
      }
      prop('canopy', sx, b.ground + 2.05, sz, outYaw + rng.range(-0.2, 0.2), sw * 0.95, 1, sd * 1.15,
        [0.04, 0.035, 0.04], [0, 0, 0], 0.02, 0);
      const shaftCol = rgb(rng.pick(PAL));
      prop('cyl', sx, b.ground + 1.15, sz, 0, 0.06, 1.9, 0.06, [0.2, 0.2, 0.22], shaftCol, 0.4, 0);
      prop('cyl', sx + lx * 0.25, b.ground + 1.2, sz + lz * 0.25, 0, 0.22, 0.16, 0.22, [0.2, 0.14, 0.1], [0.55, 0.16, 0.04], 0.5, 1);
      steam.push({ x: sx, y: b.ground + 1.35, z: sz, seed: rng.next(), rank: rng.chance(0.45) ? 0 : 1 });
      if (rng.chance(0.6)) {
        prop('box', sx - lx * (sw * 0.45), b.ground + 0.22, sz - lz * (sw * 0.45), outYaw, 0.48, 0.42, 0.42, [0.18, 0.13, 0.09], [0, 0, 0], 0.1, 1);
      }
    }

    // lantern under the awning
    if (rng.chance(0.66)) {
      const lc = rgb(col);
      prop('box', fx + nx * (awn * 0.55), b.ground + 2.05, fz + nz * (awn * 0.55), outYaw, 0.22, 0.32, 0.22,
        [0.05, 0.04, 0.04], lc.map((v) => v * 1.3) as [number, number, number], 0.1, 0);
    }

    // AC, pipe, shutter clutter
    if (rng.chance(0.55)) {
      prop('box', fx + nx * 0.28 + lx * rng.range(-sl.w * 0.3, sl.w * 0.3), b.ground + rng.range(4.2, Math.min(8, sl.H - 0.4)), fz + nz * 0.28,
        outYaw, 0.75, 0.42, 0.38, [0.16, 0.16, 0.17], [0, 0, 0], 0.55, 1);
    }
    if (rng.chance(0.5)) {
      // Cylinder is Y-up; pitch π/2 lays the long axis along local −Z, then yaw aims it down the facade.
      prop('cyl', fx + nx * 0.2, b.ground + 3.55, fz + nz * 0.2, alongYaw, 0.16, sl.w * 0.8, 0.16, [0.22, 0.2, 0.18], [0, 0, 0], 0.75, 1, 1, Math.PI / 2);
    }

    // plastic sheet
    if (rng.chance(0.22)) {
      prop('quadZ', fx + nx * (awn * 0.92), b.ground + 1.7, fz + nz * (awn * 0.92), outYaw, rng.range(0.7, 1.3), 1.5, 1,
        [0.75, 0.82, 0.8], [0.05, 0.08, 0.08], 0, 2, 0.28);
    }
  }

  // curb on the two owned edges, just outside the facade
  for (const face of ['a+', 'b+'] as FaceDir[]) {
    const os = face === 'a+' ? 1 : 0;
    const ot = face === 'b+' ? 1 : 0;
    const s = face === 'a+' ? b.la / 2 + 0.28 : 0;
    const t = face === 'b+' ? b.lb / 2 + 0.28 : 0;
    const [x, z] = world(s, t);
    const nx = a.ax * os + a.bx * ot;
    const nz = a.az * os + a.bz * ot;
    const along = face === 'a+' ? b.lb : b.la;
    prop('box', x, b.ground + 0.08, z, yawOf(nx, nz), 0.22, 0.16, along * 0.92, [0.07, 0.07, 0.075], [0, 0, 0], 0.15, 1);
  }

  // cables across the two owned streets (a+ and b+)
  for (const face of ['a+', 'b+'] as FaceDir[]) {
    const os = face === 'a+' ? 1 : 0;
    const ot = face === 'b+' ? 1 : 0;
    const len = face === 'a+' ? b.lb : b.la;
    const nC = face === 'a+' ? 3 : 2;
    for (let k = 0; k < nC; k++) {
      const u = -len / 2 + ((k + 0.5) * len) / nC;
      const s0 = face === 'a+' ? b.la / 2 : u;
      const t0 = face === 'a+' ? u : b.lb / 2;
      const span = b.street;
      const sag = 0.45;
      const y0 = b.ground + rng.range(5.6, 7.2);
      const segs = 4;
      for (let i = 0; i < segs; i++) {
        const tA = i / segs, tB = (i + 1) / segs;
        const mid = (tA + tB) / 2;
        const sagY = Math.sin(mid * Math.PI) * sag;
        const s = s0 + os * span * mid;
        const t = t0 + ot * span * mid;
        const [x, z] = world(s, t);
        const nx = a.ax * os + a.bx * ot;
        const nz = a.az * os + a.bz * ot;
        prop('box', x, y0 - sagY, z, yawOf(nx, nz), 0.035, 0.035, span / segs + 0.05, [0.08, 0.08, 0.09], [0, 0, 0], 0.6, 1);
      }
    }
  }

  // short market lamps on the same two edges
  for (const face of ['a+', 'b+'] as FaceDir[]) {
    const len = face === 'a+' ? b.lb : b.la;
    const n = Math.max(1, Math.round(len / 18));
    for (let k = 0; k < n; k++) {
      const u = -len / 2 + ((k + 0.5) * len) / n;
      const s = face === 'a+' ? b.la / 2 + 0.35 : u;
      const t = face === 'a+' ? u : b.lb / 2 + 0.35;
      const [x, z] = world(s, t);
      const os = face === 'a+' ? 1 : 0;
      const ot = face === 'b+' ? 1 : 0;
      const nx = a.ax * os + a.bx * ot;
      const nz = a.az * os + a.bz * ot;
      const yaw = yawOf(nx, nz);
      prop('cyl', x, b.ground + 2.05, z, 0, 0.09, 4.1, 0.09, [0.07, 0.07, 0.08], [0, 0, 0], 0.7, 1);
      const head = rgb(rng.chance(0.5) ? SignColor.Amber : SignColor.Cyan);
      prop('box', x + nx * 0.45, b.ground + 4.05, z + nz * 0.45, yaw, 0.55, 0.12, 0.28, [0.1, 0.1, 0.1], head.map((v) => v * 1.6) as [number, number, number], 0.3, 1);
      pools.push({ x: x + nx * 0.8, y: b.ground + 0.04, z: z + nz * 0.8, yaw, len: 7, wid: 2.2, rgb: head, intensity: 0.45, rank: 1 });
    }
  }

  // courtyard grate + steam, and a catwalk on some blocks
  if (rng.chance(0.7)) {
    const [gx, gz] = world(rng.range(-2, 2), rng.range(-2, 2));
    prop('quadY', gx, b.ground + 0.02, gz, rng.range(0, 1.5), 1.1, 1, 1.1, [0.05, 0.05, 0.055], [0, 0, 0], 0.8, 1);
    steam.push({ x: gx, y: b.ground + 0.15, z: gz, seed: rng.next(), rank: 0 });
    steam.push({ x: gx + 0.3, y: b.ground + 0.15, z: gz - 0.2, seed: rng.next(), rank: 1 });
  }

  if (rng.chance(0.38) && b.la > 30) {
    const deckY = 4.05;
    const deckLen = b.la - 16;
    addBox(0, 0, 1.7, deckLen, 0.16, deckY, Style.Industrial, 1, 0.02, 0.8);
    const steps = 12;
    const rise = deckY / steps;
    const run = 0.42;
    const stairT = b.lb / 2 - 10;
    for (let i = 0; i < steps; i++) {
      const s = -deckLen / 2 - (steps - i) * run;
      addBox(s, stairT, 1.15, run * 0.98, rise * (i + 1), 0, Style.Solid, 1, 0.02, 0.75);
    }
    const [rx, rz] = world(0, 0.95);
    prop('box', rx, b.ground + deckY + 0.55, rz, yawOf(a.bx, a.bz), deckLen * 0.95, 0.08, 0.06, [0.15, 0.15, 0.16], [0, 0, 0], 0.7, 2);
    const [r2x, r2z] = world(0, -0.95);
    prop('box', r2x, b.ground + deckY + 0.55, r2z, yawOf(a.bx, a.bz), deckLen * 0.95, 0.08, 0.06, [0.15, 0.15, 0.16], [0, 0, 0], 0.7, 2);
  }

  // bollards and a bin, low rank
  if (rng.chance(0.8)) {
    const [x, z] = world(b.la / 2 + 1.15, rng.range(-b.lb / 4, b.lb / 4));
    prop('box', x, b.ground + 0.45, z, 0, 0.55, 0.9, 0.48, [0.12, 0.13, 0.12], [0, 0, 0], 0.3, 1);
    prop('box', x + 0.7, b.ground + 0.18, z + 0.4, rng.next() * 3, 0.38, 0.32, 0.34, [0.08, 0.07, 0.06], [0, 0, 0], 0, 2);
  }
  for (let i = 0; i < 3; i++) {
    const s = rng.range(-b.la / 3, b.la / 3);
    const t = (rng.chance(0.5) ? 1 : -1) * (b.lb / 2 + 1.05);
    const [x, z] = world(s, t);
    prop('cyl', x, b.ground + 0.42, z, 0, 0.16, 0.84, 0.16, [0.14, 0.14, 0.15], [0, 0, 0], 0.65, 2);
  }

  // vending machine tucked at a facade
  if (rng.chance(0.65) && slots.length) {
    const sl = slots[rng.int(0, slots.length - 1)];
    const fs = sl.s + sl.os * (sl.depth / 2);
    const ft = sl.t + sl.ot * (sl.depth / 2);
    const vs = fs + sl.os * 0.45 + sl.as * (sl.w * 0.42);
    const vt = ft + sl.ot * 0.45 + sl.at * (sl.w * 0.42);
    const [x, z] = world(vs, vt);
    const nx = a.ax * sl.os + a.bx * sl.ot;
    const nz = a.az * sl.os + a.bz * sl.ot;
    const yaw = yawOf(nx, nz);
    const vc = rgb(rng.pick(PAL));
    prop('box', x, b.ground + 0.95, z, yaw, 0.85, 1.9, 0.62, [0.07, 0.07, 0.08], [0, 0, 0], 0.45, 1);
    prop('box', x + nx * 0.34, b.ground + 1.15, z + nz * 0.34, yaw, 0.62, 0.9, 0.04, vc, vc.map((v) => v * 0.9) as [number, number, number], 0.1, 1);
  }

  return { boxes, signs, props, steam, pools, noodle, bibi, life };
}
