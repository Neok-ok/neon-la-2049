// Pure refinery block. No three.js, no Math.random. The archetype emits the boxes.
// LOD0 props and the city-wide flame list read the same function.
//
// Pipe racks follow the Arts District works (posts and runs on the owned north edge)
// and add a second tier. That district keeps its own copy. Stage 18 should call this.
import { Rng } from '../../../core/rng';
import { Style, SignColor, type FaceDir, type StyleId } from '../../../world/fabric/types';
import { phraseSeed } from '../../../world/materials/signPhrases';
import type { CityLayout } from '../../../world/layout';
import { distToSegment } from '../../../world/layout';
import { REFINERY_OFF, refineryDormant, resolveRefinery, type RefineryParams, type ResolvedRefinery } from './params';

export interface RefineryBlock {
  cx: number;
  cz: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  la: number;
  lb: number;
  street: number;
  seed: number;
  ground: number;
}

export interface RefineryBox {
  s: number;
  t: number;
  lb: number;
  la: number;
  h: number;
  base: number;
  style: StyleId;
  lit: number;
  tint: number;
  detail: 0 | 1 | 2;
}

export interface RefinerySign {
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
  seed: number;
}

export type PropTemplate = 'box' | 'cyl' | 'drum' | 'sphere' | 'quadY' | 'quadZ';

export interface RefineryProp {
  template: PropTemplate;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  sx: number;
  sy: number;
  sz: number;
  color: [number, number, number];
  emissive: [number, number, number];
  metal: number;
  rank: number;
  alpha?: number;
  pass?: 'opaque' | 'fade' | 'add';
}

/** World-space flare. `size` is the close-range sprite radius in metres. */
export interface RefineryFlame {
  x: number;
  y: number;
  z: number;
  size: number;
  seed: number;
}

export type RefineryKind = 'empty' | 'pump' | 'tank' | 'sphere' | 'crack' | 'pipes' | 'shed';

export interface RefineryPlan {
  boxes: RefineryBox[];
  signs: RefinerySign[];
  props: RefineryProp[];
  flames: RefineryFlame[];
  loops: Array<Array<[number, number]>>;
  kind: RefineryKind;
}

type RGB = [number, number, number];

const STEEL: RGB = [0.28, 0.30, 0.32];
const TANK: RGB = [0.50, 0.52, 0.54];
const RUST: RGB = [0.46, 0.24, 0.13];
const CONC: RGB = [0.34, 0.32, 0.30];
const DARK: RGB = [0.07, 0.065, 0.06];
const RED: RGB = [0.9, 0.05, 0.03];
const NONE: RGB = [0, 0, 0];
const ORANGE: RGB = [1.35, 0.42, 0.08];

/** BLACK OIL, hanzi STEAM, 2049, kana STEAM. Existing atlas cells. No company names. */
const PHRASES = [67, 65, 80, 10];

const EMPTY: RefineryPlan = { boxes: [], signs: [], props: [], flames: [], loops: [], kind: 'empty' };

function world(b: RefineryBlock, s: number, t: number, y: number): { x: number; y: number; z: number } {
  return {
    x: b.cx + b.ax * s + b.bx * t,
    y: b.ground + y,
    z: b.cz + b.az * s + b.bz * t,
  };
}

export function planRefinery(block: RefineryBlock, layout: CityLayout, raw: RefineryParams = {}): RefineryPlan {
  const p = resolveRefinery(raw);
  if (refineryDormant(p) || block.ground > 45) return EMPTY;
  if (layout.isOcean(block.cx, block.cz) || layout.isReserved(block.cx, block.cz, 6)) return EMPTY;

  const r = new Rng(block.seed);
  const boxes: RefineryBox[] = [];
  const signs: RefinerySign[] = [];
  const props: RefineryProp[] = [];
  const flames: RefineryFlame[] = [];
  const loops: Array<Array<[number, number]>> = [];

  const put = (
    s: number, t: number, lb: number, la: number, h: number, base: number,
    style: StyleId, lit: number, tint: number, detail: 0 | 1 | 2,
  ) => {
    if (lb < 0.15 || la < 0.15 || h < 0.12) return;
    const q = world(block, s, t, 0);
    if (p.keepOut?.(q.x, q.z)) return;
    if (layout.isReserved(q.x, q.z, Math.max(lb, la) * 0.35)) return;
    if (layout.isOcean(q.x, q.z)) return;
    boxes.push({ s, t, lb, la, h, base, style, lit, tint, detail });
  };

  const prop = (
    s: number, t: number, y: number, template: PropTemplate,
    sx: number, sy: number, sz: number, yaw: number,
    color: RGB, emissive: RGB, metal: number, rank: number, pitch = 0,
    alpha = 1, pass?: 'opaque' | 'fade' | 'add',
  ) => {
    const q = world(block, s, t, y);
    if (p.keepOut?.(q.x, q.z)) return;
    if (layout.isReserved(q.x, q.z, Math.max(sx, sz) * 0.25)) return;
    props.push({
      template, x: q.x, y: q.y, z: q.z, yaw, pitch, sx, sy, sz,
      color, emissive, metal, rank, alpha, pass,
    });
  };

  const flame = (s: number, t: number, y: number, size: number, seed: number) => {
    const q = world(block, s, t, y);
    if (p.keepOut?.(q.x, q.z)) return;
    if (layout.isReserved(q.x, q.z, 3)) return;
    flames.push({ x: q.x, y: q.y, z: q.z, size, seed });
    // Ground wash. The sprite is the flame; this quad is the spill, not a scene light.
    prop(s, t, 0.12, 'quadY', size * 3.4, 1, size * 3.4, r.range(0, 1.2), DARK, ORANGE, 0, 0, 0, 0.42, 'add');
  };

  let kind: RefineryKind = 'shed';
  if (p.pump) {
    kind = 'pump';
    pumpHouse(put, prop, flame, p, r);
  } else {
    const roll = r.next();
    const tankCut = Math.min(0.72, p.tankShare);
    // A zero sphere share leaves this cut on the tank cut, so Stage 15's roll is unchanged.
    const sphereCut = Math.min(0.78, tankCut + p.sphereShare);
    const towerCut = Math.min(0.9, sphereCut + p.towerShare);
    const pipeCut = Math.min(0.96, towerCut + p.pipeShare);
    if (p.tanks && roll < tankCut) {
      kind = 'tank';
      tankFarm(put, prop, r, block);
      if (p.flares && r.next() < p.flareOnYard) flareStack(put, prop, flame, r, p, 18, -block.lb * 0.28);
    } else if (p.spheres && roll < sphereCut) {
      kind = 'sphere';
      sphereFarm(put, prop, r, p, block);
      if (p.flares && r.next() < p.flareOnYard) flareStack(put, prop, flame, r, p, 16, -block.lb * 0.22);
    } else if (p.towers && roll < towerCut) {
      kind = 'crack';
      cracker(put, prop, r, p);
      if (p.flares) flareStack(put, prop, flame, r, p, 16, 22);
    } else if (p.racks && roll < pipeCut) {
      kind = 'pipes';
      pipeCanyon(put, r, block);
      shed(put, r, -8, 6);
      if (p.flares && r.next() < p.flareOnYard) flareStack(put, prop, flame, r, p, -22, 18);
    } else {
      kind = 'shed';
      shed(put, r, r.range(-12, 8), r.range(-8, 8));
      if (p.flares && r.next() < p.flareOnYard * 0.45) flareStack(put, prop, flame, r, p, 14, 8);
    }
    if (p.racks && kind !== 'pipes' && r.next() < p.rackOnEdge) edgeRack(put, block, false);
  }

  if (p.jetty) loadingJetty(put, block, layout);
  if (kind !== 'pump' && r.next() < 0.08) yardSign(signs, r, block);
  sidewalk(loops, block);

  return { boxes, signs, props, flames, loops, kind };
}

/** Three storeys at the §4 residential module (3.4 m → 10.2 m). The door faces south. */
function pumpHouse(
  put: Emit, prop: PropFn, flame: FlameFn, p: ResolvedRefinery, r: Rng,
): void {
  const s0 = p.doorS;
  const depth = 22;
  const width = 16;
  const wall = 0.48;
  const gap = 1.35;
  const H = p.pumpH;
  const s1 = s0 + depth;
  const sMid = (s0 + s1) / 2;
  const cheek = (width - gap * 2) / 2;
  put(s0 + wall / 2, -width / 2 + cheek / 2, cheek, wall, H, 0, Style.Industrial, 0.08, 0.55, 0);
  put(s0 + wall / 2, width / 2 - cheek / 2, cheek, wall, H, 0, Style.Industrial, 0.08, 0.55, 0);
  put(s0 + wall / 2, 0, gap * 2, wall, H - 3.3, 3.3, Style.Industrial, 0.08, 0.55, 0);
  put(s1 - wall / 2, 0, width, wall, H, 0, Style.Industrial, 0.06, 0.5, 0);
  put(sMid, -width / 2 + wall / 2, wall, depth, H, 0, Style.Industrial, 0.06, 0.52, 0);
  put(sMid, width / 2 - wall / 2, wall, depth, H, 0, Style.Industrial, 0.06, 0.52, 0);
  put(sMid, 0, width - 0.6, depth - 0.6, 0.45, H, Style.Industrial, 0.02, 0.48, 0);
  // Clerestory slit. Amber, not a sign.
  put(sMid, width / 2 - 0.2, 0.28, depth * 0.55, 0.7, H - 2.4, Style.Glow, 0.55, 1.15, 1);
  put(s0 - 2.2, 0, 4.2, 2.6, 0.28, 0, Style.Solid, 0.02, 0.4, 1);
  prop(s0 - 1.5, gap + 1.1, 3.4, 'box', 0.16, 6.6, 0.16, 0, DARK, [0.85, 0.42, 0.1], 0.4, 0);
  prop(s0 - 1.85, gap + 1.1, 6.7, 'box', 0.7, 0.12, 0.28, 0, DARK, [1.2, 0.55, 0.14], 0.2, 0);
  if (p.flares) flareStack(put, prop, flame, r, p, s1 + 14, width / 2 + 10);
}

function tankFarm(put: Emit, prop: PropFn, r: Rng, block: RefineryBlock): void {
  const s = r.range(-18, 10);
  const t = r.range(-16, 12);
  const n = r.int(4, 6);
  // One berm for the group. Solid, so the far mesh can drop it (Industrial would not).
  put(s, t, 36, 42, 1.5, 0, Style.Solid, 0.01, 0.42, 1);
  for (let i = 0; i < n; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const dia = r.range(14, 22);
    const h = r.range(12, 20);
    const ts = s + (col - 1) * 16;
    const tt = t + (row - 0.5) * 15;
    // Drum radius is 0.5, so sx = diameter. The roof is in the template. A small hatch sits on it.
    prop(ts, tt, h / 2, 'drum', dia, h, dia, 0, TANK, [0.09, 0.055, 0.03], 0.55, 0);
    prop(ts, tt, h + 0.2, 'cyl', dia * 0.28, 0.55, dia * 0.28, 0, STEEL, NONE, 0.6, 1);
    // Catwalk ring: the same open cylinder, wider and thin, sitting on the shoulder.
    const ringY = h * 0.78;
    prop(ts, tt, ringY, 'cyl', dia + 1.5, 0.22, dia + 1.5, 0, STEEL, NONE, 0.65, 1);
    prop(ts, tt, ringY + 1.05, 'cyl', dia + 1.7, 0.06, dia + 1.7, 0, STEEL, NONE, 0.7, 2);
    prop(ts + dia * 0.5 + 0.3, tt, ringY * 0.5, 'box', 0.16, ringY, 0.16, 0, RUST, NONE, 0.55, 2);
  }
  // Keep a footprint inside the block so a short block still reads as a yard.
  if (block.la < 40) put(s, t, 8, 8, 0.4, 0, Style.Solid, 0, 0.35, 2);
}

/** Coastal storage spheres. Diameter is 4–6 of the 4.2 m module, sitting on the same 1.5 m berm. */
function sphereFarm(put: Emit, prop: PropFn, r: Rng, p: ResolvedRefinery, block: RefineryBlock): void {
  const s = r.range(-14, 8);
  const t = r.range(-12, 10);
  const n = r.int(3, 4);
  put(s, t, 34, 40, 1.5, 0, Style.Solid, 0.01, 0.4, 1);
  const mod = 4.2;
  for (let i = 0; i < n; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const steps = r.int(4, 6);
    const dia = Math.min(p.sphere[1], Math.max(p.sphere[0], steps * mod));
    const ts = s + (col - 0.5) * 18;
    const tt = t + (row - 0.5) * 18;
    const y = 1.5 + dia * 0.5;
    prop(ts, tt, y, 'sphere', dia, dia, dia, 0, [0.58, 0.6, 0.58], [0.08, 0.05, 0.03], 0.62, 0);
    prop(ts, tt, y, 'cyl', dia + 1.4, 0.28, dia + 1.4, 0, STEEL, NONE, 0.7, 1);
    prop(ts, tt, 1.5 + dia * 0.22, 'cyl', dia * 0.22, dia * 0.42, dia * 0.22, 0, RUST, NONE, 0.5, 2);
  }
  if (block.la < 40) put(s, t, 8, 8, 0.4, 0, Style.Solid, 0, 0.35, 2);
}

interface WallHit { x: number; z: number; d: number; half: number }

function closestWall(layout: CityLayout, x: number, z: number): WallHit | null {
  let best: WallHit | null = null;
  for (const wall of layout.seaWalls) {
    const half = wall.width * 0.5;
    for (let i = 0; i < wall.pts.length - 1; i++) {
      const ax = wall.pts[i]![0], az = wall.pts[i]![1];
      const bx = wall.pts[i + 1]![0], bz = wall.pts[i + 1]![1];
      const d = distToSegment(x, z, ax, az, bx, bz);
      if (best && d >= best.d) continue;
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      best = { x: ax + dx * t, z: az + dz * t, d, half };
    }
  }
  return best;
}

/**
 * A pier only if it can reach the sea-wall corridor without leaving the district
 * or entering the ocean. A kilometre of someone else's coast is not a jetty.
 */
function loadingJetty(put: Emit, block: RefineryBlock, layout: CityLayout): void {
  const home = layout.districtAt(block.cx, block.cz).id;
  const hit = closestWall(layout, block.cx, block.cz);
  if (!hit || hit.d > 220 || hit.d < hit.half + 8) return;
  const len = hit.d || 1;
  const ux = (hit.x - block.cx) / len;
  const uz = (hit.z - block.cz) / len;
  const stepS = block.ax * ux + block.az * uz;
  const stepT = block.bx * ux + block.bz * uz;
  const reach = Math.hypot(block.la, block.lb) * 0.42;
  let s = stepS * reach;
  let t = stepT * reach;
  const spots: Array<[number, number]> = [];
  for (let n = 0; n < 7; n++) {
    s += stepS * 12;
    t += stepT * 12;
    const q = world(block, s, t, 0);
    if (layout.isOcean(q.x, q.z)) return;
    if (layout.districtAt(q.x, q.z).id !== home) return;
    const w = closestWall(layout, q.x, q.z);
    if (!w || w.d < w.half + 6) return;
    spots.push([s, t]);
    if (w.d < w.half + 36) {
      for (const [ss, tt] of spots) put(ss, tt, 7.2, 12, 1.15, 0, Style.Solid, 0.02, 0.38, 0);
      put(s, t, 0.45, 0.45, 1.1, 1.15, Style.Industrial, 0.05, 0.5, 1);
      return;
    }
  }
}

function onModule(h: number, mod: number): number {
  if (!(mod > 0)) return h;
  return Math.max(mod, Math.round(h / mod) * mod);
}

function cracker(put: Emit, prop: PropFn, r: Rng, p: ResolvedRefinery): void {
  const s = r.range(-8, 6);
  const t = r.range(-6, 6);
  let H = r.range(p.tower[0], p.tower[1]);
  H = Math.min(p.tower[1], Math.max(p.tower[0], onModule(H, p.module)));
  put(s, t, 22, 28, 8.4, 0, Style.Industrial, 0.06, 0.5, 0);
  const cols: Array<[number, number, number, number]> = [
    [0, 0, 7.2, 1],
    [-8, 6, 5.4, 0.72],
    [7, -5, 4.6, 0.58],
  ];
  for (const [ds, dt, w, k] of cols) {
    const h = k === 1 ? H : onModule(H * k, p.module);
    put(s + ds, t + dt, w, w, h, 0, Style.Industrial, 0.04, r.range(0.48, 0.66), 0);
    put(s + ds, t + dt, w + 0.8, w + 0.8, 0.55, h * 0.46, Style.Industrial, 0.02, 0.4, 1);
    put(s + ds, t + dt, w + 0.6, w + 0.6, 0.45, h * 0.78, Style.Industrial, 0.02, 0.42, 1);
    prop(s + ds - w * 0.55, t + dt, h * 0.5, 'box', 0.14, h * 0.92, 0.14, 0, STEEL, NONE, 0.65, 1);
  }
  // Skirt pipes between the columns. Detail 1, so the far mesh keeps the columns only.
  put(s - 4, t + 3, 0.55, 12, 0.55, 6.2, Style.Industrial, 0.02, 0.55, 1);
  put(s + 3, t - 2, 10, 0.5, 0.5, 5.4, Style.Industrial, 0.02, 0.55, 1);
}

function flareStack(
  put: Emit, prop: PropFn, flame: FlameFn, r: Rng, p: ResolvedRefinery, s: number, t: number,
): void {
  let H = r.range(p.stack[0], p.stack[1]);
  H = Math.min(p.stack[1], Math.max(p.stack[0], onModule(H, p.module)));
  prop(s, t, 0.2, 'cyl', 7.2, 0.4, 7.2, 0, CONC, NONE, 0.15, 1);
  put(s, t, 4.6, 4.6, H, 0, Style.Industrial, 0.02, r.range(0.46, 0.62), 0);
  for (let i = 0; i < 3; i++) {
    put(s, t, 5.3, 5.3, 0.55, H * (0.3 + i * 0.22), Style.Industrial, 0.02, 0.4, 1);
  }
  put(s, t, 2.4, 2.4, 1.1, H, Style.Industrial, 0.02, 0.5, 1);
  prop(s - 2.5, t, H * 0.5, 'box', 0.16, H * 0.9, 0.16, 0, STEEL, NONE, 0.7, 1);
  // Red obstruction point. Glow tint does not go red, so this is a kit emissive.
  prop(s, t, H + 1.6, 'box', 0.85, 0.85, 0.85, 0, DARK, RED, 0.2, 0);
  const size = 5.5 + (H / 140) * 7.5;
  flame(s, t, H + 3.2, size, r.next());
}

/** Owned north edge, same idea as the works, plus a second pipe tier. */
function edgeRack(put: Emit, block: RefineryBlock, heavy: boolean): void {
  const y = 7.4;
  const s = block.la / 2 + 3.2;
  const span = block.lb * (heavy ? 0.86 : 0.7);
  const tiers = heavy ? 4 : 3;
  for (let i = 0; i < tiers; i++) {
    put(s, 0, span, 0.42, 0.34, y + i * 0.62, Style.Industrial, 0.02, 0.62, 1);
  }
  put(s, -span * 0.34, 0.48, 0.48, y + (tiers - 1) * 0.62, 0, Style.Industrial, 0.02, 0.5, 1);
  put(s, span * 0.34, 0.48, 0.48, y + (tiers - 1) * 0.62, 0, Style.Industrial, 0.02, 0.5, 1);
  if (heavy) put(s, 0, 0.42, 0.42, y + (tiers - 1) * 0.62, 0, Style.Industrial, 0.02, 0.5, 1);
}

function pipeCanyon(put: Emit, r: Rng, block: RefineryBlock): void {
  edgeRack(put, block, true);
  // East edge, half the canyons. The neighbour does not repeat the north run.
  if (r.chance(0.55)) {
    const t = block.lb / 2 + 3.2;
    const span = block.la * 0.5;
    const y = 7.4;
    for (let i = 0; i < 3; i++) put(0, t, 0.4, span, 0.32, y + i * 0.55, Style.Industrial, 0.02, 0.58, 1);
    put(-span * 0.3, t, 0.45, 0.45, y + 1.1, 0, Style.Industrial, 0.02, 0.5, 1);
    put(span * 0.3, t, 0.45, 0.45, y + 1.1, 0, Style.Industrial, 0.02, 0.5, 1);
  }
}

function shed(put: Emit, r: Rng, s: number, t: number): void {
  const H = r.range(10.2, 18.6);
  const la = r.range(28, 48);
  const lb = r.range(16, 28);
  put(s, t, lb, la, H * 0.78, 0, Style.Industrial, r.range(0.04, 0.1), r.range(0.5, 0.7), 0);
  put(s, t, lb * 0.9, la * 0.86, H * 0.22, H * 0.78, Style.Panel, 0.05, 0.72, 1);
  put(s - la * 0.2, t, 4.2, 0.3, 3.2, 0.2, Style.Solid, 0.02, 0.35, 2);
}

function yardSign(signs: RefinerySign[], r: Rng, block: RefineryBlock): void {
  const cell = PHRASES[r.int(0, PHRASES.length - 1)]!;
  signs.push({
    s: -block.la * 0.12,
    t: r.range(-6, 6),
    hb: 6,
    ha: 8,
    face: 'a-',
    along: 0,
    y: r.range(4.2, 7.2),
    w: 2.8,
    h: 1.1,
    color: r.chance(0.5) ? SignColor.Amber : SignColor.Yellow,
    kind: 0,
    seed: phraseSeed(cell),
  });
}

function sidewalk(loops: Array<Array<[number, number]>>, block: RefineryBlock): void {
  const s = -(block.la / 2 + 2.2);
  const t0 = -block.lb * 0.28;
  const t1 = block.lb * 0.28;
  const a = world(block, s, t0, 0);
  const b = world(block, s, t1, 0);
  const c = world(block, s + 1.1, t1, 0);
  const d = world(block, s + 1.1, t0, 0);
  loops.push([[a.x, a.z], [b.x, b.z], [c.x, c.z], [d.x, d.z]]);
}

type Emit = (
  s: number, t: number, lb: number, la: number, h: number, base: number,
  style: StyleId, lit: number, tint: number, detail: 0 | 1 | 2,
) => void;

type PropFn = (
  s: number, t: number, y: number, template: PropTemplate,
  sx: number, sy: number, sz: number, yaw: number,
  color: RGB, emissive: RGB, metal: number, rank: number, pitch?: number,
  alpha?: number, pass?: 'opaque' | 'fade' | 'add',
) => void;

type FlameFn = (s: number, t: number, y: number, size: number, seed: number) => void;

export { REFINERY_OFF };
