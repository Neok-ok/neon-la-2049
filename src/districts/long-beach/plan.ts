// Pure. One concrete megablock per block, dimmer and shorter than DTLA.
// The shared kit is called with a new plan. Omitted kit fields stay at their old defaults.
import { Rng } from '../../core/rng';
import { Style, SignColor, type FaceDir, type StyleId } from '../../world/fabric/types';
import type { CityLayout } from '../../world/layout';
import { phraseSeed } from '../../world/materials/signPhrases';
import type { KitDetail, MassSink, FaceStyle } from '../_shared/megatower/sink';
import { buildMegablock, type FacadeFamily, type MegablockForm, type MegablockParts } from '../_shared/megablock/build';
import type { KitSign } from '../_shared/megatower/tower';
import {
  DOOR_S, HERO_A, HERO_B, MODULE, blockSeed, type LongBeachBlock,
} from './spec';

const FACE_DIR: FaceDir[] = ['a+', 'b-', 'a-', 'b+'];
/** Atlas cells already in the sheet. No agency, carrier or building name. */
const PHRASES = [2, 4, 39, 49, 50, 58, 62];

export interface FabricBox {
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

export interface FabricSign {
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

export interface LongBeachPlan {
  boxes: FabricBox[];
  signs: FabricSign[];
}

const EMPTY: LongBeachPlan = { boxes: [], signs: [] };

class MemorySink implements MassSink {
  readonly full = false;
  readonly maxDetail = 2;
  readonly pieces: FabricBox[] = [];
  constructor(private s0: number, private t0: number) {}
  frustum(lx: number, lz: number, y0: number, w0: number, d0: number, w1: number, d1: number, h: number, st: FaceStyle, detail: KitDetail, _cap = true, rot = 0): void {
    if (detail > 2 || rot !== 0 || h <= 0.05) return;
    const w = (w0 + w1) / 2, d = (d0 + d1) / 2;
    if (w < 0.6 || d < 0.6) return;
    this.pieces.push({
      s: this.s0 + lz, t: this.t0 - lx, lb: w, la: d, h, base: y0,
      style: st.style as StyleId, lit: st.lit, tint: st.tint, detail: Math.min(2, detail) as 0 | 1 | 2,
    });
  }
}

function snapOffice(h: number, lo = 60, hi = 150): number {
  const n = Math.round(h / MODULE) * MODULE;
  return Math.max(lo, Math.min(hi, n));
}

function pushSign(signs: FabricSign[], s0: number, t0: number, s: KitSign, phrase: number): void {
  signs.push({
    s: s0 + s.lz, t: t0 - s.lx, hb: 0, ha: 0, face: FACE_DIR[s.face], along: 0,
    y: s.y, w: s.w, h: s.h, color: s.color, kind: s.kind,
    seed: phraseSeed(PHRASES[phrase % PHRASES.length]!),
  });
}

interface MassOpts {
  s0: number;
  t0: number;
  w: number;
  d: number;
  height: number;
  form: MegablockForm;
  family: FacadeFamily;
  lit: number;
  tint: number;
  holo: number;
  walkways: boolean;
}

function emitMass(boxes: FabricBox[], signs: FabricSign[], r: Rng, o: MassOpts): MegablockParts {
  const sink = new MemorySink(o.s0, o.t0);
  const parts = buildMegablock({
    seed: r.next(),
    height: o.height,
    w: o.w,
    d: o.d,
    form: o.form,
    family: o.family,
    lit: o.lit,
    tint: o.tint,
    residential: 0,
    compact: true,
    walkways: o.walkways,
    walkAt: o.walkways ? [40, 70] : undefined,
    holo: o.holo,
  }, sink);
  boxes.push(...sink.pieces);
  const phrase0 = Math.floor(r.next() * PHRASES.length);
  parts.signs.forEach((s, n) => pushSign(signs, o.s0, o.t0, s, phrase0 + n));
  return parts;
}

/**
 * Street-level shell with a door gap. The 180 m slab sits north of it.
 * 15 m is 3 × 5.0 m. The opening is a human door, not a floor module.
 */
function concourse(boxes: FabricBox[], signs: FabricSign[]): void {
  const south = DOOR_S;
  const depth = 12;
  const width = 14;
  const H = 15;
  const wall = 0.48;
  const gap = 2.6;
  const cheek = (width - gap) / 2;
  const concrete: Pick<FabricBox, 'style' | 'lit' | 'tint' | 'detail'> = {
    style: Style.Panel, lit: 0.07, tint: 0.56, detail: 0,
  };
  const put = (s: number, t: number, lb: number, la: number, h: number, base = 0, over: Partial<FabricBox> = {}): void => {
    boxes.push({ s, t, lb, la, h, base, ...concrete, ...over });
  };
  const sWall = south + wall / 2;
  put(sWall, -(gap / 2 + cheek / 2), cheek, wall, H);
  put(sWall, gap / 2 + cheek / 2, cheek, wall, H);
  put(sWall, 0, gap, wall, H - 2.8, 2.8, { style: Style.Solid, lit: 0.04, tint: 0.5 });
  put(sWall, 0, gap * 0.92, wall, 0.28, 2.52, { style: Style.Glow, lit: 0.62, tint: 1.2, detail: 1 });
  const sideS = south + wall + (depth - wall) / 2;
  put(sideS, -width / 2 + wall / 2, wall, depth - wall, H);
  put(sideS, width / 2 - wall / 2, wall, depth - wall, H);
  put(south + depth - wall / 2, 0, width, wall, H);
  put(south + depth / 2, 0, width - 0.4, depth - 0.6, 0.42, H, { style: Style.Solid, lit: 0.02, tint: 0.48, detail: 1 });
  signs.push({
    s: south + 0.3, t: 0, hb: 0, ha: 0, face: 'a-', along: 0,
    y: 4.2, w: 3.4, h: 1.1, color: SignColor.Amber, kind: 0, seed: phraseSeed(2),
  });
  signs.push({
    s: south + 0.3, t: 4.2, hb: 0, ha: 0, face: 'a-', along: 0,
    y: 6.4, w: 1.2, h: 4.6, color: SignColor.White, kind: 1, seed: phraseSeed(62),
  });
}

function pickForm(r: Rng): MegablockForm {
  const roll = r.next();
  if (roll < 0.42) return 'slab-podium';
  if (roll < 0.74) return 'bar';
  if (roll < 0.88) return 'courtyard';
  return 'cantilever';
}

function pickFamily(r: Rng): FacadeFamily {
  const roll = r.next();
  if (roll < 0.44) return 'coffered';
  if (roll < 0.8) return 'panelled';
  return 'ribbed';
}

/** Buildings and street signs for one Long Beach block. */
export function planLongBeach(block: LongBeachBlock, layout: CityLayout): LongBeachPlan {
  if (block.ground > 45) return EMPTY;
  if (layout.isOcean(block.cx, block.cz) || layout.isReserved(block.cx, block.cz, 8)) return EMPTY;
  if (layout.districtAt(block.cx, block.cz).id !== 'long-beach') return EMPTY;
  const r = new Rng(blockSeed(block.i, block.j, block.index));
  const boxes: FabricBox[] = [];
  const signs: FabricSign[] = [];
  const heroA = block.i === HERO_A.i && block.j === HERO_A.j;
  const heroB = block.i === HERO_B.i && block.j === HERO_B.j;
  if (heroA) {
    concourse(boxes, signs);
    emitMass(boxes, signs, r, {
      s0: 10, t0: 0, w: 78, d: 118, height: HERO_A.height,
      form: 'slab-podium', family: 'panelled', lit: 0.2, tint: 0.66,
      holo: 1, walkways: true,
    });
    return { boxes, signs };
  }
  if (heroB) {
    emitMass(boxes, signs, r, {
      s0: 0, t0: 0, w: block.lb * 0.88, d: block.la * 0.82, height: HERO_B.height,
      form: 'bar', family: 'coffered', lit: 0.18, tint: 0.62,
      holo: 1, walkways: true,
    });
    return { boxes, signs };
  }
  let height = snapOffice(r.skew(58, 148, 1.4));
  if (height >= 145 && r.chance(0.06)) height = 155;
  const holo = height >= 115 && r.chance(0.14) ? 1 : 0;
  emitMass(boxes, signs, r, {
    s0: 0, t0: 0,
    w: block.lb * 0.88,
    d: block.la * 0.86,
    height,
    form: pickForm(r),
    family: pickFamily(r),
    lit: r.range(0.07, 0.18),
    tint: r.range(0.5, 0.7),
    holo,
    walkways: height >= 90,
  });
  return { boxes, signs };
}
