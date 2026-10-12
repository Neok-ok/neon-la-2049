// Modular parts for one tower, in block-local metres.
// s is along the block A axis, t along B. The draft is centred on the lot.
// Boxes stay inside the footprint. The city mesher turns each box into five quads.
// Metres come from the shared architecture helpers. This file stays worker-safe:
// no canvas, no door-leaf mesh.
import {
  DOOR_H as LEAF_H, RAIL_H as ARCH_RAIL_H, STOREY_M, planFlight, snapMetres,
} from '../architecture/scale';
import { Style, type FaceDir, type StyleId } from '../fabric/types';
import { LIGHT_ROLES } from './lights';

export const STOREY = STOREY_M;
/** Housing floors stay inside the 3–4 m storey band. */
export const RES_STOREY = snapMetres(3.4);
export const DOOR_H = LEAF_H;
/**
 * Walk-through opening. The civic leaf is a 2.2 m square (LAPD doorHalf × 2,
 * City Hall leaf). A single 1.0 m leaf would not match that opening.
 */
export const DOOR_W = snapMetres(DOOR_H);
export const RAIL_H = ARCH_RAIL_H;
export const RAIL_T = 0.08;
const STAIR_W = snapMetres(1.15);

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

/**
 * Families for districts the downtown roll does not cover.
 * Kept off `TOWER_KINDS` so financial, downtown, and Long Beach keep their seeds.
 * East LA is a housing bar. The South Bay yard is a flare bed. Neither uses a downtown taper.
 */
export const FIELD_KINDS = ['screen-wall', 'flue-bank', 'shelf-row', 'flare-bed'] as const;

export type TowerKind = (typeof TOWER_KINDS)[number] | (typeof HERO_KINDS)[number] | (typeof FIELD_KINDS)[number];

export type PartRole = 'mass' | 'door-header' | 'door-cheek' | 'door-jamb' | 'rail' | 'balcony' | 'deck' | 'band' | 'stair';

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
  /** Kind the lot rolled, before a stand-in. Equals `kind` once the family is placed. */
  sourceKind: TowerKind;
  variant: number;
  storey: number;
  doorH: number;
  doorW: number;
  railH: number;
}

export function emptyDraft(kind: TowerKind, variant: number, w: number, d: number, storey: number): Draft {
  return {
    boxes: [], signs: [], height: 0, halfW: w / 2, halfD: d / 2,
    kind, sourceKind: kind, variant, storey, doorH: DOOR_H, doorW: DOOR_W, railH: RAIL_H,
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
  return snapMetres(n * module);
}

/** Outer face of the ground opening, in tower-local metres. a- is negative s. */
export function doorFace(d: Draft): { s: number; t: number } | null {
  const cheeks = d.boxes.filter((b) => b.role === 'door-cheek' && b.base < 1);
  if (!cheeks.length) return null;
  const s = cheeks[0]!.s - cheeks[0]!.la / 2;
  // Jambs sit on the opening. Averaging the cheeks lands on the wall when the door is offset.
  const jambs = d.boxes.filter((b) => b.role === 'door-jamb' && b.base < 1);
  const t = jambs.length
    ? jambs.reduce((sum, b) => sum + b.t, 0) / jambs.length
    : cheeks.reduce((sum, b) => sum + b.t, 0) / cheeks.length;
  return { s, t };
}

/**
 * Three-person queue: opposite the flight, 2.5 m out.
 * A crossing mass on that side (the lantern bar) gets the queue in front of the opening instead.
 */
export function queueSpot(d: Draft): { s: number; t: number } | null {
  const door = doorFace(d);
  if (!door) return null;
  const stairs = d.boxes.filter((b) => b.role === 'stair' && b.h < 0.4 && b.base < 4);
  const stairT = stairs.length
    ? stairs.reduce((sum, b) => sum + b.t, 0) / stairs.length
    : door.t + 1;
  const sign = stairT >= door.t ? -1 : 1;
  const t = door.t + sign * 2.6;
  const s = door.s - 2.5;
  const blocked = d.boxes.some((b) => {
    if (b.role === 'stair' || b.role === 'door-cheek' || b.role === 'door-header' || b.role === 'door-jamb') return false;
    if (b.h < 2 || b.base > 1.2) return false;
    const overlapT = Math.abs(b.t - t) * 2 < b.lb + 1.1;
    const overlapS = Math.abs(b.s - s) * 2 < b.la + 1.1;
    return overlapT && overlapS;
  });
  if (blocked) return { s: door.s - 3.8, t: door.t - sign * 0.4 };
  return { s, t };
}

export function addBox(d: Draft, b: BBox): void {
  if (b.h < 0.06 || b.lb < 0.07 || b.la < 0.07) return;
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
  /** Opening center along t, relative to the mass center. 0 keeps the door in the middle. */
  doorT?: number;
}

/** A mass. When `door` is set and the piece touches the ground, the south face (a-) is a 2.2 m opening. */
export function skin(d: Draft, o: Skin): void {
  const { s, t, lb, la, h, base, style, lit, tint, door } = o;
  if (!door || base > 0.2 || lb < DOOR_W + 1.2) {
    addBox(d, { s, t, lb, la, h, base, style, lit, tint, detail: 0, role: 'mass' });
    return;
  }
  const thick = 0.72;
  const doorAt = t + (o.doorT ?? 0);
  const massL = t - lb / 2;
  const massR = t + lb / 2;
  const doorL = doorAt - DOOR_W / 2;
  const doorR = doorAt + DOOR_W / 2;
  const leftW = doorL - massL;
  const rightW = massR - doorR;
  if (leftW < 0.3 || rightW < 0.3) {
    addBox(d, { s, t, lb, la, h, base, style, lit, tint, detail: 0, role: 'mass' });
    return;
  }
  const bodyLa = Math.max(1.2, la - thick);
  const bodyS = s + thick / 2;
  addBox(d, { s: bodyS, t, lb, la: bodyLa, h, base, style, lit, tint, detail: 0, role: 'mass' });
  const ss = s - la / 2 + thick / 2;
  const wall: Omit<BBox, 's' | 't' | 'lb' | 'la' | 'h' | 'base'> = {
    style, lit, tint, detail: 0,
  };
  addBox(d, { ...wall, s: ss, t: (massL + doorL) / 2, lb: leftW, la: thick, h, base, role: 'door-cheek' });
  addBox(d, { ...wall, s: ss, t: (doorR + massR) / 2, lb: rightW, la: thick, h, base, role: 'door-cheek' });
  const head = h - DOOR_H;
  if (head > 0.2) {
    addBox(d, {
      ...wall, s: ss, t: doorAt, lb: DOOR_W, la: thick, h: head, base: base + DOOR_H, role: 'door-header',
    });
  }
  const soffit = LIGHT_ROLES.doorSoffit;
  addBox(d, {
    s: ss, t: doorAt, lb: DOOR_W * 0.92, la: thick * 0.8,
    h: soffit.h, base: base + DOOR_H - soffit.h,
    style: soffit.style, lit: soffit.lit, tint: soffit.tint,
    detail: 1, ornament: 1, role: 'door-header',
  });
  // A glow pane starts 0.63 m above its own base (4.5 m cell, sill at 0.14).
  // Bury that dark sill so the lit face runs from the floor to the 2.2 m head.
  const paneSill = 0.63;
  const outer = ss - thick / 2;
  const glow: Omit<BBox, 's' | 't' | 'lb' | 'la' | 'h' | 'base'> = {
    style: soffit.style, lit: soffit.lit, tint: soffit.tint, detail: 1, ornament: 1,
  };
  for (const side of [-1, 1]) {
    addBox(d, {
      ...glow,
      s: outer - 0.04, t: doorAt + side * (DOOR_W / 2 + 0.1),
      lb: 0.16, la: 0.1, h: DOOR_H + paneSill, base: base - paneSill, role: 'door-jamb',
    });
  }
  // The mass behind the opening is a window wall. Sit the lit plate in the
  // hole, in front of that mass, so a 1.80 m figure reads against a 2.2 m doorway.
  addBox(d, {
    s: s - la / 2 + thick - 0.08, t: doorAt, lb: DOOR_W - 0.08, la: 0.12,
    h: DOOR_H + paneSill, base: base - paneSill,
    style: Style.Glow, lit: 0.9, tint: 1.02, detail: 0, role: 'mass',
  });
}

function stairHits(d: Draft, s: number, t: number, la: number, lb: number, y0: number, y1: number): boolean {
  for (const b of d.boxes) {
    if (b.role === 'door-cheek' || b.role === 'door-header' || b.role === 'door-jamb' || b.role === 'stair') continue;
    const overlapS = Math.abs(b.s - s) * 2 < b.la + la - 0.04;
    const overlapT = Math.abs(b.t - t) * 2 < b.lb + lb - 0.04;
    const overlapY = b.base < y1 - 0.04 && b.base + b.h > y0 + 0.04;
    if (overlapS && overlapT && overlapY) return true;
  }
  return false;
}

/**
 * One flight beside the ground door, rising this draft's storey.
 * Housing is 3.4 m and the office module is 3.6 m, so the landing meets the floor.
 * Risers come from planFlight. The run follows the facade so the stoop
 * stays inside the 2.2 m footprint allowance. Skipped when the wall is
 * too short or another mass already occupies the tread.
 */
export function entryFlight(d: Draft): void {
  if (d.boxes.some((b) => b.role === 'stair')) return;
  const cheeks = d.boxes.filter((b) => b.role === 'door-cheek' && b.base < 1);
  if (cheeks.length < 2) return;
  const face = doorFace(d);
  if (!face) return;
  const faceS = face.s;
  const faceT = face.t;
  const base = cheeks[0]!.base;
  const tint = cheeks[0]!.tint;
  const tMin = Math.min(...cheeks.map((b) => b.t - b.lb / 2));
  const tMax = Math.max(...cheeks.map((b) => b.t + b.lb / 2));
  const riseTo = d.storey > 0 ? d.storey : STOREY;
  const flight = planFlight(riseTo);
  const gap = snapMetres(0.4);
  const lay = (dir: 1 | -1): boolean => {
    const start = faceT + dir * (DOOR_W / 2 + gap);
    const end = start + dir * flight.run;
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    if (lo < tMin + 0.15 || hi > tMax - 0.15) return false;
    const s = faceS - STAIR_W / 2;
    const midT = (start + end) / 2;
    if (Math.abs(s) + STAIR_W / 2 > d.halfD + 2.2) return false;
    if (Math.max(Math.abs(lo), Math.abs(hi)) > d.halfW + 2.2) return false;
    if (stairHits(d, s, midT, STAIR_W, flight.run, base, base + riseTo)) return false;
    for (let i = 0; i < flight.risers; i++) {
      const treadT = start + dir * flight.tread * (i + 0.5);
      addBox(d, {
        s, t: treadT,
        lb: snapMetres(flight.tread * 0.96, 0.01), la: STAIR_W, h: flight.rise,
        base: base + flight.rise * i,
        style: Style.Solid, lit: 0.03, tint: tint * 0.72,
        detail: 1, ornament: 1, role: 'stair',
      });
      // A thin edge on every riser. Spacing stays the 0.17 m rise; the line is not a second step.
      addBox(d, {
        s: faceS - STAIR_W + 0.05, t: treadT,
        lb: snapMetres(flight.tread * 0.88, 0.01), la: 0.1, h: 0.06,
        base: base + flight.rise * (i + 1) - 0.06,
        style: Style.Glow, lit: 0.62, tint: 0.9,
        detail: 1, ornament: 1, role: 'stair',
      });
    }
    const railS = faceS - STAIR_W + 0.05;
    for (let i = 0; i < flight.risers; i += 4) {
      addBox(d, {
        s: railS, t: start + dir * flight.tread * (i + 0.5),
        lb: 0.08, la: 0.08, h: RAIL_H, base: base + flight.rise * (i + 1),
        style: Style.Solid, lit: 0.04, tint: tint * 0.6,
        detail: 2, ornament: 2, role: 'stair',
      });
    }
    return true;
  };
  if (!lay(1)) lay(-1);
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
