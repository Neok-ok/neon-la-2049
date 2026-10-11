// Pure module (worker-safe). One Downtown block: megablock kit plans (or a compact megatower),
// the street bridges at the shared walkway heights, and the prop / steam / crowd lists LOD0 uses.
// The chunk worker (archetype) and the main thread (details, crowds) both call dressBlock.
import { Rng, hash2i } from '../../core/rng';
import { lifeSpot, type CrowdLifeSpot } from '../../world/crowdLife';
import { Style, type FaceDir } from '../../world/fabric/types';
import type { CityLayout } from '../../world/layout';
import { distToSegment } from '../../world/layout';
import { SIGN_RGB } from '../../world/materials/signPalette';
import { PHRASE_DTLA } from '../../world/materials/signPhrases';
import { placeLot } from '../../world/buildings/place';
import { doorFace, type TowerKind } from '../../world/buildings/parts';
import { lineHasHigh, lineWalkY } from '../_shared/megablock/grid';

/** Atlas cells that read as downtown commerce rather than a food stall. */
const PHRASES = PHRASE_DTLA;

export interface DtlaBlock {
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
  i: number;
  j: number;
}

export interface ReplayBox {
  s: number;
  t: number;
  lb: number;
  la: number;
  h: number;
  base: number;
  style: number;
  lit: number;
  tint: number;
  detail: 0 | 1 | 2;
  ornament?: 0 | 1 | 2;
  /** Tower kit. Bridges and walk links leave this unset and stay in the chunk mesh. */
  kit?: boolean;
  /** Which B1 family this kit box came from. The mesher does not read it. */
  family?: TowerKind;
}

export interface DtlaSign {
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

export interface DtlaProp {
  template: 'box' | 'awning' | 'canopy' | 'cyl' | 'quadY' | 'quadZ' | 'stool';
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch?: number;
  sx: number;
  sy: number;
  sz: number;
  color: [number, number, number];
  emissive: [number, number, number];
  metal: number;
  alpha?: number;
  pass?: 'opaque' | 'fade' | 'add';
  rank: number;
}

export interface DtlaSteam {
  x: number;
  y: number;
  z: number;
  seed: number;
  rank: number;
}

export interface DtlaPool {
  x: number;
  y: number;
  z: number;
  yaw: number;
  len: number;
  wid: number;
  rgb: [number, number, number];
  intensity: number;
  rank: number;
}

export interface DtlaDress {
  boxes: ReplayBox[];
  signs: DtlaSign[];
  props: DtlaProp[];
  steam: DtlaSteam[];
  pools: DtlaPool[];
  loops: Array<Array<[number, number]>>;
  life: CrowdLifeSpot[];
}

interface Lot { s: number; t: number; la: number; lb: number }

function splitLots(rng: Rng, s: number, t: number, la: number, lb: number, minLot: number, maxLot: number, out: Lot[], depth = 0): void {
  const big = Math.max(la, lb);
  if (depth > 10 || big <= maxLot || (big < maxLot * 1.6 && rng.chance(0.35))) {
    out.push({ s, t, la, lb });
    return;
  }
  const r = rng.range(0.38, 0.62);
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

function world(b: DtlaBlock, s: number, t: number): [number, number] {
  return [b.cx + b.ax * s + b.bx * t, b.cz + b.az * s + b.bz * t];
}

/** A lot that reaches into a neighbouring district would sit on that district's streets. */
function crossesOut(b: DtlaBlock, layout: CityLayout, s: number, t: number, la: number, lb: number): boolean {
  const home = layout.districtAt(b.cx, b.cz).id;
  for (const ds of [-la / 2, la / 2]) {
    for (const dt of [-lb / 2, lb / 2]) {
      const [x, z] = world(b, s + ds, t + dt);
      if (layout.districtAt(x, z).id !== home) return true;
      if (layout.isOcean(x, z) || layout.isReserved(x, z, 0.5)) return true;
    }
  }
  return false;
}

function yawNormal(b: DtlaBlock, ns: number, nt: number): number {
  return Math.atan2(b.ax * ns + b.bx * nt, b.az * ns + b.bz * nt);
}

function walksForLot(b: DtlaBlock, lot: Lot): number[] {
  const ys: number[] = [];
  const add = (i: number, j: number, axis: 0 | 1) => {
    ys.push(lineWalkY(i, j, axis, false));
    if (lineHasHigh(i, j, axis)) ys.push(lineWalkY(i, j, axis, true));
  };
  if (lot.s + lot.la / 2 > b.la / 2 - 10) add(b.i + 1, b.j, 1);
  if (lot.s - lot.la / 2 < -b.la / 2 + 10) add(b.i, b.j, 1);
  if (lot.t + lot.lb / 2 > b.lb / 2 - 10) add(b.i, b.j + 1, 0);
  if (lot.t - lot.lb / 2 < -b.lb / 2 + 10) add(b.i, b.j, 0);
  if (!ys.length) add(b.i, b.j, 0);
  return ys;
}

function financialEdge(layout: CityLayout, x: number, z: number): number {
  const fin = layout.districts.find((d) => d.id === 'financial-megatowers');
  if (!fin) return 1e9;
  let best = 1e9;
  const p = fin.polygon;
  for (let i = 0, k = p.length - 1; i < p.length; k = i++) {
    best = Math.min(best, distToSegment(x, z, p[k]![0], p[k]![1], p[i]![0], p[i]![1]));
  }
  return best;
}

function bridge(boxes: ReplayBox[], b: DtlaBlock, layout: CityLayout, axis: 'a' | 'b'): void {
  const lineI = axis === 'a' ? b.i + 1 : b.i;
  const lineJ = axis === 'a' ? b.j : b.j + 1;
  const ax: 0 | 1 = axis === 'a' ? 1 : 0;
  const ys = [lineWalkY(lineI, lineJ, ax, false)];
  if (lineHasHigh(lineI, lineJ, ax)) ys.push(lineWalkY(lineI, lineJ, ax, true));
  const span = Math.max(8, b.street - 1.4);
  const width = 5.6;
  for (const y of ys) {
    const s = axis === 'a' ? b.la / 2 + b.street / 2 : 0;
    const t = axis === 'a' ? 0 : b.lb / 2 + b.street / 2;
    const [x, z] = world(b, s, t);
    if (layout.isReserved(x, z, 8) || layout.isOcean(x, z)) continue;
    const la = axis === 'a' ? span : width;
    const lb = axis === 'a' ? width : span;
    boxes.push({ s, t, lb, la, h: 1.35, base: y, style: Style.Solid, lit: 0.06, tint: 0.62, detail: 1 });
    const glow = { h: 0.55, base: y + 1.15, style: Style.Glow, lit: 0.8, tint: 1.62, detail: 1 as const };
    if (axis === 'a') {
      boxes.push({ s, t: t - width / 2, lb: 0.7, la: span, ...glow });
      boxes.push({ s, t: t + width / 2, lb: 0.7, la: span, ...glow });
    } else {
      boxes.push({ s: s - width / 2, t, lb: span, la: 0.7, ...glow });
      boxes.push({ s: s + width / 2, t, lb: span, la: 0.7, ...glow });
    }
  }
}

function propAt(b: DtlaBlock, s: number, t: number, y: number, yaw: number, o: Omit<DtlaProp, 'x' | 'y' | 'z' | 'yaw'>): DtlaProp {
  const [x, z] = world(b, s, t);
  return { ...o, x, y: b.ground + y, z, yaw };
}

const CONCRETE: [number, number, number] = [0.14, 0.13, 0.12];
const NONE: [number, number, number] = [0, 0, 0];

function dressLot(
  b: DtlaBlock, layout: CityLayout, lot: Lot, r: Rng, busy: boolean,
  boxes: ReplayBox[], signs: DtlaSign[], props: DtlaProp[], steam: DtlaSteam[], pools: DtlaPool[],
  life: CrowdLifeSpot[],
): void {
  const [wx, wz] = world(b, lot.s, lot.t);
  if (layout.isReserved(wx, wz, Math.min(lot.la, lot.lb) * 0.3) || layout.isOcean(wx, wz)) return;
  if (crossesOut(b, layout, lot.s, lot.t, lot.la * 0.9, lot.lb * 0.9)) return;
  const narrow = Math.min(lot.la, lot.lb) < 26;
  const footW = narrow ? lot.lb * 0.94 : Math.max(26, lot.lb * 0.9);
  const footD = narrow ? lot.la * 0.94 : Math.max(26, lot.la * 0.9);
  if (layout.isReserved(wx, wz, Math.max(footW, footD) * 0.55)) return;
  const placed = placeLot(r, {
    w: footW,
    d: footD,
    minH: narrow ? 64 : 180,
    maxH: narrow ? 120 : 248.4,
    plinth: 0,
    decks: [],
    phrases: PHRASES,
    lit: r.range(0.22, 0.48),
    tint: r.range(0.55, 0.85),
    holo: !narrow && r.chance(busy ? 0.45 : 0.22),
  });
  if (!placed) return;
  for (const box of placed.boxes) {
    boxes.push({
      s: lot.s + box.s, t: lot.t + box.t, lb: box.lb, la: box.la, h: box.h, base: box.base,
      style: box.style, lit: box.lit, tint: box.tint, detail: box.detail, ornament: box.ornament,
      kit: true, family: placed.draft.kind,
    });
  }
  for (const s of placed.signs) {
    signs.push({
      s: lot.s + s.s, t: lot.t + s.t, hb: s.hb, ha: s.ha, face: s.face, along: s.along,
      y: s.y, w: s.w, h: s.h, color: s.color, kind: s.kind, seed: s.seed,
    });
  }
  const door = doorFace(placed.draft);
  if (door) {
    // Clear of the flight, which runs the other way along the facade.
    const [dx, dz] = world(b, lot.s + door.s - 2.5, lot.t + door.t - 2.6);
    life.push(lifeSpot(dx, dz, Math.atan2(-b.ax, -b.az), 'queue', 3));
  }
  placeKiosks(b, lot, { baseHalfW: footW / 2, baseHalfD: footD / 2 }, r, busy, props, steam, pools, life);
  linkWalks(b, lot, boxes, footW, footD);
}

/** Street bridges sit on the block edge. A deck from the mass out to that edge keeps the walk on a wall. */
function linkWalks(b: DtlaBlock, lot: Lot, boxes: ReplayBox[], footW: number, footD: number): void {
  const ys = walksForLot(b, lot);
  const overlap = Math.max(4.5, Math.min(footW, footD) * 0.08);
  const reachOut = 1.15;
  const coversT = lot.t - lot.lb / 2 < 4 && lot.t + lot.lb / 2 > -4;
  const coversS = lot.s - lot.la / 2 < 4 && lot.s + lot.la / 2 > -4;
  const put = (s: number, t: number, lb: number, la: number, y: number): void => {
    if (lb < 0.8 || la < 0.8) return;
    boxes.push({
      s, t, lb, la, h: 0.28, base: y, style: Style.Solid, lit: 0.06, tint: 0.62, detail: 1,
    });
  };
  for (const y of ys) {
    if (coversT && lot.s + lot.la / 2 > b.la / 2 - 10) {
      const inner = lot.s + footD / 2 - overlap;
      const target = b.la / 2 + reachOut;
      const len = target - inner;
      if (len > 0.6) put(inner + len / 2, lot.t, Math.min(7.2, footW * 0.42), len, y);
    }
    if (coversT && lot.s - lot.la / 2 < -b.la / 2 + 10) {
      const inner = lot.s - footD / 2 + overlap;
      const target = -(b.la / 2 + reachOut);
      const len = inner - target;
      if (len > 0.6) put(target + len / 2, lot.t, Math.min(7.2, footW * 0.42), len, y);
    }
    if (coversS && lot.t + lot.lb / 2 > b.lb / 2 - 10) {
      const inner = lot.t + footW / 2 - overlap;
      const target = b.lb / 2 + reachOut;
      const len = target - inner;
      if (len > 0.6) put(lot.s, inner + len / 2, len, Math.min(7.2, footD * 0.42), y);
    }
    if (coversS && lot.t - lot.lb / 2 < -b.lb / 2 + 10) {
      const inner = lot.t - footW / 2 + overlap;
      const target = -(b.lb / 2 + reachOut);
      const len = inner - target;
      if (len > 0.6) put(lot.s, target + len / 2, len, Math.min(7.2, footD * 0.42), y);
    }
  }
}

function placeKiosks(
  b: DtlaBlock, lot: Lot, parts: { baseHalfW: number; baseHalfD: number }, r: Rng, busy: boolean,
  props: DtlaProp[], steam: DtlaSteam[], pools: DtlaPool[], life: CrowdLifeSpot[],
): void {
  // kit +Z = +s (baseHalfD), kit +X = −t (baseHalfW)
  const sides: Array<{ ns: number; nt: number; faceS: number; faceT: number; along: 's' | 't' }> = [
    { ns: 1, nt: 0, faceS: lot.s + parts.baseHalfD, faceT: lot.t, along: 't' },
    { ns: -1, nt: 0, faceS: lot.s - parts.baseHalfD, faceT: lot.t, along: 't' },
    { ns: 0, nt: 1, faceS: lot.s, faceT: lot.t + parts.baseHalfW, along: 's' },
    { ns: 0, nt: -1, faceS: lot.s, faceT: lot.t - parts.baseHalfW, along: 's' },
  ];
  const rgb = SIGN_RGB[r.int(0, 5)]!;
  let vents = 0;
  let queued = 0;
  for (const side of sides) {
    const outerS = lot.s + (side.ns > 0 ? lot.la / 2 : side.ns < 0 ? -lot.la / 2 : 0);
    const outerT = lot.t + (side.nt > 0 ? lot.lb / 2 : side.nt < 0 ? -lot.lb / 2 : 0);
    const room = side.along === 't'
      ? Math.abs(outerS - side.faceS)
      : Math.abs(outerT - side.faceT);
    if (room < 3.2) continue;
    const inset = Math.min(room * 0.55, 4.5);
    const ks = side.faceS + side.ns * inset;
    const kt = side.faceT + side.nt * inset;
    const streetish = room > 5 || busy;
    const n = streetish ? (busy ? 2 : 1) : (r.chance(0.4) ? 1 : 0);
    const span = side.along === 't' ? lot.lb : lot.la;
    for (let i = 0; i < n; i++) {
      let slide = (i - (n - 1) / 2) * Math.min(14, span * 0.28);
      // Door is centred. The flight occupies about +1.4 m to +8 m. Keep kiosks on the other side.
      if (side.ns < 0 && slide > -7.2 && slide < 9) slide = -7.2 - i * 2.4;
      const s = side.along === 't' ? ks : ks + slide;
      const t = side.along === 't' ? kt + slide : kt;
      if (Math.abs(s - lot.s) > lot.la / 2 - 1 || Math.abs(t - lot.t) > lot.lb / 2 - 1) continue;
      const yaw = yawNormal(b, side.ns, side.nt);
      const rank = streetish ? 0 : 1;
      if (streetish && queued < 2) {
        queued++;
        const [kx, kz] = world(b, s, t);
        const ox = Math.sin(yaw);
        const oz = Math.cos(yaw);
        life.push(lifeSpot(kx + ox * 2.1, kz + oz * 2.1, yaw, 'queue', busy ? 4 : 3));
        if (queued === 1) life.push(lifeSpot(kx + ox * 0.45, kz + oz * 0.45, yaw, 'awning', 3));
      }
      props.push(propAt(b, s, t, 1.15, yaw, {
        template: 'box', sx: 2.4, sy: 2.3, sz: 1.5, color: [0.1, 0.1, 0.11], emissive: NONE, metal: 0.35, rank,
      }));
      props.push(propAt(b, s + side.ns * 0.2, t + side.nt * 0.2, 2.45, yaw, {
        template: 'canopy', sx: 3.1, sy: 1, sz: 3.1, color: rgb, emissive: rgb.map((c) => c * 0.35) as [number, number, number], metal: 0, rank: rank + 1, pass: 'fade', alpha: 0.92,
      }));
      if (r.chance(0.7)) {
        props.push(propAt(b, s + side.ns * 0.85, t + side.nt * 0.85, 1.7, yaw, {
          template: 'quadZ', sx: 1.6, sy: 0.7, sz: 1, color: rgb, emissive: rgb, metal: 0, rank: rank + 1, pass: 'add',
        }));
      }
      const [px, pz] = world(b, s, t);
      pools.push({
        x: px, y: b.ground + 0.05, z: pz, yaw, len: 7, wid: 3.2, rgb, intensity: streetish ? 1.1 : 0.6, rank: 1,
      });
    }
    if (vents < (busy ? 3 : 2) && r.chance(0.65)) {
      const [vx, vz] = world(b, side.faceS + side.ns * 1.1, side.faceT + side.nt * 1.1);
      steam.push({ x: vx, y: b.ground, z: vz, seed: r.next(), rank: 0 });
      props.push(propAt(b, side.faceS + side.ns * 1.1, side.faceT + side.nt * 1.1, 0.04, 0, {
        template: 'quadY', sx: 1.8, sy: 1, sz: 1.8, color: [0.07, 0.07, 0.08], emissive: NONE, metal: 0.6, rank: 1,
      }));
      vents++;
    }
  }
}

function curbDress(b: DtlaBlock, r: Rng, props: DtlaProp[]): void {
  const yawA = yawNormal(b, 0, 1);
  const yawB = yawNormal(b, 1, 0);
  // parked vans in the curb lane, outside the mass and clear of the ±7.2 m driving line
  for (const side of [1, -1] as const) {
    if (!r.chance(0.55)) continue;
    const s = side * (b.la / 2 + 3.6);
    const t = r.range(-b.lb * 0.25, b.lb * 0.25);
    const yaw = yawB;
    props.push(propAt(b, s, t, 0.7, yaw, {
      template: 'box', sx: 1.8, sy: 1.35, sz: 4.4, color: [0.07, 0.07, 0.08], emissive: NONE, metal: 0.55, rank: 2,
    }));
    props.push(propAt(b, s, t, 1.55, yaw, {
      template: 'box', sx: 1.6, sy: 0.7, sz: 2.1, color: [0.04, 0.05, 0.06], emissive: [0.02, 0.03, 0.04], metal: 0.2, rank: 2,
    }));
  }
  const posts = b.la > 80 ? 4 : 3;
  for (let i = 0; i < posts; i++) {
    const t = -b.lb / 2 + ((i + 0.5) / posts) * b.lb;
    props.push(propAt(b, b.la / 2 + 1.15, t, 0.45, yawA, {
      template: 'cyl', sx: 0.38, sy: 0.9, sz: 0.38, color: CONCRETE, emissive: NONE, metal: 0.5, rank: 2,
    }));
  }
}

function sidewalkLoop(b: DtlaBlock): Array<[number, number]> {
  // Curb sidewalk, in the street margin. Masses stay inside ±la/2, so coats are not inside a wall.
  const s = b.la / 2 + 2.6, t = b.lb / 2 + 2.6;
  const corners: Array<[number, number]> = [[s, t], [s, -t], [-s, -t], [-s, t]];
  return corners.map(([ds, dt]) => {
    const [x, z] = world(b, ds, dt);
    return [x, z];
  });
}

/** Buildings, bridges, kiosks, steam and a sidewalk loop for one downtown block. */
export function dressBlock(b: DtlaBlock, layout: CityLayout): DtlaDress {
  const r = new Rng(b.seed);
  const boxes: ReplayBox[] = [];
  const signs: DtlaSign[] = [];
  const props: DtlaProp[] = [];
  const steam: DtlaSteam[] = [];
  const pools: DtlaPool[] = [];
  const life: CrowdLifeSpot[] = [];
  const busy = layout.districtAt(b.cx, b.cz).id === 'dtla' && financialEdge(layout, b.cx, b.cz) < 110;
  const lots: Lot[] = [];
  splitLots(r, 0, 0, b.la, b.lb, 36, 108, lots);
  const gap = r.range(3.5, 7);
  for (const lot of lots) {
    lot.la = Math.max(12, lot.la - gap);
    lot.lb = Math.max(12, lot.lb - gap);
    if (r.chance(0.035)) continue;
    dressLot(b, layout, lot, r, busy, boxes, signs, props, steam, pools, life);
  }
  bridge(boxes, b, layout, 'a');
  bridge(boxes, b, layout, 'b');
  curbDress(b, r, props);
  // a vent in the alley if the block was quiet
  if (steam.length < 2) {
    const [x, z] = world(b, r.range(-8, 8), r.range(-8, 8));
    if (!layout.isReserved(x, z, 2)) steam.push({ x, y: b.ground, z, seed: hash2i(b.i, b.j, 5) / 4294967296, rank: 0 });
  }
  return { boxes, signs, props, steam, pools, loops: [sidewalkLoop(b)], life };
}
