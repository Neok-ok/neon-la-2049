// Pure apron plan. The archetype and the detail module both call this.
// No three.js. The chunk worker and the main thread have to agree.
import { Rng } from '../../core/rng';
import { Style, SignColor, type FaceDir, type StyleId } from '../../world/fabric/types';
import { phraseSeed } from '../../world/materials/signPhrases';
import {
  BAY, HALL_A, HALL_B, HALL_S, HANGAR_H, PYLON_H, SHED_H, TERMINAL_H,
  isPad, isTerminal,
} from './spec';

export interface LaxBlock {
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

export interface LaxBox {
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

export interface LaxSign {
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

export interface LaxProp {
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
  rank: 0 | 1 | 2;
}

export interface LaxPool {
  x: number;
  y: number;
  z: number;
  yaw: number;
  wid: number;
  len: number;
  rgb: [number, number, number];
  intensity: number;
  rank: 0 | 1 | 2;
}

export interface LaxPlan {
  boxes: LaxBox[];
  signs: LaxSign[];
  props: LaxProp[];
  pools: LaxPool[];
}

/** SECTOR 5, 2049, OPEN LATE, VENDING. Atlas cells only. */
const WAY = [39, 62, 2, 58] as const;

function at(b: LaxBlock, s: number, t: number): { x: number; z: number } {
  return {
    x: b.cx + b.ax * s + b.bx * t,
    z: b.cz + b.az * s + b.bz * t,
  };
}

function box(
  s: number, t: number, lb: number, la: number, h: number,
  style: StyleId, lit: number, tint: number, detail: 0 | 1 | 2, base = 0,
): LaxBox {
  return { s, t, lb, la, h, style, lit, tint, detail, base };
}

export function planLax(b: LaxBlock): LaxPlan {
  const boxes: LaxBox[] = [];
  const signs: LaxSign[] = [];
  const props: LaxProp[] = [];
  const pools: LaxPool[] = [];
  const r = new Rng(b.seed);
  const pad = isPad(b.i, b.j);
  const terminal = isTerminal(b.i, b.j);
  const open = !pad && !terminal && r.chance(0.4);

  if (terminal) {
    // A recess in the north face so the concourse door is not inside a solid box.
    const recess = 12;
    const doorW = 4.2;
    const overlap = 0.4;
    const bodyA = HALL_A - recess + overlap;
    const bodyS = HALL_S - recess / 2 + overlap / 2;
    const wingLa = recess + overlap;
    const wingB = (HALL_B - doorW) / 2;
    const wingT = doorW / 2 + wingB / 2;
    const wingS = HALL_S + HALL_A / 2 - recess / 2 - overlap / 2;
    boxes.push(box(bodyS, 0, HALL_B, bodyA, TERMINAL_H, Style.Megablock, 0.22, 0.78, 0));
    boxes.push(box(wingS, wingT, wingB, wingLa, TERMINAL_H, Style.Megablock, 0.22, 0.78, 0));
    boxes.push(box(wingS, -wingT, wingB, wingLa, TERMINAL_H, Style.Megablock, 0.22, 0.78, 0));
    boxes.push(box(-40, 0, 150, 80, HANGAR_H, Style.Industrial, 0.06, 0.7, 0));
    boxes.push(box(wingS + wingLa / 2 + 0.28, wingT, wingB - 6, 0.4, 2.2, Style.Glow, 0.9, 1.45, 1, 5));
    boxes.push(box(wingS + wingLa / 2 + 0.28, -wingT, wingB - 6, 0.4, 2.2, Style.Glow, 0.9, 1.45, 1, 5));
    const phrase = WAY[(Math.abs(b.j) + 64) % WAY.length]!;
    signs.push({
      s: wingS, t: wingT, hb: wingB / 2, ha: wingLa / 2,
      face: 'a+', along: 0,
      y: 16, w: 12, h: 3.2, color: SignColor.White, kind: 0, seed: phraseSeed(phrase),
    });
    signs.push({
      s: wingS, t: -wingT, hb: wingB / 2, ha: wingLa / 2,
      face: 'a+', along: 0,
      y: 16, w: 8, h: 2.2, color: SignColor.Cyan, kind: 0, seed: phraseSeed(WAY[(Math.abs(b.j) + 1) % WAY.length]!),
    });
    const curb = at(b, HALL_S + HALL_A / 2 + 6, 0);
    pools.push({
      x: curb.x, y: b.ground + 0.08, z: curb.z, yaw: 0,
      wid: 22, len: 8, rgb: [0.72, 0.84, 1], intensity: 0.62, rank: 1,
    });
  } else if (!pad && !open) {
    boxes.push(box(70, 0, 148, 64, HANGAR_H, Style.Industrial, 0.05, 0.66, 0));
    boxes.push(box(-70, 0, 148, 64, HANGAR_H, Style.Industrial, 0.04, 0.62, 0));
    boxes.push(box(70, 0, 90, 28, 1.6, Style.Glow, 0.35, 1.2, 1, HANGAR_H));
    boxes.push(box(0, 72, 16, 22, SHED_H, Style.Industrial, 0.08, 0.74, 1));
    if (r.chance(0.55)) {
      signs.push({
        s: 70, t: 0, hb: 74, ha: 32, face: 'b+', along: 0,
        y: 8, w: 8, h: 2.2, color: SignColor.Cyan, kind: 0, seed: phraseSeed(WAY[Math.abs(b.j) % WAY.length]!),
      });
    }
    for (const s of [36, -36]) {
      const p = at(b, s, 86);
      props.push({
        template: 'box', x: p.x, y: b.ground + 0.9, z: p.z, yaw: 0,
        sx: 4.6, sy: 1.8, sz: 2.1,
        color: [0.22, 0.24, 0.26], emissive: [0.04, 0.05, 0.06], metal: 0.35, rank: 1,
      });
    }
  } else if (!pad && r.chance(0.5)) {
    boxes.push(box(r.range(-40, 40), r.range(-20, 20), 8, 6, BAY, Style.Industrial, 0.02, 0.6, 1));
  }

  if (!pad) {
    const insetA = b.la / 2 - 16;
    const insetB = b.lb / 2 - 8;
    for (const s of [-insetA, insetA]) {
      for (const t of [-insetB, insetB]) {
        const p = at(b, s, t);
        props.push({
          template: 'cyl', x: p.x, y: b.ground + PYLON_H / 2, z: p.z, yaw: 0,
          sx: 0.55, sy: PYLON_H, sz: 0.55,
          color: [0.16, 0.18, 0.2], emissive: [0.22, 0.3, 0.4], metal: 0.45, rank: 0,
        });
        props.push({
          template: 'box', x: p.x, y: b.ground + PYLON_H, z: p.z, yaw: 0,
          sx: 1.5, sy: 0.45, sz: 1.5,
          color: [0.7, 0.78, 0.86], emissive: [1.15, 1.25, 1.4], metal: 0.2, rank: 0,
        });
      }
    }
  }

  return { boxes, signs, props, pools };
}
