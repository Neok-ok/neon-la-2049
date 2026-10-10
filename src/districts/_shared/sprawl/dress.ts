// LOD0 kit for sprawl blocks. Pure: no three.js. The district detail module turns these into meshes.
// Omitted strips and hubs stay quiet: one sidewalk loop, almost no props.
import { Rng } from '../../../core/rng';
import { lifeSpot, type CrowdLifeSpot } from '../../../world/crowdLife';
import type { CityLayout } from '../../../world/layout';
import type { FaceDir } from '../../../world/fabric/types';
import type { SprawlBlock, SprawlPlan, SprawlStall } from './plan';

export interface SprawlProp {
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
  rank: number;
}

export interface SprawlPool {
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

export interface SprawlSteam {
  x: number;
  y: number;
  z: number;
  seed: number;
  rank: number;
}

const NONE: [number, number, number] = [0, 0, 0];
const AMBER: [number, number, number] = [0.85, 0.4, 0.1];
const TARP: [number, number, number] = [0.28, 0.18, 0.1];

function world(b: SprawlBlock, s: number, t: number): [number, number] {
  return [b.cx + b.ax * s + b.bx * t, b.cz + b.az * s + b.bz * t];
}

function yawOf(b: SprawlBlock, face: FaceDir): number {
  if (face === 'a+') return Math.atan2(b.ax, b.az);
  if (face === 'a-') return Math.atan2(-b.ax, -b.az);
  if (face === 'b+') return Math.atan2(b.bx, b.bz);
  return Math.atan2(-b.bx, -b.bz);
}

function open(layout: CityLayout, x: number, z: number): boolean {
  return !layout.isReserved(x, z, 1.2) && !layout.isOcean(x, z);
}

export function dressSprawl(b: SprawlBlock, plan: SprawlPlan, layout: CityLayout): {
  props: SprawlProp[];
  pools: SprawlPool[];
  steam: SprawlSteam[];
  loops: Array<Array<[number, number]>>;
  life: CrowdLifeSpot[];
} {
  const props: SprawlProp[] = [];
  const pools: SprawlPool[] = [];
  const steam: SprawlSteam[] = [];
  const loops: Array<Array<[number, number]>> = [];
  const life: CrowdLifeSpot[] = [];
  if (b.ground > 45 || !plan.boxes.length && !plan.stalls.length && !plan.hub) {
    return { props, pools, steam, loops, life: [] };
  }
  const rng = new Rng((b.seed ^ 0x5e11) >>> 0 || 1);
  const put = (s: number, t: number, y: number, yaw: number, p: Omit<SprawlProp, 'x' | 'y' | 'z' | 'yaw'>) => {
    const [x, z] = world(b, s, t);
    if (!open(layout, x, z)) return;
    props.push({ ...p, x, y: b.ground + y, z, yaw });
  };

  let stallQueues = 0;
  for (const stall of plan.stalls) {
    const yaw = yawOf(b, stall.face);
    if (stallQueues < 2) {
      stallQueues++;
      const [sx, sz] = world(b, stall.s, stall.t);
      const ox = Math.sin(yaw);
      const oz = Math.cos(yaw);
      life.push(lifeSpot(sx + ox * 1.8, sz + oz * 1.8, yaw, 'queue', plan.hub ? 4 : 2));
      if (stallQueues === 1) life.push(lifeSpot(sx + ox * 0.55, sz + oz * 0.55, yaw, 'awning', 3));
    }
    put(stall.s, stall.t, 2.35, yaw, {
      template: 'awning', sx: 3.2, sy: 1, sz: 1.7, color: TARP, emissive: NONE, metal: 0, rank: 0,
    });
    put(stall.s, stall.t, 2.15, yaw, {
      template: 'box', sx: 3.0, sy: 0.06, sz: 0.28, color: [1, 0.62, 0.28], emissive: AMBER, metal: 0, rank: 0,
    });
  }

  const busy = plan.strip || plan.hub;
  if (busy && plan.stalls.length) {
    const sample = plan.stalls[Math.floor(plan.stalls.length / 2)]!;
    const [x, z] = world(b, sample.s, sample.t);
    pools.push({
      x, y: b.ground + 0.04, z, yaw: yawOf(b, sample.face),
      wid: 7.5, len: 2.4, rgb: [0.9, 0.45, 0.12], intensity: plan.hub ? 0.34 : 0.26, rank: 1,
    });
  } else if (rng.chance(0.18)) {
    const [x, z] = world(b, b.la * 0.15, b.lb / 2 + 2.2);
    if (open(layout, x, z)) {
      pools.push({
        x, y: b.ground + 0.04, z, yaw: 0.2,
        wid: 3.2, len: 1.6, rgb: [0.45, 0.28, 0.12], intensity: 0.12, rank: 1,
      });
    }
  }

  if (!busy && rng.chance(0.22)) {
    put(b.la * 0.2, b.lb / 2 + 2.4, 0.5, 0, {
      template: 'box', sx: 0.65, sy: 0.9, sz: 0.5, color: [0.16, 0.15, 0.14], emissive: NONE, metal: 0.1, rank: 1,
    });
  }
  if (busy && rng.chance(0.55)) {
    put(0, b.lb / 2 + 2.6, 0.5, 0.4, {
      template: 'box', sx: 0.7, sy: 1.0, sz: 0.5, color: [0.15, 0.14, 0.13], emissive: NONE, metal: 0.1, rank: 1,
    });
  }

  if (plan.roof && rng.chance(busy ? 0.65 : 0.28)) {
    put(plan.roof.s, plan.roof.t + 1.6, plan.roof.h + 1.1, Math.atan2(b.bx, b.bz), {
      template: 'cyl', sx: 0.04, sy: 6.5, sz: 0.04,
      color: [0.12, 0.12, 0.13], emissive: NONE, metal: 0.45, rank: 2,
      pitch: Math.PI / 2 + 0.35,
    });
  }

  if (plan.hub && plan.yard) {
    const [x, z] = world(b, plan.yard.s, plan.yard.t);
    steam.push({ x, y: b.ground + 0.4, z, seed: 0.37, rank: 2 });
    pools.push({
      x, y: b.ground + 0.04, z, yaw: 0.15,
      wid: 10, len: 6, rgb: [0.75, 0.38, 0.1], intensity: 0.3, rank: 1,
    });
  }

  const curb = Math.min(3.4, b.street * 0.22);
  const ring = (inset: number): Array<[number, number]> => {
    const s = b.la / 2 + inset;
    const t = b.lb / 2 + inset;
    return [[s, t], [s, -t], [-s, -t], [-s, t]]
      .map(([ds, dt]) => world(b, ds, dt))
      .filter(([x, z]) => open(layout, x, z));
  };
  const side = ring(curb);
  if (side.length >= 4) loops.push(side);
  if (plan.stalls.length >= 3) {
    const line = stallLine(b, plan.stalls);
    if (line.length >= 3) loops.push(line);
  }
  if (plan.hub && plan.yard) {
    const c = 14;
    const yard = [[plan.yard.s + c, plan.yard.t + 8], [plan.yard.s + c, plan.yard.t - 8], [plan.yard.s - c, plan.yard.t - 8], [plan.yard.s - c, plan.yard.t + 8]]
      .map(([ds, dt]) => world(b, ds, dt))
      .filter(([x, z]) => open(layout, x, z));
    if (yard.length >= 4) loops.push(yard);
  }
  return { props, pools, steam, loops, life };
}

function stallLine(b: SprawlBlock, stalls: SprawlStall[]): Array<[number, number]> {
  const face = stalls[0]!.face;
  const ordered = stalls.slice(0, 4);
  return ordered.map((st) => {
    const off = 1.8;
    let s = st.s;
    let t = st.t;
    if (face === 'a+') s += off;
    else if (face === 'a-') s -= off;
    else if (face === 'b+') t += off;
    else t -= off;
    return world(b, s, t);
  });
}
