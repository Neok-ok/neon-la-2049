// Street kit for a residential block. Pure: the same marks the archetype already placed.
// Sodium, not cold: K's streets are sodium, and the seam should use the same lamp.
// The shared street-lamp module already plants those poles. This file adds the quieter kit.
import { Rng } from '../../../core/rng';
import type { CityLayout } from '../../../world/layout';
import type { ResidentialPlan, ResBlock, StallMark } from './plan';

export interface ResProp {
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

export interface ResPool {
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

export interface ResSteam {
  x: number;
  y: number;
  z: number;
  seed: number;
  rank: number;
}

const CON: [number, number, number] = [0.22, 0.21, 0.2];
const TARP: [number, number, number] = [0.28, 0.22, 0.16];
const NONE: [number, number, number] = [0, 0, 0];
const SODIUM: [number, number, number] = [1.05, 0.55, 0.18];

function world(b: ResBlock, s: number, t: number): [number, number] {
  return [b.cx + b.ax * s + b.bx * t, b.cz + b.az * s + b.bz * t];
}

function yawOf(b: ResBlock, face: StallMark['face']): number {
  // 0 +A, 1 +B, 2 −A, 3 −B. Awning local +Z points out of the stall, into the street.
  if (face === 0) return Math.atan2(b.ax, b.az);
  if (face === 1) return Math.atan2(b.bx, b.bz);
  if (face === 2) return Math.atan2(-b.ax, -b.az);
  return Math.atan2(-b.bx, -b.bz);
}

function open(layout: CityLayout, x: number, z: number): boolean {
  return !layout.isReserved(x, z, 1.2) && !layout.isOcean(x, z);
}

export function dressResidential(b: ResBlock, plan: ResidentialPlan, layout: CityLayout): {
  props: ResProp[];
  pools: ResPool[];
  steam: ResSteam[];
  loops: Array<Array<[number, number]>>;
} {
  const rng = new Rng((b.seed ^ 0x51a7c3) >>> 0 || 1);
  const props: ResProp[] = [];
  const pools: ResPool[] = [];
  const steam: ResSteam[] = [];
  const loops: Array<Array<[number, number]>> = [];

  const put = (s: number, t: number, y: number, yaw: number, p: Omit<ResProp, 'x' | 'y' | 'z' | 'yaw'>) => {
    const [x, z] = world(b, s, t);
    if (!open(layout, x, z)) return;
    props.push({ ...p, x, y: b.ground + y, z, yaw });
  };

  // Bollards and bins on the sidewalk, not a second lamp row.
  const curb = Math.min(3.2, b.street * 0.16);
  const nA = Math.max(2, Math.floor(b.la / 48));
  for (let i = 0; i < nA; i++) {
    const s = -b.la / 2 + ((i + 0.5) * b.la) / nA;
    for (const side of [-1, 1]) {
      const t = side * (b.lb / 2 + curb);
      if ((i + (side > 0 ? 1 : 0)) % 2 === 0) {
        put(s, t, 0.45, 0, { template: 'box', sx: 0.28, sy: 0.9, sz: 0.28, color: CON, emissive: NONE, metal: 0.25, rank: 1 });
      }
      if (rng.chance(0.22)) {
        put(s, t - side * 0.8, 0.55, 0, { template: 'box', sx: 0.7, sy: 1.05, sz: 0.55, color: [0.16, 0.15, 0.14], emissive: NONE, metal: 0.1, rank: 1 });
      }
    }
  }
  if (rng.chance(0.35)) {
    const [x, z] = world(b, b.la / 2 + curb, b.lb * 0.2);
    if (open(layout, x, z)) {
      put(b.la / 2 + curb, b.lb * 0.2, 0.7, Math.atan2(b.ax, b.az), {
        template: 'box', sx: 0.9, sy: 1.3, sz: 0.55, color: [0.18, 0.18, 0.17], emissive: NONE, metal: 0.2, rank: 1,
      });
    }
  }
  if (rng.chance(0.16)) {
    const [x, z] = world(b, 0, b.lb / 2 + curb);
    if (open(layout, x, z)) steam.push({ x, y: b.ground + 0.2, z, seed: rng.next(), rank: 2 });
  }
  // A short sag over the sidewalk. A span across the lot reads as a sky bridge.
  if (rng.chance(0.2)) {
    const s = b.la / 2 + curb;
    const t = rng.range(-b.lb * 0.25, b.lb * 0.25);
    put(s, t, 6.4, Math.atan2(b.bx, b.bz), {
      template: 'cyl', sx: 0.035, sy: 7.5, sz: 0.035,
      color: [0.1, 0.1, 0.11], emissive: NONE, metal: 0.5, rank: 2,
      pitch: Math.PI / 2 + 0.22,
    });
  }

  for (const stall of plan.stalls) {
    const yaw = yawOf(b, stall.face);
    put(stall.s, stall.t, 2.45, yaw, {
      template: 'awning', sx: 3.4, sy: 1, sz: 1.8, color: TARP, emissive: NONE, metal: 0, rank: 0,
    });
    if (plan.hub && stall.face === 1) {
      put(stall.s, stall.t, 2.15, yaw, {
        template: 'box', sx: 3.2, sy: 0.08, sz: 0.35, color: [1, 0.62, 0.28], emissive: SODIUM, metal: 0, rank: 0,
      });
    }
  }

  if (plan.court) {
    const [x, z] = world(b, plan.court.s, plan.court.t);
    pools.push({
      x, y: b.ground + 0.05, z, yaw: Math.atan2(b.ax, b.az),
      wid: 7.5, len: 4.2, rgb: [0.35, 0.32, 0.28], intensity: 0.22, rank: 1,
    });
    if (rng.chance(0.4)) {
      pools.push({
        x: x + b.bx * 6, y: b.ground + 0.05, z: z + b.bz * 6, yaw: 0.4,
        wid: 3.2, len: 2.1, rgb: [0.4, 0.28, 0.16], intensity: 0.18, rank: 1,
      });
    }
  }

  if (plan.hub) {
    const [x, z] = world(b, 4, -4);
    pools.push({
      x, y: b.ground + 0.05, z, yaw: 0.2,
      wid: 9, len: 5, rgb: [0.55, 0.32, 0.12], intensity: 0.28, rank: 1,
    });
    steam.push({ x, y: b.ground + 0.3, z: z + 6, seed: 0.31, rank: 2 });
  }

  const s = b.la / 2 + 3.1;
  const t = b.lb / 2 + 3.1;
  const ring: Array<[number, number]> = [[s, t], [s, -t], [-s, -t], [-s, t]];
  const loop = ring.map(([ds, dt]) => world(b, ds, dt)).filter(([x, z]) => open(layout, x, z));
  if (loop.length >= 4) loops.push(loop);

  if (plan.stalls.length >= 3) {
    const sample = plan.stalls.slice(0, 4).map((st) => world(b, st.s, st.t + 1.6));
    if (sample.length >= 3) loops.push(sample);
  }
  if (plan.court) {
    const c = 8;
    loops.push([
      world(b, plan.court.s + c, plan.court.t + c),
      world(b, plan.court.s + c, plan.court.t - c),
      world(b, plan.court.s - c, plan.court.t - c),
      world(b, plan.court.s - c, plan.court.t + c),
    ]);
  }
  return { props, pools, steam, loops };
}
