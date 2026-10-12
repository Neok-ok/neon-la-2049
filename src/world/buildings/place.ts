// Drop a drafted tower onto a fabric lot. One building replaces the lot; nothing is added beside an old mass.
import type { Rng } from '../../core/rng';
import type { FabricCtx, FaceDir, StyleId } from '../fabric/types';
import { phraseSeed } from '../materials/signPhrases';
import { HERO_KINDS, TOWER_KINDS, type BBox, type Draft, type TowerKind } from './parts';
import { buildTower, type TowerSpec } from './recipes';

export interface PlacedBox {
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

export interface PlacedSign {
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

export interface Placed {
  draft: Draft;
  boxes: PlacedBox[];
  signs: PlacedSign[];
}

export interface LotPlace {
  w: number;
  d: number;
  minH: number;
  maxH: number;
  plinth: number;
  decks?: readonly number[];
  phrases: readonly number[];
  lit: number;
  tint: number;
  holo?: boolean;
  /** Force a family. Otherwise the lot seed picks one of the eight. */
  kind?: TowerKind;
}

export function pickKind(r: Rng, narrow: boolean): TowerKind {
  if (narrow) return r.chance(0.65) ? 'band-slab' : 'res-stack';
  return TOWER_KINDS[r.int(0, TOWER_KINDS.length - 1)]!;
}

export function placeLot(r: Rng, o: LotPlace): Placed | null {
  if (o.w < 8 || o.d < 8) return null;
  const narrow = Math.min(o.w, o.d) < 26;
  const kind = o.kind ?? pickKind(r, narrow);
  const spec: TowerSpec = {
    kind,
    variant: r.int(0, 2),
    seed: r.next(),
    height: narrow ? r.range(Math.max(o.minH, 64), Math.min(o.maxH, 120)) : r.skew(o.minH, o.maxH, 1.2),
    w: o.w,
    d: o.d,
    lit: kind === 'monolith' || kind === 'hero-step' ? Math.min(o.lit, 0.12) : o.lit,
    tint: o.tint,
    plinth: narrow ? 0 : o.plinth,
    decks: o.decks ?? [],
    phrases: o.phrases,
    holo: o.holo ?? (kind === 'holo-shaft' || kind === 'hero-obelisk' || (kind === 'lantern' && r.chance(0.35))),
    minH: narrow ? 57.6 : o.minH,
    maxH: o.maxH,
  };
  return placedAt(0, 0, buildTower(spec), o.phrases);
}

export function placeHero(kind: (typeof HERO_KINDS)[number], w: number, d: number, height: number, seed: number): Placed {
  const spec: TowerSpec = {
    kind, variant: 0, seed, height, w, d,
    lit: kind === 'hero-step' ? 0.28 : 0.32,
    tint: kind === 'hero-step' ? 0.55 : 0.62,
    plinth: 0,
    decks: [],
    phrases: [],
    holo: kind === 'hero-obelisk',
    minH: height - 8,
    maxH: height + 8,
  };
  return placedAt(0, 0, buildTower(spec), []);
}

export function placedAt(s0: number, t0: number, draft: Draft, phrases: readonly number[]): Placed {
  const boxes: PlacedBox[] = [];
  for (const b of draft.boxes) boxes.push(shiftBox(s0, t0, b));
  const signs: PlacedSign[] = draft.signs.map((sg, i) => ({
    s: s0 + sg.s,
    t: t0 + sg.t,
    hb: sg.hb,
    ha: sg.ha,
    face: sg.face,
    along: sg.along,
    y: sg.y,
    w: sg.w,
    h: sg.h,
    color: sg.color,
    kind: sg.kind,
    seed: phraseSeed(phrases.length ? phrases[i % phrases.length]! : 62),
  }));
  return { draft, boxes, signs };
}

function shiftBox(s0: number, t0: number, b: BBox): PlacedBox {
  return {
    s: s0 + b.s, t: t0 + b.t, lb: b.lb, la: b.la, h: b.h, base: b.base,
    style: b.style, lit: b.lit, tint: b.tint, detail: b.detail, ornament: b.ornament,
  };
}

/** Write boxes through the fabric context. Reserved and ocean samples come back null and are skipped. */
export function emitPlaced(ctx: FabricCtx, placed: Placed): number {
  let n = 0;
  for (const b of placed.boxes) {
    const made = ctx.box(b.s, b.t, b.lb, b.la, b.h, {
      style: b.style,
      lit: b.lit,
      tint: b.tint,
      detail: b.detail,
      // Negative bases bury a glow sill under the floor. Zero still means "on the ground".
      base: b.base > 0.05 || b.base < -0.02 ? b.base : undefined,
    });
    if (!made) continue;
    made.kit = true;
    if (b.ornament !== undefined) made.ornament = b.ornament;
    n++;
  }
  for (const s of placed.signs) {
    ctx.sign(s.s, s.t, s.hb, s.ha, s.face, s.along, s.y, s.w, s.h, s.color, s.kind, s.seed);
  }
  return n;
}
