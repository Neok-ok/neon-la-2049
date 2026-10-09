// Pure, worker-safe residential blocks. Stage 11 (Lakewood) and Stage 12 (South LA)
// both call fillResidentialBlock. Do not fork buildMegablock and do not add a façade shader.
//
// One block, one family, on the district's own grid. Heights snap to `module` (3.1–3.6 m).
// The kit frame is kit +Z = block +A, kit +X = block −B. RecordSink uses that same map.
import { Rng, hash2i } from '../../../core/rng';
import { Style, SignColor, type FaceDir, type FabricCtx, type StyleId } from '../../../world/fabric/types';
import type { CityLayout } from '../../../world/layout';
import { phraseSeed } from '../../../world/materials/signPhrases';
import { buildMegablock, type FacadeFamily, type MegablockForm } from '../megablock/build';
import type { FaceStyle, KitDetail, MassSink } from '../megatower/sink';

export type ResidentialFamily = 'bar' | 'podium' | 'courtyard' | 'stepped' | 'walkup';

export interface ResidentialWeights {
  bar: number;
  podium: number;
  courtyard: number;
  stepped: number;
  walkup: number;
}

export interface ResidentialParams {
  /** Floor-to-floor. Lakewood uses 3.4, inside the 3.1–3.6 m band. */
  module: number;
  /** Main slab band, metres. Infill walk-ups may sit below the low end. */
  height: readonly [number, number];
  residential: readonly [number, number];
  lit: readonly [number, number];
  tint: readonly [number, number];
  weights: ResidentialWeights;
  /** One corner market when hash % marketEvery === 0. 8 is one block in eight. */
  marketEvery: number;
  /**
   * The block whose cell contains this point becomes the covered market hub.
   * Pass the same point Stage 12 wants, or omit it.
   */
  hub?: { x: number; z: number };
  /**
   * Blocks inside `radius` of this point use the seam mix (bar / podium only,
   * lower lit). Lakewood passes K's tower so the two districts read as one sector.
   */
  seam?: { x: number; z: number; radius: number };
  seamLit?: readonly [number, number];
}

export interface ResBlock {
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
  /** Terrain at the block centre. Dress and cameras add this; fabric boxes are already absolute. */
  ground: number;
}

export interface PlannedBox {
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

export interface PlannedSign {
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

export interface LookPoint {
  s: number;
  t: number;
  ns: number;
  nt: number;
  y: number;
}

export interface StallMark {
  s: number;
  t: number;
  /** Yaw hint: 0 faces +A, 1 faces +B. Dress uses it for awnings. */
  face: 0 | 1 | 2 | 3;
}

export interface ResidentialPlan {
  family: ResidentialFamily;
  height: number;
  hub: boolean;
  edge: boolean;
  seam: boolean;
  court: { s: number; t: number } | null;
  entry: { s: number; t: number } | null;
  laundry: LookPoint | null;
  shop: { s: number; t: number } | null;
  stalls: StallMark[];
  boxes: PlannedBox[];
  signs: PlannedSign[];
}

const PHRASE = [2, 56, 60, 37, 7, 4, 57];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function gridIndex(b: ResBlock): { i: number; j: number } {
  const s = b.cx * b.ax + b.cz * b.az;
  const t = b.cx * b.bx + b.cz * b.bz;
  const ba = b.la + b.street;
  const bb = b.lb + b.street;
  return {
    i: Math.floor(s / ba + 1e-4),
    j: Math.floor(t / bb + 1e-4),
  };
}

function snap(raw: number, module: number, lo: number, hi: number): number {
  const s = Math.round(raw / module) * module;
  const a = Math.ceil((lo - 1e-6) / module) * module;
  const b = Math.floor((hi + 1e-6) / module) * module;
  return clamp(s, Math.min(a, b), Math.max(a, b));
}

class RecordSink implements MassSink {
  readonly maxDetail = 2;
  readonly full = false;
  readonly boxes: PlannedBox[] = [];

  constructor(private s0: number, private t0: number) {}

  frustum(
    lx: number, lz: number, y0: number, w0: number, d0: number, w1: number, d1: number,
    h: number, st: FaceStyle, detail: KitDetail, _cap = true, rot = 0,
  ): void {
    if (detail > 2 || rot !== 0 || h <= 0.05) return;
    const w = (w0 + w1) / 2;
    const d = (d0 + d1) / 2;
    if (w < 0.6 || d < 0.6) return;
    this.boxes.push({
      s: this.s0 + lz,
      t: this.t0 - lx,
      lb: w,
      la: d,
      h,
      base: y0,
      style: st.style,
      detail: detail as 0 | 1 | 2,
      lit: st.lit,
      tint: st.tint,
    });
  }
}

function emitMass(
  boxes: PlannedBox[], s: number, t: number, lb: number, la: number, height: number,
  form: MegablockForm, family: FacadeFamily, lit: number, tint: number, residential: number, seed: number,
): void {
  const sink = new RecordSink(s, t);
  buildMegablock({
    seed, height, w: Math.max(8, lb), d: Math.max(8, la),
    form, family, lit, tint, residential,
    compact: true, walkways: false, holo: 0,
  }, sink);
  for (const b of sink.boxes) boxes.push(b);
}

function push(
  boxes: PlannedBox[], s: number, t: number, lb: number, la: number, h: number,
  o: { base?: number; style: number; detail?: 0 | 1 | 2; lit?: number; tint?: number },
): void {
  if (h < 0.08 || lb < 0.55 || la < 0.55) return;
  boxes.push({
    s, t, lb, la, h,
    base: o.base ?? 0,
    style: o.style,
    detail: o.detail ?? 0,
    lit: o.lit ?? 0,
    tint: o.tint ?? 0.8,
  });
}

function signAt(
  signs: PlannedSign[], rng: Rng, s: number, t: number, hb: number, ha: number,
  face: FaceDir, y: number, w: number, h: number, color: number,
): void {
  const yy = clamp(y, 2.8, 6.6);
  signs.push({
    s, t, hb, ha, face,
    along: rng.range(-4, 4),
    y: yy, w, h, color, kind: 0,
    seed: phraseSeed(PHRASE[rng.int(0, PHRASE.length - 1)]!),
  });
}

interface Sides { ap: boolean; am: boolean; bp: boolean; bm: boolean }

function corridorSides(layout: CityLayout, b: ResBlock): Sides {
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

function keepBox(layout: CityLayout, b: ResBlock, box: PlannedBox): boolean {
  const x = b.cx + b.ax * box.s + b.bx * box.t;
  const z = b.cz + b.az * box.s + b.bz * box.t;
  if (layout.districtAt(x, z).id !== b.id) return false;
  if (layout.isOcean(x, z)) return false;
  const r = Math.max(box.la, box.lb) * 0.5;
  if (layout.isReserved(x, z, r * 0.8)) return false;
  return true;
}

function facade(rng: Rng, family: ResidentialFamily, seam: boolean): FacadeFamily {
  if (seam) return rng.chance(0.55) ? 'ribbed' : 'panelled';
  if (family === 'stepped') return rng.chance(0.6) ? 'coffered' : 'panelled';
  if (family === 'courtyard') return rng.chance(0.5) ? 'panelled' : 'ribbed';
  return rng.pick(['ribbed', 'coffered', 'panelled'] as const);
}

function pickFamily(rng: Rng, w: ResidentialWeights, seam: boolean): ResidentialFamily {
  if (seam) return rng.chance(0.56) ? 'bar' : 'podium';
  const entries: Array<[ResidentialFamily, number]> = [
    ['bar', w.bar], ['podium', w.podium], ['courtyard', w.courtyard],
    ['stepped', w.stepped], ['walkup', w.walkup],
  ];
  let sum = 0;
  for (const e of entries) sum += e[1];
  let u = rng.next() * (sum || 1);
  for (const [f, wt] of entries) {
    u -= wt;
    if (u <= 0) return f;
  }
  return 'bar';
}

function clutter(
  boxes: PlannedBox[], s: number, t: number, la: number, lb: number, height: number, lit: number,
): LookPoint {
  // Stair core on the +B face, AC stack and laundry lines on the −B face, one drain.
  push(boxes, s + la * 0.18, t + lb / 2 - 0.4, 4.2, 5.4, Math.min(height, height * 0.92) + 1.6, {
    style: Style.Slit, detail: 1, lit: lit * 0.45, tint: 0.62,
  });
  const n = Math.min(4, Math.max(2, Math.floor((height - 8) / 3.4)));
  for (let i = 0; i < n; i++) {
    const y = 4.2 + i * 3.4;
    if (y > height - 3) break;
    const as = s + (i - (n - 1) / 2) * 3.2;
    const at = t - lb / 2 - 0.4;
    push(boxes, as, at, 1.05, 0.85, 0.75, {
      style: Style.Industrial, detail: 2, lit: 0.1, tint: 0.52, base: y,
    });
    // A small warm vent. Night albedo is black, so the stack needs a practical.
    push(boxes, as, at - 0.45, 0.55, 0.55, 0.28, {
      style: Style.Glow, detail: 2, lit: 0.14, tint: 1.02, base: y + 0.22,
    });
  }
  const ls = s + 6.2;
  const lt = t - lb / 2 - 0.7;
  for (let i = 0; i < 3; i++) {
    const y = 4.6 + i * 3.4;
    if (y > height - 2) break;
    push(boxes, ls - 1.7, lt, 0.55, 0.55, 1.25, { style: Style.Solid, detail: 2, lit: 0, tint: 0.62, base: y });
    push(boxes, ls + 1.7, lt, 0.55, 0.55, 1.25, { style: Style.Solid, detail: 2, lit: 0, tint: 0.62, base: y });
    push(boxes, ls, lt, 0.55, 3.8, 0.28, { style: Style.Solid, detail: 2, lit: 0, tint: 0.55, base: y + 1.05 });
    push(boxes, ls, lt - 0.4, 0.55, 3.2, 0.4, {
      style: Style.Glow, detail: 2, lit: 0.18, tint: 1.05, base: y + 0.38,
    });
  }
  push(boxes, s - la * 0.22, t + lb / 2 + 0.05, 0.7, 0.65, Math.max(6, height * 0.72), {
    style: Style.Solid, detail: 2, lit: 0, tint: 0.42,
  });
  return { s: ls, t: lt, ns: 0, nt: -1, y: 5.6 };
}

function addCourtProps(boxes: PlannedBox[], c: { s: number; t: number; la: number; lb: number }): void {
  push(boxes, c.s, c.t, c.lb * 0.9, c.la * 0.9, 0.07, {
    style: Style.Solid, detail: 1, lit: 0.02, tint: 0.4,
  });
  for (let i = 0; i < 3; i++) {
    const tt = c.t + (i - 1) * Math.min(9, c.lb * 0.22);
    const ss = c.s + c.la * 0.28;
    push(boxes, ss, tt, 5.4, 4.2, 3.5, { style: Style.Industrial, detail: 1, lit: 0.03, tint: 0.48 });
    push(boxes, ss, tt, 3.6, 3.1, 1.35, { style: Style.Solid, detail: 2, lit: 0.1, tint: 0.66, base: 3.5 });
  }
  for (let i = 0; i < 4; i++) {
    const rs = c.s - c.la * 0.08 + (i % 2) * 5.5;
    const rt = c.t - c.lb * 0.18 + i * 3.2;
    push(boxes, rs, rt - 1.35, 0.65, 0.65, 2.15, { style: Style.Solid, detail: 2, lit: 0, tint: 0.38 });
    push(boxes, rs, rt + 1.35, 0.65, 0.65, 2.15, { style: Style.Solid, detail: 2, lit: 0, tint: 0.38 });
    push(boxes, rs, rt, 0.55, 2.7, 0.16, { style: Style.Solid, detail: 2, lit: 0.08, tint: 0.84, base: 1.65 });
  }
  for (let i = 0; i < 3; i++) {
    push(boxes, c.s + c.la * 0.02, c.t + (i - 1) * 6.5, 1.7, 0.55, 0.48, {
      style: Style.Solid, detail: 2, lit: 0, tint: 0.34,
    });
  }
  for (let i = 0; i < 4; i++) {
    push(boxes, c.s - c.la * 0.26, c.t + (i - 1.5) * 3.6, 0.8, 0.7, 1.15, {
      style: Style.Industrial, detail: 2, lit: 0, tint: 0.32,
    });
  }
  for (let i = 0; i < 3; i++) {
    push(boxes, c.s - c.la * 0.16, c.t - c.lb * 0.22 + i * 1.7, 0.5, 1.55, 1.05, {
      style: Style.Solid, detail: 2, lit: 0.02, tint: 0.26,
    });
  }
}

function addEdgeWalls(boxes: PlannedBox[], b: ResBlock, sides: Sides): void {
  const h = 7.4;
  const run = (along: number, fixedS: number, fixedT: number, alongB: boolean) => {
    const n = Math.max(2, Math.floor(along / 13));
    const len = along / n;
    for (let i = 0; i < n; i++) {
      const u = -along / 2 + (i + 0.5) * len;
      const s = alongB ? fixedS : u;
      const t = alongB ? u : fixedT;
      const lb = alongB ? len * 0.9 : 1.25;
      const la = alongB ? 1.25 : len * 0.9;
      push(boxes, s, t, lb, la, h, { style: Style.Solid, detail: 0, lit: 0.02, tint: 0.46 });
      if (i % 2 === 0) {
        push(boxes, s, t, 0.7, 0.7, 1.15, { style: Style.Solid, detail: 2, lit: 0, tint: 0.4, base: h });
        push(boxes, s, t, 0.9, 0.55, 0.28, {
          style: Style.Glow, detail: 1, lit: 0.85, tint: 1.02, base: h + 1.05,
        });
      }
    }
  };
  if (sides.ap) run(b.lb * 0.86, b.la / 2 - 7, 0, true);
  if (sides.am) run(b.lb * 0.86, -b.la / 2 + 7, 0, true);
  if (sides.bp) run(b.la * 0.86, 0, b.lb / 2 - 7, false);
  if (sides.bm) run(b.la * 0.86, 0, -b.lb / 2 + 7, false);
  // A lower slab between the wall and the main mass, so the block steps down to the cut.
  const stepH = 34;
  if (sides.am) push(boxes, -b.la / 2 + 16, 0, b.lb * 0.42, 8, stepH, { style: Style.Residential, detail: 0, lit: 0.16, tint: 0.78 });
  if (sides.ap) push(boxes, b.la / 2 - 16, 0, b.lb * 0.42, 8, stepH, { style: Style.Residential, detail: 0, lit: 0.16, tint: 0.78 });
  if (sides.bm) push(boxes, 0, -b.lb / 2 + 14, 8, b.la * 0.36, stepH, { style: Style.Residential, detail: 0, lit: 0.16, tint: 0.78 });
  if (sides.bp) push(boxes, 0, b.lb / 2 - 14, 8, b.la * 0.36, stepH, { style: Style.Residential, detail: 0, lit: 0.16, tint: 0.78 });
}

function addCornerMarket(
  boxes: PlannedBox[], signs: PlannedSign[], stalls: StallMark[], rng: Rng, b: ResBlock, corner: number,
): void {
  const sa = corner < 2 ? 1 : -1;
  const sb = corner % 2 === 0 ? 1 : -1;
  const face: 0 | 1 | 2 | 3 = sb > 0 ? 1 : 3;
  for (let i = 0; i < 3; i++) {
    const s = sa * (b.la / 2 - 8 - i * 4.4);
    const t = sb * (b.lb / 2 + 2.15);
    push(boxes, s, t, 2.3, 1.7, 1.05, { style: Style.Solid, detail: 1, lit: 0.06, tint: 0.5 });
    stalls.push({ s, t, face });
    if (i === 0) {
      signAt(signs, rng, s, t, 1.2, 0.9, sb > 0 ? 'b+' : 'b-', 3.4, 2.8, 1.05, SignColor.Amber);
    }
  }
  const vs = sa * (b.la / 2 - 6);
  const vt = sb * (b.lb / 2 + 1.15);
  push(boxes, vs, vt, 0.85, 0.8, 1.9, { style: Style.Industrial, detail: 1, lit: 0.22, tint: 0.4 });
  signAt(signs, rng, vs, vt, 0.5, 0.45, sb > 0 ? 'b+' : 'b-', 2.6, 0.7, 1.3, SignColor.White);
}

function addHub(
  boxes: PlannedBox[], signs: PlannedSign[], stalls: StallMark[], rng: Rng, b: ResBlock,
): { s: number; t: number } {
  const shop = { s: b.la / 2 - 18, t: 0 };
  push(boxes, 6, 0, b.lb * 0.78, b.la * 0.8, 0.07, { style: Style.Solid, detail: 1, lit: 0.03, tint: 0.38 });
  // Canopy over the north yard, on posts, clear underneath.
  const capS = 8;
  const capT = 0;
  for (const ds of [-12, 12]) for (const dt of [-8, 8]) {
    push(boxes, capS + ds, capT + dt, 0.7, 0.7, 4.5, { style: Style.Solid, detail: 1, lit: 0, tint: 0.4 });
  }
  push(boxes, capS, capT, 18, 28, 0.32, { style: Style.Solid, detail: 1, lit: 0.04, tint: 0.45, base: 4.5 });
  // Tanks where the old lot's open ground was. Nothing green.
  for (let i = 0; i < 4; i++) {
    const tt = -16 + i * 10;
    push(boxes, b.la / 2 - 28, tt, 5.2, 4.4, 3.8, { style: Style.Industrial, detail: 1, lit: 0.04, tint: 0.5 });
  }
  // South and west stall rows. Gaps stay wide enough to walk.
  for (let i = 0; i < 6; i++) {
    const t = -b.lb * 0.32 + i * 7.2;
    const s = -b.la / 2 + 7;
    push(boxes, s, t, 2.4, 1.8, 1.05, { style: Style.Solid, detail: 1, lit: 0.05, tint: 0.48 });
    stalls.push({ s, t, face: 2 });
  }
  for (let i = 0; i < 5; i++) {
    const s = -b.la * 0.2 + i * 8;
    const t = -b.lb / 2 + 6.5;
    push(boxes, s, t, 1.7, 2.2, 1.05, { style: Style.Solid, detail: 1, lit: 0.05, tint: 0.48 });
    stalls.push({ s, t, face: 3 });
  }
  // Noodle counter on the east side of the yard.
  const ns = 2;
  const nt = b.lb / 2 - 8;
  push(boxes, ns, nt, 1.1, 4.4, 1.1, { style: Style.Solid, detail: 1, lit: 0.08, tint: 0.42 });
  stalls.push({ s: ns, t: nt, face: 1 });
  for (let i = 0; i < 4; i++) {
    push(boxes, ns + (i - 1.5) * 0.9, nt + 1.5, 0.55, 0.55, 0.7, { style: Style.Solid, detail: 2, lit: 0, tint: 0.22 });
  }
  for (let i = 0; i < 4; i++) {
    push(boxes, -6 + i * 1.15, b.lb / 2 - 12, 0.8, 0.75, 1.85, {
      style: Style.Industrial, detail: 1, lit: i % 2 ? 0.2 : 0.08, tint: 0.4,
    });
  }
  // Shop front: two piers and a lintel, door gap between them.
  push(boxes, shop.s, -1.55, 0.55, 0.7, 3.15, { style: Style.Solid, detail: 0, lit: 0.04, tint: 0.5 });
  push(boxes, shop.s, 1.55, 0.55, 0.7, 3.15, { style: Style.Solid, detail: 0, lit: 0.04, tint: 0.5 });
  push(boxes, shop.s, 0, 3.8, 0.55, 0.4, { style: Style.Solid, detail: 1, lit: 0.1, tint: 0.55, base: 2.7 });
  signAt(signs, rng, shop.s, 0, 2.2, 0.4, 'a-', 4.2, 3.6, 1.15, SignColor.Amber);
  signAt(signs, rng, ns, nt, 2.4, 0.6, 'b+', 3.6, 3.2, 1.05, SignColor.White);
  signAt(signs, rng, -b.la / 2 + 7, 0, 1.2, 0.9, 'a-', 3.3, 4.2, 1.1, SignColor.Amber);
  return shop;
}

function buildCourt(
  boxes: PlannedBox[], b: ResBlock, height: number, face: FacadeFamily,
  lit: number, tint: number, residential: number, rng: Rng,
): { court: { s: number; t: number }; entry: { s: number; t: number }; laundry: LookPoint } {
  const inset = 5;
  const ha = b.la / 2 - inset;
  const hb = b.lb / 2 - inset;
  const tw = clamp(Math.min(b.la, b.lb) * 0.16, 12, 18);
  const gapS = 8;
  const gapE = 7.5;
  const sN = ha - tw / 2;
  const sS = -ha + tw / 2;
  const tW = -hb + tw / 2;
  const tE = hb - tw / 2;
  const piece = (hb * 2 - gapS) / 2;
  const innerLo = sS + tw / 2;
  const innerHi = sN - tw / 2;
  const sMid = (innerLo + innerHi) / 2;
  const ewLen = innerHi - innerLo + 1.6;
  const ePiece = (ewLen - gapE) / 2;
  const wings: Array<[number, number, number, number]> = [
    [sN, 0, tw, hb * 2],
    [sS, -(gapS / 2 + piece / 2), tw, piece],
    [sS, gapS / 2 + piece / 2, tw, piece],
    [sMid, tW, ewLen, tw],
    [sMid - (gapE / 2 + ePiece / 2), tE, ePiece, tw],
    [sMid + (gapE / 2 + ePiece / 2), tE, ePiece, tw],
  ];
  for (const [s, t, la, lb] of wings) {
    emitMass(boxes, s, t, lb, la, height, 'bar', face, lit, tint, residential, rng.next());
  }
  const laundry = clutter(boxes, sN, 0, tw, hb * 2, height, lit);
  const courtLa = Math.max(8, innerHi - innerLo - 1);
  const courtLb = Math.max(8, (tE - tw / 2) - (tW + tw / 2));
  addCourtProps(boxes, { s: sMid, t: 0, la: courtLa, lb: courtLb });
  return {
    court: { s: sMid, t: 0 },
    entry: { s: sS, t: 0 },
    laundry,
  };
}

export function planResidential(block: ResBlock, params: ResidentialParams, layout: CityLayout): ResidentialPlan {
  const rng = new Rng(block.seed || 1);
  const { i, j } = gridIndex(block);
  const hubCell = params.hub
    ? gridIndex({
      ...block,
      cx: params.hub.x,
      cz: params.hub.z,
    })
    : null;
  const hub = !!hubCell && hubCell.i === i && hubCell.j === j;
  const seam = !!params.seam && !hub
    && Math.hypot(block.cx - params.seam.x, block.cz - params.seam.z) < params.seam.radius;
  const sides = corridorSides(layout, block);
  const edge = anySide(sides);
  const boxes: PlannedBox[] = [];
  const signs: PlannedSign[] = [];
  const stalls: StallMark[] = [];
  let family = pickFamily(rng, params.weights, seam && !edge);
  if (edge) family = 'bar';
  const face = facade(rng, family, seam);
  const lit = seam && params.seamLit
    ? rng.range(params.seamLit[0], params.seamLit[1])
    : rng.range(params.lit[0], params.lit[1]);
  const tint = rng.range(params.tint[0], params.tint[1]);
  const residential = rng.range(params.residential[0], params.residential[1]);
  const m = params.module;
  let height = snap(rng.skew(params.height[0] + 4, params.height[1] - 6, 1.25), m, params.height[0], params.height[1]);
  if (family === 'courtyard') height = snap(rng.skew(params.height[0], params.height[1] * 0.72, 1.15), m, params.height[0], params.height[1] * 0.78);
  if (family === 'stepped') height = snap(rng.range(params.height[0] + 28, params.height[1]), m, params.height[0] + 24, params.height[1]);
  if (family === 'walkup') height = rng.int(4, 8) * m;
  if (edge) height = snap(rng.range(params.height[0], params.height[0] + 18), m, params.height[0], params.height[0] + 20);

  let court: { s: number; t: number } | null = null;
  let entry: { s: number; t: number } | null = null;
  let laundry: LookPoint | null = null;
  let shop: { s: number; t: number } | null = null;

  if (hub) {
    family = 'bar';
    height = m * 2;
    shop = addHub(boxes, signs, stalls, rng, block);
    laundry = { s: shop.s, t: 0, ns: -1, nt: 0, y: 4 };
  } else if (edge) {
    addEdgeWalls(boxes, block, sides);
    let s = 0;
    let t = 0;
    if (sides.ap) s -= 14;
    if (sides.am) s += 14;
    if (sides.bp) t -= 10;
    if (sides.bm) t += 10;
    const la = Math.min(block.la * 0.5, 64);
    const lb = Math.min(block.lb * 0.5, 44);
    emitMass(boxes, s, t, lb, la, height, 'bar', face, lit, tint, residential, rng.next());
    laundry = clutter(boxes, s, t, la, lb, height, lit);
    if (rng.chance(0.7)) signAt(signs, rng, s, t, lb / 2, la / 2, 'b+', rng.range(3.2, 6.2), rng.range(2.4, 4.2), 1.05, SignColor.White);
  } else if (family === 'courtyard') {
    const built = buildCourt(boxes, block, height, face, lit, tint, residential, rng);
    court = built.court;
    entry = built.entry;
    laundry = built.laundry;
    if (rng.chance(0.5)) signAt(signs, rng, built.entry.s, built.entry.t, 6, 4, 'a-', 4.2, 3.2, 1.1, SignColor.Amber);
  } else if (family === 'walkup') {
    const h1 = rng.int(4, 6) * m;
    const h2 = rng.int(6, 8) * m;
    const la = block.la * 0.34;
    const lb = block.lb * 0.32;
    emitMass(boxes, -8, -block.lb * 0.18, lb, la, h1, 'bar', face, lit, tint, residential, rng.next());
    emitMass(boxes, 10, block.lb * 0.18, lb, la, h2, 'bar', face, Math.min(0.35, lit + 0.04), tint, residential, rng.next());
    laundry = clutter(boxes, 10, block.lb * 0.18, la, lb, h2, lit);
    height = h2;
    signAt(signs, rng, 10, block.lb * 0.18, lb / 2, la / 2, 'b-', 4.4, 2.6, 1.0, SignColor.Amber);
  } else if (family === 'stepped') {
    const la = block.la * 0.7;
    const lb = block.lb * 0.78;
    emitMass(boxes, 6, 0, lb, la, height, 'cantilever', face, lit, tint, residential, rng.next());
    const step1 = snap(height * 0.52, m, params.height[0], height);
    const step2 = snap(height * 0.32, m, m * 8, height);
    push(boxes, -block.la * 0.28, 0, lb * 0.72, block.la * 0.16, step1, {
      style: Style.Panel, detail: 0, lit: lit * 0.9, tint,
    });
    push(boxes, -block.la * 0.4, 0, lb * 0.5, block.la * 0.1, step2, {
      style: Style.Residential, detail: 0, lit: lit, tint: tint * 0.95,
    });
    laundry = clutter(boxes, 6, 0, la, lb, height, lit);
    if (rng.chance(0.45)) signAt(signs, rng, 6, 0, lb / 2, la / 2, 'a+', 5.2, 3.4, 1.05, SignColor.White);
  } else if (family === 'podium') {
    const la = block.la * 0.74;
    const lb = block.lb * 0.8;
    emitMass(boxes, 0, 0, lb, la, height, 'slab-podium', face, lit, tint, residential, rng.next());
    laundry = clutter(boxes, 0, 0, la, lb, height, lit);
    if (rng.chance(0.4)) signAt(signs, rng, 0, 0, lb / 2, la / 2, 'b+', 4.8, 3.6, 1.1, SignColor.Amber);
  } else {
    const alongA = rng.chance(0.72);
    const la = alongA ? block.la * 0.86 : block.la * 0.4;
    const lb = alongA ? block.lb * 0.42 : block.lb * 0.84;
    const t = alongA ? rng.range(-block.lb * 0.12, block.lb * 0.12) : 0;
    emitMass(boxes, 0, t, lb, la, height, 'bar', face, lit, tint, residential, rng.next());
    laundry = clutter(boxes, 0, t, la, lb, height, lit);
    if (rng.chance(0.42)) signAt(signs, rng, 0, t, lb / 2, la / 2, 'b-', rng.range(3.4, 6.2), rng.range(2.6, 4.4), 1.05, rng.chance(0.75) ? SignColor.Amber : SignColor.White);
  }

  if (!hub && !edge) {
    const corner = hash2i(i, j, 19) % params.marketEvery === 0 ? hash2i(i, j, 23) % 4 : -1;
    if (corner >= 0) addCornerMarket(boxes, signs, stalls, rng, block, corner);
  }

  const kept = boxes.filter((box) => keepBox(layout, block, box));
  if (!kept.length) {
    const h = snap(params.height[0] + 8, m, params.height[0], params.height[1]);
    emitMass(kept, 0, 0, block.lb * 0.4, block.la * 0.4, h, 'bar', 'panelled', lit, tint, residential, rng.next());
    const again = kept.filter((box) => keepBox(layout, block, box));
    kept.length = 0;
    for (const box of again) kept.push(box);
  }
  const keptSigns = signs.filter((sg) => {
    const x = block.cx + block.ax * sg.s + block.bx * sg.t;
    const z = block.cz + block.az * sg.s + block.bz * sg.t;
    return layout.districtAt(x, z).id === block.id && !layout.isReserved(x, z, 1) && !layout.isOcean(x, z);
  });

  const inLot = (s: number, t: number, margin: number) => {
    const x = block.cx + block.ax * s + block.bx * t;
    const z = block.cz + block.az * s + block.bz * t;
    return layout.districtAt(x, z).id === block.id && !layout.isReserved(x, z, margin) && !layout.isOcean(x, z);
  };
  const keptStalls = stalls.filter((st) => inLot(st.s, st.t, 1.2));
  if (shop && !inLot(shop.s, shop.t, 1.2)) shop = null;
  if (court && !inLot(court.s, court.t, 1)) court = null;
  if (entry && !inLot(entry.s, entry.t, 1)) entry = null;

  return {
    family, height, hub, edge, seam, court, entry, laundry, shop,
    boxes: kept,
    signs: keptSigns,
    stalls: keptStalls,
  };
}

export function fillResidentialBlock(ctx: FabricCtx, params: ResidentialParams): ResidentialPlan {
  const b = ctx.block;
  const block: ResBlock = {
    id: b.district.id,
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: b.bx, bz: b.bz,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
  const plan = planResidential(block, params, ctx.layout);
  for (const box of plan.boxes) {
    ctx.box(box.s, box.t, box.lb, box.la, box.h, {
      style: box.style as StyleId,
      detail: box.detail,
      lit: box.lit,
      tint: box.tint,
      base: box.base,
    });
  }
  for (const sg of plan.signs) {
    ctx.sign(sg.s, sg.t, sg.hb, sg.ha, sg.face, sg.along, sg.y, sg.w, sg.h, sg.color, sg.kind, sg.seed);
  }
  return plan;
}
