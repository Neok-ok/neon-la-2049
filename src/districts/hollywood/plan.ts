// Pure block plan. The worker and the main thread both call this.
// Heritage fronts are the shared kit. Heights are whole floors of 4.4 m.
import { hash2i, Rng } from '../../core/rng';
import { Style, SignColor, type FaceDir, type StyleId } from '../../world/fabric/types';
import { phraseSeed } from '../../world/materials/signPhrases';
import {
  buildHeritage, faceSize, projectFace,
  type HeritageCrown, type HeritageFamily, type HeritagePlan,
} from '../_shared/heritage/build';
import {
  BLOCK_A, FLOOR, LOBBY_I, LOBBY_J, SIGN_CLEAR_J0, SIGN_CLEAR_J1, STRIP_LINE, stripFace,
} from './spec';

export interface HwBlock {
  i: number;
  j: number;
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

export interface HwBox {
  s: number;
  t: number;
  lb: number;
  la: number;
  h: number;
  style: StyleId;
  lit: number;
  tint: number;
  detail: 0 | 1 | 2;
  base: number;
}

export interface HwSign {
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

export interface HwProp {
  template: 'box' | 'cyl';
  x: number;
  y: number;
  z: number;
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
  color: [number, number, number];
  emissive: [number, number, number];
  metal: number;
  rank: number;
  pass?: 'opaque' | 'add';
}

export interface HwPool {
  x: number;
  y: number;
  z: number;
  yaw: number;
  wid: number;
  len: number;
  rgb: [number, number, number];
  intensity: number;
  rank: number;
}

export interface HwPlan {
  boxes: HwBox[];
  signs: HwSign[];
  props: HwProp[];
  pools: HwPool[];
  loops: Array<Array<[number, number]>>;
}

const FAMILIES: HeritageFamily[] = ['deco', 'marquee', 'beaux', 'roman', 'deco', 'marquee'];
const CROWNS: HeritageCrown[] = ['steps', 'pediment', 'none', 'steps', 'clock'];
const BLADE_COLORS = [SignColor.Pink, SignColor.Violet, SignColor.Yellow, SignColor.Amber, SignColor.Cyan];
const BLADE_PHRASES = [2, 4, 48, 51, 53, 58, 62, 39];

const DOOR_HALF_T = 2.7;
const DOOR_DEPTH = 16;

function empty(): HwPlan {
  return { boxes: [], signs: [], props: [], pools: [], loops: [] };
}

function floorsOf(i: number, j: number, salt: number, choices: readonly number[]): number {
  return choices[hash2i(i, j, salt) % choices.length]!;
}

function isLobby(b: HwBlock): boolean {
  return b.i === LOBBY_I && b.j === LOBBY_J;
}

function signClear(j: number): boolean {
  return j >= SIGN_CLEAR_J0 && j <= SIGN_CLEAR_J1;
}

/** Door slot on the lobby's south face. Heritage and the podium stay out of it. */
function hitsDoor(b: HwBlock, s: number, t: number, lb: number, la: number): boolean {
  if (!isLobby(b)) return false;
  const s0 = s - la / 2;
  const s1 = s + la / 2;
  const t0 = t - lb / 2;
  const t1 = t + lb / 2;
  const edge = -b.la / 2;
  return s1 > edge - 1 && s0 < edge + DOOR_DEPTH && t1 > -DOOR_HALF_T && t0 < DOOR_HALF_T;
}

function emitPlan(b: HwBlock, face: FaceDir, centerS: number, centerT: number, plane: number, plan: HeritagePlan, out: HwPlan): void {
  const built = buildHeritage(plan);
  for (const p of built.pieces) {
    const size = faceSize(face, p.w, p.d);
    const pos = projectFace(face, centerS, centerT, plane, p.x, p.z);
    if (hitsDoor(b, pos.s, pos.t, size.lb, size.la)) continue;
    out.boxes.push({
      s: pos.s, t: pos.t, lb: size.lb, la: size.la, h: p.h,
      style: p.style as StyleId, lit: p.lit, tint: p.tint, detail: p.detail, base: p.y - p.h / 2,
    });
  }
  for (const s of built.signs) {
    const anchor = projectFace(face, centerS, centerT, plane, s.x, 0);
    const ss = face === 'a+' || face === 'a-' ? plane : anchor.s;
    const tt = face === 'a+' || face === 'a-' ? anchor.t : plane;
    out.signs.push({
      s: ss, t: tt, hb: 0, ha: 0, face, along: 0, y: s.y, w: s.w, h: s.h,
      color: s.color, kind: s.kind, seed: phraseSeed(s.phrase),
    });
  }
}

function pushBox(out: HwPlan, b: HwBlock, s: number, t: number, lb: number, la: number, h: number, style: StyleId, lit: number, tint: number, detail: 0 | 1 | 2, base: number): void {
  if (hitsDoor(b, s, t, lb, la)) return;
  out.boxes.push({ s, t, lb, la, h, style, lit, tint, detail, base });
}

function blade(out: HwPlan, face: FaceDir, s: number, t: number, y: number, w: number, h: number, phrase: number, color: number): void {
  out.signs.push({
    s, t, hb: 0, ha: 0, face, along: 0, y, w, h, color, kind: 1, seed: phraseSeed(phrase),
  });
}

function heritageBay(
  b: HwBlock, face: FaceDir, center: number, width: number, r: Rng, billed: { on: boolean }, out: HwPlan,
): void {
  const along: 's' | 't' = face === 'a+' || face === 'a-' ? 't' : 's';
  const plane = face === 'a+' ? b.la / 2 : face === 'a-' ? -b.la / 2 : face === 'b+' ? b.lb / 2 : -b.lb / 2;
  const roofFloors = floorsOf(b.i, b.j, Math.round(center * 10) + 3, [8, 10, 12, 14, 16]);
  const height = roofFloors * FLOOR;
  const frontFloors = Math.max(6, roofFloors - (roofFloors > 12 ? 4 : 2));
  const frontH = frontFloors * FLOOR;
  const family = r.pick(FAMILIES);
  const billboard = !billed.on && height > 52 && width > 18 && r.chance(0.14);
  if (billboard) billed.on = true;
  const centerS = along === 's' ? center : 0;
  const centerT = along === 't' ? center : 0;
  emitPlan(b, face, centerS, centerT, plane, {
    seed: r.next(),
    width,
    depth: Math.min(15, b.la * 0.22),
    frontH: Math.min(frontH, height - 8),
    height,
    family,
    wrap: r.range(0.22, 0.62),
    marquee: true,
    door: r.range(3.6, 5.2),
    crown: family === 'deco' ? 'steps' : r.pick(CROWNS),
    blades: r.int(4, 6),
    billboard,
    lit: r.range(0.38, 0.58),
    tint: family === 'deco' ? 1.08 : 0.92,
    compact: true,
  }, out);
}

function towerBehind(b: HwBlock, face: FaceDir, out: HwPlan): void {
  const n = floorsOf(b.i, b.j, 9, [20, 22, 24, 26]);
  const top = n * FLOOR;
  const podium = 4 * FLOOR;
  const shaft = top - podium;
  const inward = face === 'a-' ? 16 : face === 'a+' ? -16 : 0;
  pushBox(out, b, inward, 0, 46, 36, podium, Style.Neon, 0.62, 1.05, 0, 0);
  pushBox(out, b, inward, 0, 22, 18, shaft, Style.Ribbon, 0.58, 0.95, 0, podium);
  pushBox(out, b, inward, 0, 26, 22, 0.45, Style.Glow, 0.85, 1.45, 1, top - 0.45);
  pushBox(out, b, inward, 0, 0.5, 0.5, FLOOR, Style.Glow, 0.4, 1.2, 2, top);
  const plane = face === 'a-' ? -b.la / 2 : b.la / 2;
  const phrase = BLADE_PHRASES[hash2i(b.i, b.j, 4) % BLADE_PHRASES.length]!;
  const color = BLADE_COLORS[hash2i(b.i, b.j, 5) % BLADE_COLORS.length]!;
  blade(out, face, plane, 8, podium + 18, 1.7, 14, phrase, color);
  blade(out, face, plane, -7, podium + 36, 1.5, 16, BLADE_PHRASES[(phrase + 3) % BLADE_PHRASES.length]!, BLADE_COLORS[(color + 2) % BLADE_COLORS.length]!);
}

function podiumBehind(b: HwBlock, face: FaceDir, out: HwPlan): void {
  const h = 4 * FLOOR;
  const inward = face === 'a-' ? 8 : -8;
  if (isLobby(b)) {
    pushBox(out, b, inward + 4, -20, 28, 72, h, Style.Neon, 0.55, 1.02, 0, 0);
    pushBox(out, b, inward + 4, 20, 28, 72, h, Style.Neon, 0.55, 1.02, 0, 0);
    return;
  }
  pushBox(out, b, inward, 0, 50, 96, h, Style.Neon, 0.5, 0.98, 0, 0);
  pushBox(out, b, inward, 0, 48, 0.4, 0.35, Style.Glow, 0.9, 1.55, 1, 3.5);
}

function lobbyMouth(b: HwBlock, out: HwPlan): void {
  const edge = -b.la / 2;
  const pierT = DOOR_HALF_T + 0.55;
  pushBox(out, b, edge + 0.45, -pierT, 0.7, 1.1, 4.4, Style.Deco, 0.35, 1.05, 0, 0);
  pushBox(out, b, edge + 0.45, pierT, 0.7, 1.1, 4.4, Style.Deco, 0.35, 1.05, 0, 0);
  pushBox(out, b, edge + 1.6, 0, DOOR_HALF_T * 2 + 1.4, 3.2, 0.32, Style.Glow, 0.92, 1.5, 1, 3.55);
  out.signs.push({
    s: edge, t: 0, hb: 0, ha: 0, face: 'a-', along: 0, y: 4.7,
    w: 4.2, h: 0.9, color: SignColor.Yellow, kind: 0, seed: phraseSeed(2),
  });
}

function planStrip(b: HwBlock, face: FaceDir, out: HwPlan): void {
  const r = new Rng(b.seed);
  const billed = { on: false };
  const span = face === 'a+' || face === 'a-' ? b.lb : b.la;
  if (isLobby(b) && face === 'a-') {
    heritageBay(b, face, -18, 22, r, billed, out);
    heritageBay(b, face, 18, 22, r, billed, out);
    lobbyMouth(b, out);
  } else if (span > 48) {
    const w = Math.min(28, (span - 8) / 2);
    heritageBay(b, face, -w / 2 - 1.4, w, r, billed, out);
    heritageBay(b, face, w / 2 + 1.4, w, r, billed, out);
  } else {
    heritageBay(b, face, 0, Math.min(36, span - 4), r, billed, out);
  }
  const tower = !isLobby(b) && !signClear(b.j) && hash2i(b.i, b.j, 16) % 6 === 0;
  if (tower) towerBehind(b, face, out);
  else podiumBehind(b, face, out);
}

function planFiller(b: HwBlock, out: HwPlan): void {
  const north = b.i > STRIP_LINE;
  const choices = north ? [5, 6, 7] : [5, 6, 7, 8, 9];
  const h = floorsOf(b.i, b.j, 2, choices) * FLOOR;
  const face: FaceDir = b.i < STRIP_LINE ? 'a+' : 'a-';
  pushBox(out, b, 0, 0, b.lb * 0.78, b.la * 0.72, h, north ? Style.Panel : Style.Neon, north ? 0.28 : 0.42, 0.9, 0, 0);
  pushBox(out, b, 0, 0, b.lb * 0.7, 0.35, 0.28, Style.Glow, 0.7, north ? 1.1 : 1.4, 1, 3.3);
  if (!north && hash2i(b.i, b.j, 11) % 11 === 0) {
    const top = floorsOf(b.i, b.j, 12, [18, 20, 22]) * FLOOR;
    pushBox(out, b, 6, 4, 16, 14, top - h, Style.Ribbon, 0.5, 0.92, 0, h);
  }
  const phrase = BLADE_PHRASES[hash2i(b.i, b.j, 6) % BLADE_PHRASES.length]!;
  const color = BLADE_COLORS[hash2i(b.i, b.j, 7) % BLADE_COLORS.length]!;
  blade(out, face, face === 'a+' ? b.la / 2 : -b.la / 2, 0, Math.min(h - 4, 18), 1.5, 9, phrase, color);
}

function world(b: HwBlock, s: number, t: number): { x: number; z: number } {
  return { x: b.cx + b.ax * s + b.bx * t, z: b.cz + b.az * s + b.bz * t };
}

function dressStrip(b: HwBlock, face: FaceDir, out: HwPlan): void {
  const streetZ = -STRIP_LINE * BLOCK_A;
  const north = face === 'a-';
  const curbZ = north ? streetZ - 8.2 : streetZ + 8.2;
  const yaw = north ? 0 : Math.PI;
  const n = 4;
  for (let k = 0; k < n; k++) {
    const t = -b.lb / 2 + 6 + k * ((b.lb - 12) / Math.max(1, n - 1));
    if (isLobby(b) && Math.abs(t) < DOOR_HALF_T + 1.2) continue;
    const p = world(b, 0, t);
    out.props.push({
      template: 'cyl', x: p.x, y: b.ground + 0.55, z: curbZ, yaw, sx: 0.28, sy: 1.1, sz: 0.28,
      color: [0.12, 0.1, 0.14], emissive: [0.45, 0.1, 0.32], metal: 0.2, rank: 1,
    });
  }
  if (!north) return;
  const mid = world(b, 0, 0);
  out.pools.push({
    x: mid.x, y: b.ground + 0.04, z: streetZ, yaw: 0,
    wid: 9, len: Math.min(26, b.lb * 0.38),
    rgb: [0.72, 0.18, 0.55], intensity: 0.85, rank: 1,
  });
  const x0 = b.cx - b.lb / 2 + 3;
  const x1 = b.cx + b.lb / 2 - 3;
  const zN = streetZ - 8.2;
  const zS = streetZ + 8.2;
  out.loops.push([[x0, zN], [x1, zN], [x1, zN + 0.5], [x0, zN + 0.5]]);
  out.loops.push([[x0, zS], [x1, zS], [x1, zS - 0.5], [x0, zS - 0.5]]);
}

function hillLights(b: HwBlock, out: HwPlan): void {
  if (hash2i(b.i, b.j, 21) % 3 !== 0) return;
  const p = world(b, 0, 0);
  out.props.push({
    template: 'box', x: p.x, y: b.ground + 1.2, z: p.z, yaw: 0,
    sx: 0.55, sy: 2.4, sz: 0.55,
    color: [0.2, 0.16, 0.1], emissive: [0.85, 0.55, 0.18], metal: 0, rank: 0, pass: 'add',
  });
}

/** Fabric, signs, curb props, pools, crowd loops. Empty of buildings above 45 m. */
export function planHollywood(b: HwBlock): HwPlan {
  const out = empty();
  if (b.ground > 45) {
    hillLights(b, out);
    return out;
  }
  const face = stripFace(b.i);
  if (face) {
    planStrip(b, face, out);
    dressStrip(b, face, out);
  } else {
    planFiller(b, out);
  }
  return out;
}
