// Pure. One B1 tower per block, dimmer and shorter than DTLA.
// The concourse door on hero A is unchanged. The interior reads that shell, not the tower mass.
import { Rng } from '../../core/rng';
import { Style, SignColor, type FaceDir, type StyleId } from '../../world/fabric/types';
import type { CityLayout } from '../../world/layout';
import { CELL, PHRASE_LONG_BEACH, phraseSeed } from '../../world/materials/signPhrases';
import { placeLot } from '../../world/buildings/place';
import type { TowerKind } from '../../world/buildings/parts';
import {
  DOOR_S, HERO_A, HERO_B, blockSeed, type LongBeachBlock,
} from './spec';

/** Atlas cells already in the sheet. No agency, carrier or building name. */
const PHRASES = PHRASE_LONG_BEACH;

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
  ornament?: 0 | 1 | 2;
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

interface MassOpts {
  s0: number;
  t0: number;
  w: number;
  d: number;
  minH: number;
  maxH: number;
  lit: number;
  tint: number;
  holo: boolean;
  decks: boolean;
  kind?: TowerKind;
}

function emitMass(boxes: FabricBox[], signs: FabricSign[], r: Rng, o: MassOpts): void {
  const placed = placeLot(r, {
    w: o.w,
    d: o.d,
    minH: o.minH,
    maxH: o.maxH,
    plinth: 0,
    phrases: PHRASES,
    lit: o.lit,
    tint: o.tint,
    holo: o.holo,
    kind: o.kind,
  });
  if (!placed) return;
  for (const b of placed.boxes) {
    boxes.push({
      s: o.s0 + b.s, t: o.t0 + b.t, lb: b.lb, la: b.la, h: b.h, base: b.base,
      style: b.style, lit: b.lit, tint: b.tint, detail: b.detail, ornament: b.ornament,
    });
  }
  for (const s of placed.signs) {
    signs.push({
      s: o.s0 + s.s, t: o.t0 + s.t, hb: s.hb, ha: s.ha, face: s.face, along: s.along,
      y: s.y, w: s.w, h: s.h, color: s.color, kind: s.kind, seed: s.seed,
    });
  }
  if (!o.decks || placed.draft.height < 90) return;
  for (const y of [40, 70]) {
    if (y > placed.draft.height - 8) continue;
    const reach = 1.15;
    boxes.push({
      s: o.s0, t: o.t0 + o.w / 2 + reach / 2, lb: reach, la: o.d * 0.55, h: 0.22, base: y,
      style: Style.Solid, lit: 0.05, tint: o.tint * 0.75, detail: 1,
    });
    boxes.push({
      s: o.s0, t: o.t0 - (o.w / 2 + reach / 2), lb: reach, la: o.d * 0.55, h: 0.22, base: y,
      style: Style.Solid, lit: 0.05, tint: o.tint * 0.75, detail: 1,
    });
  }
}

/**
 * Street-level shell with a door gap. The 180 m slab sits north of it.
 * 14.4 m is 4 × 3.6 m. The opening is a human door, not a floor module.
 */
function concourse(boxes: FabricBox[], signs: FabricSign[]): void {
  const south = DOOR_S;
  const depth = 12;
  const width = 14;
  const H = 14.4;
  const wall = 0.48;
  const gap = 2.1;
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
  put(sWall, 0, gap, wall, H - 2.2, 2.2, { style: Style.Solid, lit: 0.04, tint: 0.5 });
  put(sWall, 0, gap * 0.92, wall, 0.22, 2.2, { style: Style.Glow, lit: 0.62, tint: 1.2, detail: 1 });
  const sideS = south + wall + (depth - wall) / 2;
  put(sideS, -width / 2 + wall / 2, wall, depth - wall, H);
  put(sideS, width / 2 - wall / 2, wall, depth - wall, H);
  put(south + depth - wall / 2, 0, width, wall, H);
  put(south + depth / 2, 0, width - 0.4, depth - 0.6, 0.42, H, { style: Style.Solid, lit: 0.02, tint: 0.48, detail: 1 });
  signs.push({
    s: south + 0.3, t: 0, hb: 0, ha: 0, face: 'a-', along: 0,
    y: 4.2, w: 3.4, h: 1.1, color: SignColor.Amber, kind: 0, seed: phraseSeed(CELL.BERTH),
  });
  signs.push({
    s: south + 0.3, t: 4.2, hb: 0, ha: 0, face: 'a-', along: 0,
    y: 6.4, w: 1.2, h: 4.6, color: SignColor.White, kind: 1, seed: phraseSeed(62),
  });
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
      s0: 10, t0: 0, w: 78, d: 118, minH: 180, maxH: 180,
      lit: 0.2, tint: 0.66, holo: true, decks: true, kind: 'band-slab',
    });
    return { boxes, signs };
  }
  if (heroB) {
    emitMass(boxes, signs, r, {
      s0: 0, t0: 0, w: block.lb * 0.88, d: block.la * 0.82,
      minH: 162, maxH: 165,
      lit: 0.18, tint: 0.62, holo: true, decks: true, kind: 'ziggurat',
    });
    return { boxes, signs };
  }
  const tall = r.chance(0.06);
  emitMass(boxes, signs, r, {
    s0: 0, t0: 0,
    w: block.lb * 0.88,
    d: block.la * 0.86,
    minH: 61.2,
    maxH: tall ? 154.8 : 140.4,
    lit: r.range(0.07, 0.18),
    tint: r.range(0.5, 0.7),
    holo: r.chance(0.14),
    decks: true,
  });
  return { boxes, signs };
}
