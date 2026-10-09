// Pure block plan. The archetype emits the boxes; LOD0 props, steam and sparks
// read the same function. No three.js.
import { Rng } from '../../core/rng';
import { Style, SignColor, type FaceDir, type StyleId } from '../../world/fabric/types';
import { phraseSeed } from '../../world/materials/signPhrases';
import type { CityLayout } from '../../world/layout';
import {
  HALL, foundryAt, type ArtsBlock, type FoundryId,
} from './spec';

export interface ArtsBox {
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

export interface ArtsSign {
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

export type PropTemplate = 'box' | 'cyl' | 'quadY' | 'quadZ';

export interface ArtsProp {
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
}

export interface ArtsPuff {
  x: number;
  y: number;
  z: number;
  /** 0 vent, 1 grate, 2 plume (static on low), 3 spark, 4 pour flare */
  kind: number;
  seed: number;
  sx: number;
  sy: number;
  sz: number;
  rank: number;
}

export interface ArtsPlan {
  boxes: ArtsBox[];
  signs: ArtsSign[];
  props: ArtsProp[];
  puffs: ArtsPuff[];
  loops: Array<Array<[number, number]>>;
  foundry: FoundryId | null;
}

type RGB = [number, number, number];

const BRICK: RGB = [0.45, 0.22, 0.14];
const RUST: RGB = [0.48, 0.26, 0.14];
const STEEL: RGB = [0.30, 0.32, 0.34];
const CONC: RGB = [0.36, 0.34, 0.32];
const STAIN: RGB = [0.28, 0.26, 0.24];
const DARK: RGB = [0.07, 0.065, 0.06];
const RED: RGB = [0.85, 0.06, 0.04];
const NONE: RGB = [0, 0, 0];

const PHRASES = [2, 10, 23, 39, 47, 49, 58, 62];

interface RiverHit {
  dist: number;
  clear: number;
  qx: number;
  qz: number;
  tx: number;
  tz: number;
  half: number;
}

function riverHit(layout: CityLayout, x: number, z: number): RiverHit | null {
  const river = layout.rivers.find((r) => r.id === 'la-river');
  if (!river || river.pts.length < 2) return null;
  let bestD = Infinity;
  let qx = x;
  let qz = z;
  let tx = 0;
  let tz = 1;
  for (let i = 0; i < river.pts.length - 1; i++) {
    const ax = river.pts[i]![0], az = river.pts[i]![1];
    const bx = river.pts[i + 1]![0], bz = river.pts[i + 1]![1];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(px - x, pz - z);
    if (d < bestD) {
      bestD = d;
      qx = px;
      qz = pz;
      const len = Math.hypot(dx, dz) || 1;
      tx = dx / len;
      tz = dz / len;
    }
  }
  return { dist: bestD, clear: bestD - river.width * 0.5, qx, qz, tx, tz, half: river.width * 0.5 };
}

/** Extra fog beside the channel. 1 inside the reserve, 0 once the bank is 36 m behind. */
export function artsRiverBoost(layout: CityLayout, x: number, z: number): number {
  const hit = riverHit(layout, x, z);
  if (!hit || hit.clear > 36) return 0;
  if (hit.clear <= 0) return 1;
  return 1 - hit.clear / 36;
}

/** Metres of clear ground west of the reserve, sampled at the block's east edge. */
export function eastClearance(layout: CityLayout, block: ArtsBlock): number {
  const hit = riverHit(layout, block.cx + block.lb * 0.5, block.cz);
  return hit ? hit.clear : 999;
}

function world(b: ArtsBlock, s: number, t: number, y: number): { x: number; y: number; z: number } {
  return {
    x: b.cx + b.ax * s + b.bx * t,
    y: b.ground + y,
    z: b.cz + b.az * s + b.bz * t,
  };
}

export function planArts(block: ArtsBlock, layout: CityLayout): ArtsPlan {
  const r = new Rng(block.seed);
  const boxes: ArtsBox[] = [];
  const signs: ArtsSign[] = [];
  const props: ArtsProp[] = [];
  const puffs: ArtsPuff[] = [];
  const loops: Array<Array<[number, number]>> = [];
  const foundry = foundryAt(block);
  const east = eastClearance(layout, block);
  const river = east < 24;

  const put = (
    s: number, t: number, lb: number, la: number, h: number, base: number,
    style: StyleId, lit: number, tint: number, detail: 0 | 1 | 2,
  ) => {
    if (lb < 0.2 || la < 0.2 || h < 0.15) return;
    const p = world(block, s, t, 0);
    if (layout.isReserved(p.x, p.z, Math.max(lb, la) * 0.35)) return;
    boxes.push({ s, t, lb, la, h, base, style, lit, tint, detail });
  };

  const prop = (
    s: number, t: number, y: number, template: PropTemplate,
    sx: number, sy: number, sz: number, yaw: number,
    color: RGB, emissive: RGB, metal: number, rank: number, pitch = 0,
  ) => {
    const p = world(block, s, t, y);
    props.push({
      template, x: p.x, y: p.y, z: p.z, yaw, pitch, sx, sy, sz,
      color, emissive, metal, rank,
    });
  };

  const puff = (s: number, t: number, y: number, kind: number, seed: number, sx: number, sy: number, sz: number, rank: number) => {
    const p = world(block, s, t, y);
    puffs.push({ x: p.x, y: p.y, z: p.z, kind, seed, sx, sy, sz, rank });
  };

  if (foundry === 'pour') pourHall(put, prop, puff, r);
  else if (foundry) solidFoundry(put, prop, puff, r, foundry);
  else if (river && east < 10) bankYard(put, r);
  else {
    const roll = r.next();
    const shift = river ? -Math.min(18, 16 - Math.min(east, 16)) : 0;
    if (roll < 0.58) warehouse(put, prop, puff, r, block, shift);
    else if (roll < 0.82) shed(put, prop, r, shift);
    else yard(put, prop, r);
    if (!river && r.next() < 0.1) stackYard(put, prop, puff, r, false);
  }

  if (!foundry && r.next() < 0.28) pipeRack(put, r, block);
  if (!foundry && r.next() < 0.18) railSpur(put, block);
  if (r.next() < 0.22 && !foundry) sign(signs, r, block);
  groundKit(prop, puff, r, block, foundry);
  if (!river) sidewalk(loops, block);
  if (river) dressRiver(layout, block, prop, r);

  return { boxes, signs, props, puffs, loops, foundry };
}

function warehouse(
  put: Emit, prop: PropFn, puff: PuffFn, r: Rng, block: ArtsBlock, shift = 0,
): void {
  const H = r.range(14, 38);
  const la = Math.min(block.la - 8, r.range(48, 78));
  const lb = Math.min(block.lb - 8, r.range(28, 46));
  const s = r.range(-8, 6);
  const t = r.range(-6, 6) + shift;
  put(s, t, lb, la, H, 0, Style.Industrial, r.range(0.04, 0.12), r.range(0.55, 0.78), 0);
  // Brick dado on the south street face. Rank 0 so low tier still reads rust.
  // Yaw 0: local +X is east, so the long axis runs along the wall.
  prop(s - la / 2 - 0.22, t, 1.6, 'box', lb * 0.9, 3.2, 0.32, 0, BRICK, NONE, 0.12, 0);
  const teeth = r.chance(0.55);
  const n = teeth ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const u = (i - (n - 1) / 2) * (lb / n);
    if (teeth) {
      put(s, t + u, lb / n - 0.6, 3.2, 2.4, H, i === 1 ? Style.Glow : Style.Industrial, i === 1 ? 0.35 : 0.02, 0.9, 1);
    } else {
      const rise = 1 + Math.abs(i - 1) * 0.15;
      put(s, t + u, lb / n - 0.5, la * 0.7, 1.6 + rise, H, Style.Industrial, 0.03, 0.7, 1);
    }
  }
  // Loading dock and a roll-up door on the south face.
  const doorT = t + r.range(-lb * 0.2, lb * 0.2);
  put(s - la / 2 + 2.2, doorT, 8.5, 4.2, 1.15, 0, Style.Solid, 0.02, 0.45, 1);
  put(s - la / 2 - 0.2, doorT, 3.6, 0.28, 3.8, 0.15, Style.Solid, 0.04, 0.32, 2);
  put(s - la / 2 - 0.35, doorT, 3.2, 0.12, 0.18, 0.2, Style.Glow, 0.55, 0.85, 2);
  // Bricked-up arches.
  for (let k = 0; k < 3; k++) {
    const at = t - lb * 0.28 + k * lb * 0.28;
    if (Math.abs(at - doorT) < 3) continue;
    put(s - la / 2 - 0.2, at, 2.3, 0.35, 2.8, 0.4, Style.Solid, 0.01, 0.28, 2);
  }
  // Roof tank.
  put(s + la * 0.22, t + lb * 0.22, 3.4, 3.4, 2.6, H, Style.Industrial, 0.02, 0.6, 2);
  prop(s + 4, t - lb * 0.35, H + 1.1, 'box', 0.18, 2.2, 1.4, 0, STEEL, NONE, 0.7, 1);
  prop(s + 4, t - lb * 0.35, H + 2.3, 'box', 1.6, 0.08, 1.6, 0, STEEL, NONE, 0.6, 1);
  if (r.chance(0.4)) {
    put(s + 6, t, 1.4, Math.min(18, la * 0.35), 0.7, 6.2, Style.Industrial, 0.02, 0.5, 1);
  }
  if (r.chance(0.5)) puff(s, t + lb * 0.15, H + 1.2, 0, r.next(), 2.2, 3.4, 2.2, 1);
}

function shed(put: Emit, prop: PropFn, r: Rng, shift = 0): void {
  const H = r.range(10, 18);
  const la = r.range(36, 64);
  const lb = r.range(22, 40);
  const s = r.range(-4, 4);
  const t = r.range(-4, 4) + shift;
  put(s, t, lb, la, H * 0.72, 0, Style.Panel, r.range(0.03, 0.08), r.range(0.62, 0.85), 0);
  put(s, t, lb * 0.92, la * 0.92, H * 0.28, H * 0.72, Style.Industrial, 0.05, 0.7, 0);
  put(s, t - lb * 0.15, lb * 0.5, 0.4, 1.1, H * 0.78, Style.Glow, 0.22, 1.4, 1);
  prop(s - la / 2 - 0.16, t, 1.5, 'box', lb * 0.82, 3, 0.22, 0, STEEL, NONE, 0.75, 1);
}

function yard(put: Emit, prop: PropFn, r: Rng): void {
  const s = r.range(-6, 4);
  const t = r.range(-4, 4);
  put(s, t, 36, 28, 0.35, 0, Style.Solid, 0.01, 0.4, 1);
  const n = r.int(3, 5);
  for (let i = 0; i < n; i++) {
    const stack = r.chance(0.35) ? 2 : 1;
    for (let k = 0; k < stack; k++) {
      put(s - 8 + (i % 3) * 8, t - 8 + Math.floor(i / 3) * 7, 2.5, 8.5, 2.5, k * 2.5, Style.Industrial, 0.02, r.range(0.45, 0.75), 1);
    }
  }
  put(s + 12, t + 6, 7, 7, r.range(1.2, 2.4), 0, Style.Solid, 0, r.range(0.32, 0.45), 1);
  put(s + 14, t + 2, 5, 4, r.range(0.8, 1.6), 0, Style.Solid, 0, 0.3, 2);
  // Fence, chain-link read: thin posts and a rail. Razor is rank 2.
  for (const side of [-1, 1] as const) {
    prop(s + side * 16, t, 1.3, 'box', 0.12, 2.6, 22, 0, STEEL, NONE, 0.5, 1);
  }
  prop(s, t + 12, 1.3, 'box', 30, 2.6, 0.1, 0, STEEL, NONE, 0.5, 1);
  prop(s, t + 12, 2.7, 'box', 30, 0.08, 0.16, 0, STEEL, NONE, 0.8, 2);
  prop(s + 8, t - 4, 1.6, 'cyl', 3.2, 3.2, 3.2, 0, RUST, NONE, 0.45, 0);
  prop(s + 8, t + 2, 2.4, 'cyl', 2.4, 4.8, 2.4, 0, RUST, NONE, 0.4, 1);
}

function bankYard(put: Emit, r: Rng): void {
  put(-8, -16, 18, 22, r.range(10, 16), 0, Style.Industrial, 0.04, 0.6, 0);
  put(6, -18, 8, 8, 1.4, 0, Style.Solid, 0, 0.35, 1);
}

function solidFoundry(put: Emit, prop: PropFn, puff: PuffFn, r: Rng, id: FoundryId): void {
  const H = 18 + r.range(0, 6);
  const s = -6;
  const t = 2;
  put(s, t, 40, 56, H, 0, Style.Industrial, 0.06, 0.48, 0);
  put(s, t - 16, 1.2, 40, HALL.clerestoryH, H - 3.2, Style.Glow, 0.9, 0.8, 0);
  put(s, t + 16, 1.2, 40, HALL.clerestoryH, H - 3.2, Style.Glow, 0.82, 0.8, 0);
  put(s - 28, t, 4.2, 0.3, 4.2, 0.2, Style.Glow, 0.7, 0.75, 1);
  const seed = id === 'north' ? 0.31 : 0.62;
  for (let i = 0; i < 8; i++) {
    puff(s - 28, t + (i - 3.5) * 0.35, 1.2 + (i % 3) * 0.45, 3, seed + i * 0.07, 0.35, 0.55, 0.35, 1);
  }
  stackYard(put, prop, puff, r, true, s + 18, t + 16);
}

function pourHall(put: Emit, prop: PropFn, puff: PuffFn, r: Rng): void {
  const { s0, s1, t0, t1, wall, gap, roofY, roofH, clerestoryY, clerestoryH } = HALL;
  const sMid = (s0 + s1) / 2;
  const depth = s1 - s0;
  const width = t1 - t0;
  // Shell. The street gap is empty so the interior bay can sit in it.
  const cheek = (width - gap * 2) / 2;
  put(s0 + wall / 2, t0 + cheek / 2, cheek, wall, roofY, 0, Style.Industrial, 0.05, 0.5, 0);
  put(s0 + wall / 2, t1 - cheek / 2, cheek, wall, roofY, 0, Style.Industrial, 0.05, 0.5, 0);
  put(s0 + wall / 2, 0, gap * 2, wall, roofY - 4.4, 4.4, Style.Industrial, 0.05, 0.5, 0);
  put(s1 - wall / 2, 0, width, wall, roofY, 0, Style.Industrial, 0.05, 0.48, 0);
  put(sMid, t0 + wall / 2, wall, depth, roofY, 0, Style.Industrial, 0.05, 0.5, 0);
  put(sMid, t1 - wall / 2, wall, depth, roofY, 0, Style.Industrial, 0.05, 0.5, 0);
  put(sMid, 0, width - 1, depth - 1, roofH, roofY, Style.Industrial, 0.03, 0.55, 0);
  put(sMid, t0 + 0.9, 0.5, depth * 0.72, clerestoryH, clerestoryY, Style.Glow, 0.95, 0.78, 0);
  put(sMid, t1 - 0.9, 0.5, depth * 0.72, clerestoryH, clerestoryY, Style.Glow, 0.9, 0.78, 0);
  // Dock lip outside the door, clear of the opening.
  put(s0 - 2.4, 0, 5.2, 3.2, 0.4, 0, Style.Solid, 0.02, 0.4, 1);
  prop(s0 - 0.4, gap + 0.8, 2.2, 'box', 0.15, 4.4, 0.15, 0, STEEL, [0.4, 0.16, 0.04], 0.6, 0);
  stackYard(put, prop, puff, r, true, (s0 + s1) / 2, t1 + 8);
  // Pour: a flare and a shower at the door. The shader loops them.
  puff(s0 - 0.6, 0, 1.6, 4, 0.15, 1.4, 2.2, 1.4, 0);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI - Math.PI / 2;
    puff(s0 - 0.8, Math.sin(a) * 1.1, 0.6 + (i % 5) * 0.42, 3, 0.05 + i * 0.061, 0.28, 0.45, 0.28, 0);
  }
}

function stackYard(
  put: Emit, prop: PropFn, puff: PuffFn, r: Rng, force: boolean, s = 10, t = 14,
): void {
  const H = force ? r.range(92, 128) : r.range(74, 136);
  put(s, t, 5.2, 5.2, H, 0, Style.Industrial, 0.02, r.range(0.48, 0.66), 0);
  for (let i = 0; i < 3; i++) {
    put(s, t, 5.8, 5.8, 0.7, H * (0.28 + i * 0.22), Style.Industrial, 0.02, 0.4, 1);
  }
  put(s, t, 3.2, 3.2, 1.4, H, Style.Industrial, 0.02, 0.55, 1);
  // Cooling stack beside it, inside the fabric band.
  const cH = r.range(22, 38);
  put(s + 8, t - 6, 8.5, 8.5, cH, 0, Style.Industrial, 0.02, 0.58, 0);
  put(s + 8, t - 6, 10, 10, 1.2, cH, Style.Industrial, 0.02, 0.5, 1);
  // Ladder and a red beacon. The beacon is a kit box; Glow tint cannot go red.
  prop(s - 2.8, t, H * 0.5, 'box', 0.18, H * 0.92, 0.18, 0, STEEL, NONE, 0.7, 1);
  for (let i = 0; i < 5; i++) prop(s - 2.8, t, 4 + i * (H / 6), 'box', 0.7, 0.08, 0.18, 0, STEEL, NONE, 0.6, 2);
  prop(s, t, H + 1.5, 'box', 0.45, 0.45, 0.45, 0, DARK, RED, 0.2, 0);
  for (let i = 0; i < 3; i++) {
    puff(s + (i - 1) * 0.8, t, H + 2.2, 2, r.next(), 3.4, 6.5, 3.4, 0);
  }
  puff(s + 8, t - 6, cH + 1.4, 2, r.next(), 4.2, 3.2, 4.2, 1);
}

function pipeRack(put: Emit, r: Rng, block: ArtsBlock): void {
  // Owned edges only: +A (north) and, half the time, +B (east). The neighbour does not repeat them.
  const y = 7.4;
  const s = block.la / 2 + 3.2;
  const span = block.lb * 0.72;
  for (let i = 0; i < 3; i++) {
    put(s, 0, span, 0.42, 0.36, y + i * 0.55, Style.Industrial, 0.02, 0.62, 1);
  }
  put(s, -span * 0.32, 0.45, 0.45, y, 0, Style.Industrial, 0.02, 0.5, 1);
  put(s, span * 0.32, 0.45, 0.45, y, 0, Style.Industrial, 0.02, 0.5, 1);
  if (r.chance(0.5)) {
    const t = block.lb / 2 + 3.2;
    const spanA = block.la * 0.55;
    for (let i = 0; i < 2; i++) put(0, t, 0.4, spanA, 0.34, y + i * 0.5, Style.Industrial, 0.02, 0.6, 1);
    put(-spanA * 0.28, t, 0.45, 0.45, y, 0, Style.Industrial, 0.02, 0.5, 1);
    put(spanA * 0.28, t, 0.45, 0.45, y, 0, Style.Industrial, 0.02, 0.5, 1);
  }
}

function railSpur(put: Emit, block: ArtsBlock): void {
  const t = block.lb / 2 + 4.2;
  put(0, t - 0.7, 0.12, block.la * 0.8, 0.16, 0.02, Style.Solid, 0, 0.25, 1);
  put(0, t + 0.7, 0.12, block.la * 0.8, 0.16, 0.02, Style.Solid, 0, 0.25, 1);
}

function sign(signs: ArtsSign[], r: Rng, block: ArtsBlock): void {
  const cell = PHRASES[r.int(0, PHRASES.length - 1)]!;
  signs.push({
    s: -block.la * 0.15,
    t: 0,
    hb: 8,
    ha: 10,
    face: 'a-',
    along: r.range(-4, 4),
    y: r.range(5, 9),
    w: 3.2,
    h: 1.4,
    color: r.chance(0.5) ? SignColor.Amber : SignColor.Yellow,
    kind: 0,
    seed: phraseSeed(cell),
  });
}

function groundKit(prop: PropFn, puff: PuffFn, r: Rng, block: ArtsBlock, foundry: FoundryId | null): void {
  // Cracked asphalt and an oil puddle on the south street. Not a second ground sheet.
  const s = -block.la / 2 - 4;
  if (r.chance(0.7)) prop(s, r.range(-6, 6), 0.05, 'quadY', r.range(3, 7), 1, r.range(1.2, 2.4), r.range(-0.4, 0.4), DARK, NONE, 0.15, 1);
  if (r.chance(0.45)) prop(s + 1, r.range(-8, 8), 0.04, 'quadY', r.range(1.4, 2.6), 1, r.range(1.1, 2.2), 0, [0.05, 0.045, 0.03], NONE, 0.9, 1);
  // Drums and a pallet.
  if (r.chance(0.55)) {
    const t = r.range(-10, 10);
    prop(s + 3, t, 0.45, 'cyl', 0.55, 0.9, 0.55, 0, RUST, NONE, 0.35, 1);
    prop(s + 3, t + 0.7, 0.4, 'cyl', 0.5, 0.8, 0.5, 0, STEEL, NONE, 0.5, 1);
    prop(s + 2.2, t - 1.2, 0.12, 'box', 1.1, 0.16, 1.2, 0.2, [0.32, 0.24, 0.16], NONE, 0.05, 1);
  }
  // Street grate steam. Medium and up; low keeps plumes only.
  if (!foundry && r.chance(0.34)) puff(s, r.range(-8, 8), 0.3, 1, r.next(), 1.6, 2.4, 1.6, 1);
}

function sidewalk(loops: Array<Array<[number, number]>>, block: ArtsBlock): void {
  const s = block.la / 2 + 2.4;
  const t0 = -block.lb * 0.35;
  const t1 = block.lb * 0.35;
  const a = world(block, s, t0, 0);
  const b = world(block, s, t1, 0);
  const c = world(block, s - 1.2, t1, 0);
  const d = world(block, s - 1.2, t0, 0);
  loops.push([[a.x, a.z], [b.x, b.z], [c.x, c.z], [d.x, d.z]]);
}

function dressRiver(layout: CityLayout, block: ArtsBlock, prop: PropFn, r: Rng): void {
  const hit = riverHit(layout, block.cx + block.lb * 0.5, block.cz);
  if (!hit) return;
  // One segment per eastern block. The Stage 1 corridor stays flat; this is a low concrete edge on it.
  const along = Math.atan2(hit.tx, hit.tz);
  const toX = block.cx - hit.qx;
  const toZ = block.cz - hit.qz;
  const len = Math.hypot(toX, toZ) || 1;
  const dx = toX / len;
  const dz = toZ / len;
  const place = (
    x: number, z: number, y: number, template: PropTemplate,
    sx: number, sy: number, sz: number, yaw: number, color: RGB, metal: number, rank: number, pitch = 0,
  ) => {
    propsPush(prop, block, x, z, y, template, sx, sy, sz, yaw, color, metal, rank, pitch);
  };
  place(hit.qx, hit.qz, 0.08, 'quadY', 9, 1, 148, along, [0.035, 0.05, 0.055], 0.92, 0);
  // Steps climb toward the district. Offsets are metres out from the centre line.
  const steps: Array<{ off: number; h: number; color: RGB }> = [
    { off: hit.half - 22, h: 0.4, color: STAIN },
    { off: hit.half - 15, h: 0.9, color: CONC },
    { off: hit.half - 8, h: 1.5, color: [0.30, 0.28, 0.26] },
  ];
  for (const step of steps) {
    place(hit.qx + dx * step.off, hit.qz + dz * step.off, step.h / 2, 'box', 6.4, step.h, 146, along, step.color, 0.18, 0);
  }
  const crest = hit.half - 6;
  place(hit.qx + dx * crest, hit.qz + dz * crest, 1.7, 'quadZ', 140, 1.45, 1, along + Math.PI / 2, STEEL, 0.55, 0);
  place(hit.qx + dx * crest, hit.qz + dz * crest, 2.5, 'box', 140, 0.08, 0.12, along + Math.PI / 2, STEEL, 0.8, 2);
  place(hit.qx + dx * (hit.half + 7), hit.qz + dz * (hit.half + 7), 0.14, 'box', 5.4, 0.2, 140, along, DARK, 0.4, 0);
  for (let i = 0; i < 2; i++) {
    const o = (i === 0 ? -26 : 22) + r.range(-3, 3);
    const px = hit.qx + hit.tx * o + dx * (hit.half - 12);
    const pz = hit.qz + hit.tz * o + dz * (hit.half - 12);
    // Cylinder axis is local Y. Pitch lays it along local −Z; yaw points that axis into the channel.
    place(px, pz, 1.2, 'cyl', 0.72, 4.4, 0.72, Math.atan2(-dx, -dz), RUST, 0.55, 0, Math.PI / 2);
  }
  // East-west street on the north side of the block, from the east curb toward the water.
  const end = world(block, block.la / 2 + block.street / 2, block.lb / 2, 0);
  if (!layout.isReserved(end.x, end.z, 1.5)) {
    const span = Math.min(28, Math.max(14, hit.dist - 8));
    const mx = end.x - dx * span * 0.45;
    const mz = end.z - dz * span * 0.45;
    const yaw = Math.atan2(-dx, -dz);
    place(mx, mz, 2.55, 'box', 7.6, 0.5, span, yaw, RUST, 0.48, 0);
    place(mx, mz, 3.05, 'box', 0.14, 0.65, span, yaw, STEEL, 0.6, 1);
  }
}

function propsPush(
  prop: PropFn, block: ArtsBlock, x: number, z: number, y: number,
  template: PropTemplate, sx: number, sy: number, sz: number, yaw: number,
  color: RGB, metal: number, rank: number, pitch = 0,
): void {
  const t = (x - block.cx) * block.bx + (z - block.cz) * block.bz;
  const s = (x - block.cx) * block.ax + (z - block.cz) * block.az;
  prop(s, t, y, template, sx, sy, sz, yaw, color, NONE, metal, rank, pitch);
}

type Emit = (
  s: number, t: number, lb: number, la: number, h: number, base: number,
  style: StyleId, lit: number, tint: number, detail: 0 | 1 | 2,
) => void;

type PropFn = (
  s: number, t: number, y: number, template: PropTemplate,
  sx: number, sy: number, sz: number, yaw: number,
  color: RGB, emissive: RGB, metal: number, rank: number, pitch?: number,
) => void;

type PuffFn = (
  s: number, t: number, y: number, kind: number, seed: number,
  sx: number, sy: number, sz: number, rank: number,
) => void;
