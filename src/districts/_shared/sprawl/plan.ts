// Pure, worker-safe mid-rise sprawl. Stage 13 (Westside) calls fillSprawlBlock.
// Stage 14 (Basin) and Stage 21 (East LA) can call the same functions.
// Strips, towers, the hub, the east rise and the freeway wall default off.
// Do not route this through the megablock kit: these lots are 10–60 m, not slabs.
import { Rng } from '../../../core/rng';
import { Style, SignColor, type FaceDir, type FabricCtx, type StyleId } from '../../../world/fabric/types';
import type { CityLayout } from '../../../world/layout';
import { phraseSeed } from '../../../world/materials/signPhrases';

/** Matches the global hill swap in fabric/generator.ts. Left alone on purpose. */
const HILL_GROUND = 45;

const PHRASE = [2, 4, 7, 1, 56, 57, 60, 11];

export interface SprawlFace {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** +1 when the district lies on the positive cross of (x0,z0) → (x1,z1). */
  side: 1 | -1;
  band: number;
}

export interface SprawlParams {
  /** District id. Boxes whose centres fall in another district are dropped. */
  id: string;
  /** Floor-to-floor. Omitted keeps 3.4 m, inside the 3.1–3.6 m band. */
  module?: number;
  /** Inclusive storey band for ordinary lots. Omitted keeps 3–10. */
  storeys?: readonly [number, number];
  /** Hard roof cap, metres. Omitted keeps 60. */
  cap?: number;
  /** Lot split. Omitted keeps 18–46 m with a 1.2 m gap. */
  lots?: { min: number; max: number; gap: number };
  /** Window-lit fraction. Omitted keeps a dim amber band. */
  lit?: readonly [number, number];
  /** Albedo multiplier. Omitted keeps a grey field. */
  tint?: readonly [number, number];
  /**
   * Street-line indices (the integer grid index of the centreline, not the block).
   * `a` crosses axis A, `b` crosses axis B. Omitted means no strip markets.
   */
  strips?: { a?: readonly number[]; b?: readonly number[] };
  /**
   * Occasional towers up to the cap. Omitted means every lot stays in `storeys`.
   * `lines` uses the same index space as `strips`. `clusters` are world metres.
   */
  towers?: {
    lines?: { a?: readonly number[]; b?: readonly number[] };
    clusters?: ReadonlyArray<{ x: number; z: number; radius: number }>;
    /** Chance a Wilshire-style line block grows one tower. Omitted keeps 0.16. */
    lineChance?: number;
    /** Chance a cluster block grows one or two towers. Omitted keeps 0.85. */
  };
  /** The block whose cell contains this point becomes the covered yard. Omitted means none. */
  hub?: { x: number; z: number };
  /** Blocks on the district side of this segment, within `band`, may rise toward the cap. */
  rise?: SprawlFace;
  /** Segmented wall where a sidewalk probe hits a reserved corridor. Omitted means off. */
  walls?: boolean;
}

export interface SprawlBlock {
  id: string;
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

export interface SprawlBox {
  s: number;
  t: number;
  lb: number;
  la: number;
  h: number;
  base: number;
  style: StyleId;
  detail: 0 | 1 | 2;
  lit: number;
  tint: number;
}

export interface SprawlSign {
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

export interface SprawlStall {
  s: number;
  t: number;
  face: FaceDir;
}

export interface SprawlPlan {
  hub: boolean;
  strip: boolean;
  edge: boolean;
  tower: boolean;
  stalls: SprawlStall[];
  boxes: SprawlBox[];
  signs: SprawlSign[];
  diner: { s: number; t: number } | null;
  yard: { s: number; t: number } | null;
  roof: { s: number; t: number; h: number } | null;
}

interface Sides { ap: boolean; am: boolean; bp: boolean; bm: boolean }

const EMPTY: SprawlPlan = {
  hub: false, strip: false, edge: false, tower: false,
  stalls: [], boxes: [], signs: [], diner: null, yard: null, roof: null,
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function gridIndex(b: SprawlBlock): { i: number; j: number } {
  const s = b.cx * b.ax + b.cz * b.az;
  const t = b.cx * b.bx + b.cz * b.bz;
  const ba = b.la + b.street;
  const bb = b.lb + b.street;
  return {
    i: Math.floor(s / ba + 1e-4),
    j: Math.floor(t / bb + 1e-4),
  };
}

/** Signed distance on the district side of a face segment. The other side is Infinity. */
export function faceDistance(x: number, z: number, face: SprawlFace): number {
  const dx = face.x1 - face.x0;
  const dz = face.z1 - face.z0;
  const len = Math.hypot(dx, dz) || 1;
  const cross = dx * (z - face.z0) - dz * (x - face.x0);
  const signed = (cross / len) * face.side;
  return signed < 0 ? Infinity : signed;
}

function hasLine(lines: readonly number[] | undefined, index: number): boolean {
  if (!lines) return false;
  for (const line of lines) if (line === index) return true;
  return false;
}

function touches(index: number, lines: readonly number[] | undefined): boolean {
  return hasLine(lines, index) || hasLine(lines, index + 1);
}

function keep(layout: CityLayout, b: SprawlBlock, s: number, t: number, la: number, lb: number): boolean {
  const x = b.cx + b.ax * s + b.bx * t;
  const z = b.cz + b.az * s + b.bz * t;
  if (layout.districtAt(x, z).id !== b.id) return false;
  if (layout.isOcean(x, z)) return false;
  const r = Math.max(la, lb) * 0.5;
  if (layout.isReserved(x, z, r * 0.8)) return false;
  return true;
}

function corridorSides(layout: CityLayout, b: SprawlBlock): Sides {
  const out = b.street * 0.42 + 6;
  const probe = (s: number, t: number) => {
    const x = b.cx + b.ax * s + b.bx * t;
    const z = b.cz + b.az * s + b.bz * t;
    return layout.isReserved(x, z, 2);
  };
  return {
    ap: probe(b.la / 2 + out, 0),
    am: probe(-b.la / 2 - out, 0),
    bp: probe(0, b.lb / 2 + out),
    bm: probe(0, -b.lb / 2 - out),
  };
}

function anySide(s: Sides): boolean {
  return s.ap || s.am || s.bp || s.bm;
}

interface Cap { n: number }

function push(
  boxes: SprawlBox[], layout: CityLayout, b: SprawlBlock, cap: Cap,
  s: number, t: number, lb: number, la: number, h: number,
  o: { base?: number; style: StyleId; detail?: 0 | 1 | 2; lit?: number; tint?: number },
): boolean {
  if (h < 0.08 || lb < 0.35 || la < 0.35) return false;
  const detail = o.detail ?? 0;
  if (detail > 0 && boxes.length >= cap.n) return false;
  if (!keep(layout, b, s, t, la, lb)) return false;
  boxes.push({
    s, t, lb, la, h,
    base: o.base ?? 0,
    style: o.style,
    detail,
    lit: o.lit ?? 0,
    tint: o.tint ?? 0.75,
  });
  return true;
}

function floors(n: number, module: number, cap: number): number {
  const maxF = Math.max(1, Math.floor((cap + 1e-6) / module));
  return clamp(Math.round(n), 1, maxF) * module;
}

function storeyHeight(rng: Rng, lo: number, hi: number, module: number, cap: number): number {
  const maxF = Math.max(1, Math.floor((cap + 1e-6) / module));
  const a = clamp(lo, 1, maxF);
  const b = clamp(hi, a, maxF);
  const u = Math.pow(rng.next(), 1.35);
  const f = a + Math.floor(u * (b - a + 1));
  return clamp(f, a, b) * module;
}

function splitLots(
  rng: Rng, s: number, t: number, la: number, lb: number,
  minLot: number, maxLot: number, out: Array<{ s: number; t: number; la: number; lb: number }>, depth = 0,
): void {
  const big = Math.max(la, lb);
  if (depth > 10 || big <= maxLot || (big < maxLot * 1.6 && rng.chance(0.35))) {
    out.push({ s, t, la, lb });
    return;
  }
  const r = rng.range(0.35, 0.65);
  if (la >= lb) {
    const a1 = la * r;
    if (a1 < minLot || la - a1 < minLot) { out.push({ s, t, la, lb }); return; }
    splitLots(rng, s - la / 2 + a1 / 2, t, a1, lb, minLot, maxLot, out, depth + 1);
    splitLots(rng, s + a1 / 2, t, la - a1, lb, minLot, maxLot, out, depth + 1);
  } else {
    const b1 = lb * r;
    if (b1 < minLot || lb - b1 < minLot) { out.push({ s, t, la, lb }); return; }
    splitLots(rng, s, t - lb / 2 + b1 / 2, la, b1, minLot, maxLot, out, depth + 1);
    splitLots(rng, s, t + b1 / 2, la, lb - b1, minLot, maxLot, out, depth + 1);
  }
}

function signOn(
  signs: SprawlSign[], rng: Rng,
  s: number, t: number, lb: number, la: number, face: FaceDir,
): void {
  const span = face[0] === 'a' ? lb : la;
  const w = clamp(span * 0.42, 1.8, 4.6);
  const h = rng.range(0.9, 1.45);
  const y = rng.range(3.8, 5.1);
  if (y + h / 2 > 6.7) return;
  signs.push({
    s, t, hb: lb / 2, ha: la / 2, face,
    along: rng.range(-Math.max(0.2, span * 0.15), Math.max(0.2, span * 0.15)),
    y, w, h,
    color: rng.pick([SignColor.Amber, SignColor.White, SignColor.Red]),
    kind: 0,
    seed: phraseSeed(PHRASE[rng.int(0, PHRASE.length - 1)]!),
  });
}

function clutter(
  boxes: SprawlBox[], layout: CityLayout, b: SprawlBlock, cap: Cap, rng: Rng,
  s: number, t: number, la: number, lb: number, h: number,
): void {
  const put = (
    ds: number, dt: number, w: number, d: number, ch: number,
    o: { base?: number; style: StyleId; detail?: 0 | 1 | 2; lit?: number; tint?: number },
  ) => push(boxes, layout, b, cap, s + ds, t + dt, w, d, ch, o);
  put(la * 0.22, lb * 0.18, 3.2, 2.4, 2.6, { style: Style.Solid, detail: 2, lit: 0.04, tint: 0.55, base: h });
  put(-la * 0.18, lb * 0.12, 1.5, 1.15, 1.05, { style: Style.Industrial, detail: 2, lit: 0.06, tint: 0.48, base: h });
  put(-la * 0.18, lb * 0.12, 0.45, 0.4, 0.22, {
    style: Style.Glow, detail: 2, lit: 0.16, tint: 1.05, base: h + 0.85,
  });
  if (rng.chance(0.55)) {
    put(la * 0.05, -lb * 0.2, 1.35, 1.05, 0.9, { style: Style.Industrial, detail: 2, lit: 0.05, tint: 0.5, base: h });
  }
  if (rng.chance(0.42) && Math.min(la, lb) > 8) {
    put(-la * 0.08, -lb * 0.08, 2.5, 2.5, 2.15, { style: Style.Industrial, detail: 2, lit: 0.03, tint: 0.42, base: h });
  }
  if (rng.chance(0.38)) {
    put(la * 0.28, -lb * 0.22, 1.05, 0.7, 0.35, { style: Style.Solid, detail: 2, lit: 0.02, tint: 0.6, base: h + 0.7 });
    put(la * 0.28, -lb * 0.22, 0.35, 0.35, 0.7, { style: Style.Solid, detail: 2, lit: 0, tint: 0.45, base: h });
  }
  const room = 66 - h;
  if (room > 3 && rng.chance(h > 40 ? 0.7 : 0.45)) {
    const mh = Math.min(rng.range(4, 11), room - 0.3);
    put(rng.range(-la * 0.15, la * 0.15), rng.range(-lb * 0.15, lb * 0.15), 0.55, 0.55, mh, {
      style: Style.Industrial, detail: 2, lit: 0, tint: 0.4, base: h,
    });
  }
}

function addWalls(boxes: SprawlBox[], layout: CityLayout, b: SprawlBlock, cap: Cap, sides: Sides): void {
  const h = 6.8;
  const run = (along: number, fixedS: number, fixedT: number, alongB: boolean) => {
    const n = Math.max(2, Math.floor(along / 14));
    const len = along / n;
    for (let i = 0; i < n; i++) {
      const u = -along / 2 + (i + 0.5) * len;
      const s = alongB ? fixedS : u;
      const t = alongB ? u : fixedT;
      const lb = alongB ? len * 0.88 : 1.15;
      const la = alongB ? 1.15 : len * 0.88;
      push(boxes, layout, b, cap, s, t, lb, la, h, { style: Style.Solid, detail: 0, lit: 0.02, tint: 0.42 });
      if (i % 2 === 0) {
        push(boxes, layout, b, cap, s, t, 0.5, 0.5, 1.0, { style: Style.Solid, detail: 2, lit: 0, tint: 0.36, base: h });
        push(boxes, layout, b, cap, s, t, 0.65, 0.35, 0.18, {
          style: Style.Glow, detail: 1, lit: 0.8, tint: 1.05, base: h + 0.92,
        });
      }
    }
  };
  if (sides.ap) run(b.lb * 0.84, b.la / 2 - 5, 0, true);
  if (sides.am) run(b.lb * 0.84, -b.la / 2 + 5, 0, true);
  if (sides.bp) run(b.la * 0.84, 0, b.lb / 2 - 5, false);
  if (sides.bm) run(b.la * 0.84, 0, -b.lb / 2 + 5, false);
  const step = 10.2;
  if (sides.am) push(boxes, layout, b, cap, -b.la / 2 + 12, 0, b.lb * 0.48, 7, step, { style: Style.Sprawl, detail: 0, lit: 0.14, tint: 0.66 });
  if (sides.ap) push(boxes, layout, b, cap, b.la / 2 - 12, 0, b.lb * 0.48, 7, step, { style: Style.Sprawl, detail: 0, lit: 0.14, tint: 0.66 });
  if (sides.bm) push(boxes, layout, b, cap, 0, -b.lb / 2 + 11, 7, b.la * 0.4, step, { style: Style.Sprawl, detail: 0, lit: 0.14, tint: 0.66 });
  if (sides.bp) push(boxes, layout, b, cap, 0, b.lb / 2 - 11, 7, b.la * 0.4, step, { style: Style.Sprawl, detail: 0, lit: 0.14, tint: 0.66 });
}

function bollards(
  boxes: SprawlBox[], layout: CityLayout, b: SprawlBlock, cap: Cap, face: FaceDir,
): void {
  const along = face[0] === 'a' ? b.lb : b.la;
  const n = Math.max(2, Math.floor(along / 24));
  const len = along / n;
  const out = 3.3;
  for (let i = 0; i < n; i++) {
    const u = -along / 2 + (i + 0.5) * len;
    let s = 0;
    let t = 0;
    if (face === 'a+') { s = b.la / 2 + out; t = u; }
    else if (face === 'a-') { s = -b.la / 2 - out; t = u; }
    else if (face === 'b+') { t = b.lb / 2 + out; s = u; }
    else { t = -b.lb / 2 - out; s = u; }
    push(boxes, layout, b, cap, s, t, 0.32, 0.32, 0.82, { style: Style.Solid, detail: 2, lit: 0, tint: 0.34 });
  }
}

function stallsAlong(
  boxes: SprawlBox[], stalls: SprawlStall[], layout: CityLayout, b: SprawlBlock, cap: Cap,
  face: FaceDir, span: number, at: number,
): void {
  const n = clamp(Math.floor(span / 11), 1, 3);
  for (let i = 0; i < n; i++) {
    const u = (i - (n - 1) / 2) * Math.min(9, span * 0.7);
    let s = 0;
    let t = 0;
    const out = 1.35;
    if (face === 'a+') { s = at + out; t = u; }
    else if (face === 'a-') { s = at - out; t = u; }
    else if (face === 'b+') { t = at + out; s = u; }
    else { t = at - out; s = u; }
    const alongB = face[0] === 'a';
    const lb = alongB ? 2.3 : 1.5;
    const la = alongB ? 1.5 : 2.3;
    if (!push(boxes, layout, b, cap, s, t, lb, la, 1.05, {
      style: Style.Market, detail: 1, lit: 0.35, tint: 0.7,
    })) continue;
    stalls.push({ s, t, face });
  }
}

function addHub(
  boxes: SprawlBox[], signs: SprawlSign[], stalls: SprawlStall[],
  layout: CityLayout, b: SprawlBlock, cap: Cap, rng: Rng,
): { diner: { s: number; t: number }; yard: { s: number; t: number } } {
  const doorS = b.la / 2 - 26;
  const door = { s: doorS, t: 0 };
  const yard = { s: 6, t: 0 };
  const put = (
    s: number, t: number, lb: number, la: number, h: number,
    o: { base?: number; style: StyleId; detail?: 0 | 1 | 2; lit?: number; tint?: number },
  ) => push(boxes, layout, b, cap, s, t, lb, la, h, o);

  put(doorS + 5, -13, 21, 12, 6.8, { style: Style.Sprawl, detail: 0, lit: 0.22, tint: 0.68 });
  put(doorS + 5, 13, 21, 12, 6.8, { style: Style.Sprawl, detail: 0, lit: 0.2, tint: 0.66 });
  put(doorS + 8.7, 0, 5.2, 0.7, 6.8, { style: Style.Solid, detail: 0, lit: 0.04, tint: 0.5 });
  put(-b.la / 2 + 12, 0, b.lb * 0.7, 9, 6.8, { style: Style.Sprawl, detail: 0, lit: 0.18, tint: 0.64 });
  put(0, b.lb / 2 - 8, 7, b.la * 0.38, 6.8, { style: Style.Market, detail: 0, lit: 0.28, tint: 0.72 });
  put(0, -b.lb / 2 + 8, 7, b.la * 0.38, 6.8, { style: Style.Market, detail: 0, lit: 0.26, tint: 0.7 });

  for (const ds of [-10, 10]) for (const dt of [-8, 8]) {
    put(yard.s + ds, yard.t + dt, 0.55, 0.55, 4.4, { style: Style.Solid, detail: 1, lit: 0, tint: 0.4 });
  }
  put(yard.s, yard.t, 18, 24, 0.28, { style: Style.Solid, detail: 1, lit: 0.05, tint: 0.48, base: 4.4 });

  for (let i = 0; i < 4; i++) {
    const t = -16 + i * 10;
    if (Math.abs(t) < 4) continue;
    put(-28, t, 4.2, 3.6, 3.4, { style: Style.Industrial, detail: 1, lit: 0.04, tint: 0.46 });
  }
  for (let i = 0; i < 4; i++) {
    const t = -18 + i * 12;
    put(yard.s - 6, t, 2.2, 1.6, 1.05, { style: Style.Market, detail: 1, lit: 0.32, tint: 0.7 });
    stalls.push({ s: yard.s - 6, t, face: 'a-' });
  }
  put(door.s, -1.2, 0.48, 0.6, 2.7, { style: Style.Solid, detail: 0, lit: 0.05, tint: 0.5 });
  put(door.s, 1.2, 0.48, 0.6, 2.7, { style: Style.Solid, detail: 0, lit: 0.05, tint: 0.5 });
  put(door.s, 0, 2.9, 0.45, 0.35, { style: Style.Solid, detail: 1, lit: 0.08, tint: 0.55, base: 2.45 });
  signOn(signs, rng, door.s, 0, 2.9, 0.7, 'a-');
  signOn(signs, rng, yard.s - 6, 0, 2.2, 1.6, 'a-');
  clutter(boxes, layout, b, cap, rng, -b.la / 2 + 12, 0, 8, 12, 6.8);
  clutter(boxes, layout, b, cap, rng, doorS + 5, -13, 10, 12, 6.8);
  return { diner: door, yard };
}

function faceList(i: number, j: number, strips: SprawlParams['strips']): FaceDir[] {
  const faces: FaceDir[] = [];
  if (hasLine(strips?.a, i)) faces.push('a-');
  if (hasLine(strips?.a, i + 1)) faces.push('a+');
  if (hasLine(strips?.b, j)) faces.push('b-');
  if (hasLine(strips?.b, j + 1)) faces.push('b+');
  return faces;
}

function lotFaces(b: SprawlBlock, lot: { s: number; t: number; la: number; lb: number }, faces: FaceDir[]): FaceDir[] {
  const out: FaceDir[] = [];
  const near = 8;
  for (const f of faces) {
    if (f === 'a-' && lot.s - lot.la / 2 <= -b.la / 2 + near) out.push(f);
    else if (f === 'a+' && lot.s + lot.la / 2 >= b.la / 2 - near) out.push(f);
    else if (f === 'b-' && lot.t - lot.lb / 2 <= -b.lb / 2 + near) out.push(f);
    else if (f === 'b+' && lot.t + lot.lb / 2 >= b.lb / 2 - near) out.push(f);
  }
  return out;
}

function closedFace(sides: Sides, face: FaceDir): boolean {
  if (face === 'a+') return sides.ap;
  if (face === 'a-') return sides.am;
  if (face === 'b+') return sides.bp;
  return sides.bm;
}

export function planSprawl(block: SprawlBlock, params: SprawlParams, layout: CityLayout): SprawlPlan {
  if (block.ground > HILL_GROUND) return EMPTY;
  const module = params.module ?? 3.4;
  const capH = params.cap ?? 60;
  const storeys = params.storeys ?? [3, 10];
  const lotSpec = params.lots ?? { min: 18, max: 46, gap: 1.2 };
  const litR = params.lit ?? [0.16, 0.36];
  const tintR = params.tint ?? [0.58, 0.82];
  const rng = new Rng(block.seed);
  const { i, j } = gridIndex(block);
  const boxes: SprawlBox[] = [];
  const signs: SprawlSign[] = [];
  const stalls: SprawlStall[] = [];
  const cap: Cap = { n: 150 };
  const plan: SprawlPlan = {
    hub: false, strip: false, edge: false, tower: false,
    stalls, boxes, signs, diner: null, yard: null, roof: null,
  };
  const remember = (s: number, t: number, h: number) => {
    if (!plan.roof || h > plan.roof.h) plan.roof = { s, t, h };
    if (h >= 13 * module) plan.tower = true;
  };

  const hubCell = params.hub
    ? gridIndex({
      ...block,
      cx: params.hub.x,
      cz: params.hub.z,
    })
    : null;
  const isHub = !!hubCell && hubCell.i === i && hubCell.j === j;
  if (isHub && block.la >= 70 && block.lb >= 48) {
    plan.hub = true;
    const built = addHub(boxes, signs, stalls, layout, block, cap, rng);
    plan.diner = built.diner;
    plan.yard = built.yard;
    plan.roof = { s: built.diner.s + 5, t: -13, h: 6.8 };
    const sides = params.walls ? corridorSides(layout, block) : null;
    if (sides && anySide(sides)) {
      plan.edge = true;
      addWalls(boxes, layout, block, cap, sides);
    }
    return plan;
  }

  const sides = params.walls ? corridorSides(layout, block) : { ap: false, am: false, bp: false, bm: false };
  plan.edge = anySide(sides);
  if (plan.edge) addWalls(boxes, layout, block, cap, sides);

  const faces = faceList(i, j, params.strips).filter((f) => !closedFace(sides, f));
  plan.strip = faces.length > 0;
  for (const f of faces) bollards(boxes, layout, block, cap, f);

  let s0 = -block.la / 2;
  let s1 = block.la / 2;
  let t0 = -block.lb / 2;
  let t1 = block.lb / 2;
  const inset = 18;
  if (sides.am) s0 += inset;
  if (sides.ap) s1 -= inset;
  if (sides.bm) t0 += inset;
  if (sides.bp) t1 -= inset;
  const la = s1 - s0;
  const lb = t1 - t0;
  if (la < 14 || lb < 12) return plan;

  const riseDist = params.rise ? faceDistance(block.cx, block.cz, params.rise) : Infinity;
  let hi = storeys[1];
  if (riseDist < (params.rise?.band ?? Infinity)) {
    const extra = Math.round((1 - riseDist / params.rise!.band) * 5);
    hi = Math.min(Math.floor((capH + 1e-6) / module), storeys[1] + extra);
  }

  const inCluster = !!params.towers?.clusters?.some((c) => Math.hypot(block.cx - c.x, block.cz - c.z) < c.radius);
  const onLine = touches(i, params.towers?.lines?.a) || touches(j, params.towers?.lines?.b);
  let towersLeft = 0;
  if (!plan.edge && inCluster) towersLeft = rng.chance(0.85) ? rng.int(1, 2) : 0;
  else if (!plan.edge && onLine) towersLeft = rng.chance(params.towers?.lineChance ?? 0.16) ? 1 : 0;

  const lots: Array<{ s: number; t: number; la: number; lb: number }> = [];
  splitLots(rng, (s0 + s1) / 2, (t0 + t1) / 2, la, lb, lotSpec.min, lotSpec.max, lots);
  const gap = lotSpec.gap;
  for (const lot of lots) {
    lot.la = Math.max(8, lot.la - gap);
    lot.lb = Math.max(8, lot.lb - gap);
    const mine = lotFaces(block, lot, faces);
    let ms = lot.s;
    let mt = lot.t;
    let mla = lot.la;
    let mlb = lot.lb;
    const lit = rng.range(litR[0], litR[1]);
    const tint = rng.range(tintR[0], tintR[1]);
    for (const face of mine) {
      const depth = 4.2;
      let ps = ms;
      let pt = mt;
      let pla = mla;
      let plb = mlb;
      let edgeAt = 0;
      if (face === 'a+') { ps = ms + mla / 2 - depth / 2; pla = depth; edgeAt = ps + depth / 2; }
      else if (face === 'a-') { ps = ms - mla / 2 + depth / 2; pla = depth; edgeAt = ps - depth / 2; }
      else if (face === 'b+') { pt = mt + mlb / 2 - depth / 2; plb = depth; edgeAt = pt + depth / 2; }
      else { pt = mt - mlb / 2 + depth / 2; plb = depth; edgeAt = pt - depth / 2; }
      const ph = floors(1, module, capH);
      if (push(boxes, layout, block, cap, ps, pt, plb, pla, ph, {
        style: Style.Market, detail: 0, lit: rng.range(0.42, 0.68), tint: rng.range(0.72, 0.95),
      })) {
        signOn(signs, rng, ps, pt, plb, pla, face);
        stallsAlong(boxes, stalls, layout, block, cap, face, face[0] === 'a' ? plb : pla, edgeAt);
      }
      if (face === 'a+' || face === 'a-') { mla = Math.max(6, mla - depth * 0.75); ms += face === 'a+' ? -depth * 0.28 : depth * 0.28; }
      else { mlb = Math.max(6, mlb - depth * 0.75); mt += face === 'b+' ? -depth * 0.28 : depth * 0.28; }
    }
    if (mla < 6 || mlb < 6) continue;
    const wantTower = towersLeft > 0 && rng.chance(0.55) && Math.min(mla, mlb) > 10;
    const h = wantTower
      ? floors(rng.int(13, Math.floor((capH + 1e-6) / module)), module, capH)
      : storeyHeight(rng, storeys[0], hi, module, capH);
    if (!push(boxes, layout, block, cap, ms, mt, mlb, mla, h, {
      style: Style.Sprawl, detail: 0, lit: wantTower ? Math.min(0.5, lit + 0.08) : lit, tint,
    })) continue;
    if (wantTower) towersLeft -= 1;
    remember(ms, mt, h);
    clutter(boxes, layout, block, cap, rng, ms, mt, mla * 0.8, mlb * 0.8, h);
  }
  return plan;
}

export function fillSprawlBlock(ctx: FabricCtx, params: SprawlParams): void {
  const b = ctx.block;
  const block: SprawlBlock = {
    id: params.id,
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: b.bx, bz: b.bz,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
  const plan = planSprawl(block, params, ctx.layout);
  for (const box of plan.boxes) {
    ctx.box(box.s, box.t, box.lb, box.la, box.h, {
      style: box.style,
      lit: box.lit,
      tint: box.tint,
      detail: box.detail,
      base: box.base > 0.01 ? box.base : undefined,
    });
  }
  for (const s of plan.signs) {
    ctx.sign(s.s, s.t, s.hb, s.ha, s.face, s.along, s.y, s.w, s.h, s.color, s.kind, s.seed);
  }
}
