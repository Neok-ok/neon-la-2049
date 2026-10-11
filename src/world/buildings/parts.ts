// Modular parts for one tower, in block-local metres.
// s is along the block A axis, t along B. The draft is centred on the lot.
// Boxes stay inside the footprint. The city mesher turns each box into five quads.
import { Style, type FaceDir, type StyleId } from '../fabric/types';
import { LIGHT_ROLES } from './lights';

export const STOREY = 3.6;
export const RES_STOREY = 3.4;
export const DOOR_H = 2.2;
export const DOOR_W = 2.05;
export const RAIL_H = 1.05;
export const RAIL_T = 0.08;

export const TOWER_KINDS = [
  'band-slab',
  'ziggurat',
  'buttress',
  'monolith',
  'res-stack',
  'holo-shaft',
  'cantilever',
  'lantern',
] as const;

export const HERO_KINDS = ['hero-gate', 'hero-step', 'hero-obelisk'] as const;

export type TowerKind = (typeof TOWER_KINDS)[number] | (typeof HERO_KINDS)[number];

export type PartRole = 'mass' | 'door-header' | 'door-cheek' | 'rail' | 'balcony' | 'deck' | 'band';

export interface BBox {
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
  /** Dropped when the tier cap is lower. Masses omit this and survive every tier. */
  ornament?: 0 | 1 | 2;
  role?: PartRole;
}

export interface BSign {
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
}

export interface Draft {
  boxes: BBox[];
  signs: BSign[];
  height: number;
  halfW: number;
  halfD: number;
  kind: TowerKind;
  variant: number;
  storey: number;
  doorH: number;
  doorW: number;
  railH: number;
}

export function emptyDraft(kind: TowerKind, variant: number, w: number, d: number, storey: number): Draft {
  return {
    boxes: [], signs: [], height: 0, halfW: w / 2, halfD: d / 2,
    kind, variant, storey, doorH: DOOR_H, doorW: DOOR_W, railH: RAIL_H,
  };
}

/** Nearest module step that stays inside [min, max]. Falls back to a clamp if the range holds no step. */
export function snap(h: number, module: number, min: number, max: number): number {
  const lo = Math.ceil((min - 1e-4) / module);
  const hi = Math.floor((max + 1e-4) / module);
  if (hi < lo) {
    const n = Math.max(1, Math.round(h / module));
    return Math.max(min, Math.min(max, n * module));
  }
  const n = Math.max(lo, Math.min(hi, Math.round(h / module)));
  return n * module;
}

export function addBox(d: Draft, b: BBox): void {
  if (b.h < 0.08 || b.lb < 0.35 || b.la < 0.35) return;
  if (b.base + b.h > d.height) d.height = b.base + b.h;
  d.boxes.push(b);
}

export interface Skin {
  s: number;
  t: number;
  lb: number;
  la: number;
  h: number;
  base: number;
  style: StyleId;
  lit: number;
  tint: number;
  door: boolean;
}

/** A mass. When `door` is set and the piece touches the ground, the south face (a-) is a 2.2 m opening. */
export function skin(d: Draft, o: Skin): void {
  const { s, t, lb, la, h, base, style, lit, tint, door } = o;
  if (!door || base > 0.2 || lb < DOOR_W + 1.2) {
    addBox(d, { s, t, lb, la, h, base, style, lit, tint, detail: 0, role: 'mass' });
    return;
  }
  const thick = 0.72;
  const bodyLa = Math.max(1.2, la - thick);
  const bodyS = s + thick / 2;
  addBox(d, { s: bodyS, t, lb, la: bodyLa, h, base, style, lit, tint, detail: 0, role: 'mass' });
  const ss = s - la / 2 + thick / 2;
  const cheek = (lb - DOOR_W) / 2;
  const wall: Omit<BBox, 's' | 't' | 'lb' | 'la' | 'h' | 'base'> = {
    style, lit, tint, detail: 0,
  };
  addBox(d, { ...wall, s: ss, t: t - (DOOR_W / 2 + cheek / 2), lb: cheek, la: thick, h, base, role: 'door-cheek' });
  addBox(d, { ...wall, s: ss, t: t + (DOOR_W / 2 + cheek / 2), lb: cheek, la: thick, h, base, role: 'door-cheek' });
  const head = h - DOOR_H;
  if (head > 0.2) {
    addBox(d, {
      ...wall, s: ss, t, lb: DOOR_W, la: thick, h: head, base: base + DOOR_H, role: 'door-header',
    });
  }
  const soffit = LIGHT_ROLES.doorSoffit;
  addBox(d, {
    s: ss, t, lb: DOOR_W * 0.92, la: thick * 0.8,
    h: soffit.h, base: base + DOOR_H - soffit.h,
    style: soffit.style, lit: soffit.lit, tint: soffit.tint,
    detail: 1, ornament: 1, role: 'door-header',
  });
}

export function band(d: Draft, s: number, t: number, lb: number, la: number, y: number, h: number, lit: number, tint: number): void {
  addBox(d, {
    s, t, lb, la, h, base: y, style: Style.Solid, lit: lit * 0.25, tint: tint * 0.82,
    detail: 0, role: 'band',
  });
}

export function rail(d: Draft, s: number, t: number, lb: number, la: number, deckY: number, tint: number): void {
  addBox(d, {
    s, t, lb, la, h: RAIL_T, base: deckY + RAIL_H - RAIL_T,
    style: Style.Solid, lit: 0.04, tint: tint * 0.7,
    detail: 1, ornament: 1, role: 'rail',
  });
}

export function balcony(d: Draft, s: number, t: number, lb: number, la: number, floorY: number, lit: number, tint: number): void {
  const slab = 0.16;
  addBox(d, {
    s, t, lb, la, h: slab, base: floorY - slab,
    style: Style.Residential, lit: lit * 0.4, tint,
    detail: 1, ornament: 1, role: 'balcony',
  });
  rail(d, s, t, Math.max(0.4, lb - 0.12), Math.max(0.4, la - 0.12), floorY, tint);
}

export function glowCrown(d: Draft, s: number, t: number, lb: number, la: number, y: number, h: number): void {
  const g = LIGHT_ROLES.crown;
  addBox(d, {
    s, t, lb, la, h, base: y, style: g.style, lit: g.lit, tint: g.tint, detail: 0, role: 'mass',
  });
}

export function mastTip(d: Draft, s: number, t: number, y: number, h: number): void {
  addBox(d, {
    s, t, lb: 0.7, la: 0.7, h, base: y,
    style: Style.Industrial, lit: 0.05, tint: 0.45, detail: 1, ornament: 1, role: 'mass',
  });
  const o = LIGHT_ROLES.obstruction;
  addBox(d, {
    s, t, lb: 0.55, la: 0.55, h: 0.45, base: y + h,
    style: o.style, lit: o.lit, tint: o.tint, detail: 1, ornament: 1, role: 'mass',
  });
}
