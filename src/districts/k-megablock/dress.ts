// Pure street kit. Sidewalks on the 12 m streets, and the covered market along the slab's south face.
// The market sits inside the reserve, so it is world-space props, not fabric boxes.
import { Rng } from '../../core/rng';
import type { CityLayout } from '../../world/layout';
import { bearingToYaw } from '../../world/geo';
import { HD, localToWorld } from './spec';

export interface KBlock {
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

export interface KProp {
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

export interface KPool {
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

export interface KSteam {
  x: number;
  y: number;
  z: number;
  seed: number;
  rank: number;
}

const CON: [number, number, number] = [0.28, 0.27, 0.26];
const TARP: [number, number, number] = [0.32, 0.26, 0.18];
const NONE: [number, number, number] = [0, 0, 0];
const SODIUM: [number, number, number] = [1.15, 0.62, 0.22];
const COLD: [number, number, number] = [0.55, 0.7, 0.78];

function world(b: KBlock, s: number, t: number): [number, number] {
  return [b.cx + b.ax * s + b.bx * t, b.cz + b.az * s + b.bz * t];
}

export function dressBlock(b: KBlock, layout: CityLayout): {
  props: KProp[];
  pools: KPool[];
  steam: KSteam[];
  loop: Array<[number, number]> | null;
} {
  const r = new Rng(b.seed);
  const props: KProp[] = [];
  const pools: KPool[] = [];
  const steam: KSteam[] = [];
  const curb = 1.6;
  const spots: Array<{ s: number; t: number; yaw: number; along: 'a' | 'b' }> = [];
  const nA = Math.max(2, Math.floor(b.lb / 22));
  for (let i = 0; i < nA; i++) {
    const t = -b.lb / 2 + ((i + 0.5) * b.lb) / nA;
    spots.push({ s: b.la / 2 + curb, t, yaw: Math.atan2(b.ax, b.az), along: 'a' });
  }
  const nB = Math.max(2, Math.floor(b.la / 26));
  for (let i = 0; i < nB; i++) {
    const s = -b.la / 2 + ((i + 0.5) * b.la) / nB;
    spots.push({ s, t: b.lb / 2 + curb, yaw: Math.atan2(b.bx, b.bz), along: 'b' });
  }
  spots.forEach((e, i) => {
    const [x, z] = world(b, e.s, e.t);
    if (layout.isReserved(x, z, 1.5) || layout.isOcean(x, z)) return;
    const push = (s: number, t: number, y: number, p: Omit<KProp, 'x' | 'y' | 'z' | 'yaw'>) => {
      const [px, pz] = world(b, s, t);
      props.push({ ...p, x: px, y: b.ground + y, z: pz, yaw: e.yaw });
    };
    if (i % 3 === 0) {
      push(e.s, e.t, 3.6, { template: 'cyl', sx: 0.22, sy: 7.2, sz: 0.22, color: CON, emissive: NONE, metal: 0.45, rank: 0 });
      push(e.s, e.t, 7.15, { template: 'box', sx: 1.35, sy: 0.18, sz: 0.42, color: [0.55, 0.32, 0.14], emissive: SODIUM, metal: 0.1, rank: 0 });
      pools.push({
        x, y: b.ground + 0.04, z, yaw: e.yaw, wid: 6.5, len: 2.6,
        rgb: [0.85, 0.45, 0.16], intensity: 0.42, rank: 1,
      });
    } else if (i % 3 === 1) {
      push(e.s, e.t, 0.45, { template: 'box', sx: 0.38, sy: 0.9, sz: 0.38, color: CON, emissive: NONE, metal: 0.2, rank: 1 });
    }
    if (r.chance(0.18)) {
      const s = e.along === 'a' ? e.s - 1.4 : e.s;
      const t = e.along === 'b' ? e.t - 1.4 : e.t;
      push(s, t, 1.15, { template: 'box', sx: 1.6, sy: 1.3, sz: 0.9, color: [0.24, 0.2, 0.16], emissive: NONE, metal: 0.05, rank: 1 });
      push(s, t, 2.15, { template: 'canopy', sx: 3.2, sy: 1, sz: 3.2, color: TARP, emissive: NONE, metal: 0, rank: 1 });
    }
    if (r.chance(0.1)) steam.push({ x, y: b.ground + 0.2, z, seed: r.next(), rank: 2 });
  });

  const tower = layout.landmarkById('k-megablock-tower');
  const buried = tower && Math.hypot(b.cx - tower.x, b.cz - tower.z) < tower.reserveRadius - 12;
  let loop: Array<[number, number]> | null = null;
  if (!buried) {
    const s = b.la / 2 + 2.2, t = b.lb / 2 + 2.2;
    loop = [[s, t], [s, -t], [-s, -t], [-s, t]].map(([ds, dt]) => world(b, ds, dt));
  }
  return { props, pools, steam, loop };
}

export interface MarketKit {
  props: KProp[];
  pools: KPool[];
  steam: KSteam[];
  loops: Array<Array<[number, number]>>;
}

function prop(
  list: KProp[], ox: number, oz: number, yaw: number, g: number,
  lx: number, y: number, lz: number, p: Omit<KProp, 'x' | 'y' | 'z' | 'yaw'>, yawAdd = 0,
): void {
  const [x, z] = localToWorld(ox, oz, yaw, lx, lz);
  list.push({ ...p, x, y: g + y, z, yaw: yaw + yawAdd });
}

/** Covered market on the south face of the hero slab. Walk-up counter, not an interior. */
export function marketKit(layout: CityLayout): MarketKit {
  const l = layout.landmarkById('k-megablock-tower');
  const props: KProp[] = [];
  const pools: KPool[] = [];
  const steam: KSteam[] = [];
  const loops: Array<Array<[number, number]>> = [];
  if (!l) return { props, pools, steam, loops };
  const yaw = bearingToYaw(l.bearingDeg);
  const g = layout.heightAt(l.x, l.z);
  const add = (lx: number, y: number, lz: number, p: Omit<KProp, 'x' | 'y' | 'z' | 'yaw'>, yawAdd = 0) => {
    prop(props, l.x, l.z, yaw, g, lx, y, lz, p, yawAdd);
  };
  const face = HD;

  for (const x of [-88, -60, -20, 16, 52, 88]) {
    add(x, 2.55, face + 0.15, { template: 'awning', sx: 5.4, sy: 1, sz: 2.4, color: TARP, emissive: NONE, metal: 0, rank: 0 });
    add(x, 0.55, face + 1.7, { template: 'box', sx: 2.2, sy: 1.05, sz: 0.8, color: CON, emissive: NONE, metal: 0.05, rank: 0 });
    if (x > -90 && x % 40 < 20) {
      add(x + 1.6, 1.7, face + 1.6, {
        template: 'quadZ', sx: 1.1, sy: 0.7, sz: 1, color: [0.7, 0.45, 0.2], emissive: [0.5, 0.22, 0.05], metal: 0, rank: 1,
      });
    }
  }

  // noodle counter, west of the lobby gap
  const nx = -70;
  add(nx, 2.7, face + 0.2, { template: 'awning', sx: 6.2, sy: 1, sz: 3.1, color: [0.42, 0.18, 0.12], emissive: [0.15, 0.04, 0.02], metal: 0, rank: 0 });
  add(nx, 0.55, face + 1.55, { template: 'box', sx: 4.2, sy: 1.08, sz: 0.75, color: [0.2, 0.16, 0.13], emissive: NONE, metal: 0.1, rank: 0 });
  add(nx, 2.45, face + 0.85, { template: 'box', sx: 3.4, sy: 0.06, sz: 0.28, color: [1, 0.6, 0.25], emissive: SODIUM, metal: 0, rank: 0 });
  add(nx, 1.55, face + 0.95, {
    template: 'quadZ', sx: 1.6, sy: 0.7, sz: 1, color: [0.85, 0.55, 0.25], emissive: [0.7, 0.28, 0.06], metal: 0, rank: 0,
  });
  for (let i = 0; i < 4; i++) {
    const u = (i - 1.5) * 0.85;
    add(nx + u, 0, face + 2.35, { template: 'stool', sx: 1, sy: 1, sz: 1, color: [0.14, 0.1, 0.08], emissive: NONE, metal: 0.3, rank: 0 });
  }
  for (const u of [-0.7, 0.55]) {
    add(nx + u, 1.15, face + 1.55, { template: 'cyl', sx: 0.32, sy: 0.28, sz: 0.32, color: [0.16, 0.12, 0.1], emissive: [0.35, 0.1, 0.02], metal: 0.5, rank: 0 });
    const [sx, sz] = localToWorld(l.x, l.z, yaw, nx + u, face + 1.55);
    steam.push({ x: sx, y: g + 1.35, z: sz, seed: 0.2 + u, rank: 0 });
  }

  // vending bank
  for (let i = 0; i < 5; i++) {
    const x = -43 + i * 1.15;
    add(x, 0.95, face + 0.85, {
      template: 'box', sx: 0.95, sy: 1.9, sz: 0.7,
      color: [0.16, 0.17, 0.18], emissive: i % 2 ? COLD : [0.4, 0.2, 0.08], metal: 0.4, rank: 0,
    });
  }

  // kiosk, pipes, cable sag, sodium poles
  add(8, 1.1, face + 2.4, { template: 'box', sx: 1.8, sy: 2.2, sz: 1.6, color: [0.22, 0.2, 0.18], emissive: NONE, metal: 0.15, rank: 0 });
  add(8, 2.35, face + 2.4, { template: 'canopy', sx: 4.2, sy: 1, sz: 4.2, color: TARP, emissive: NONE, metal: 0, rank: 1 });
  add(64, 0.55, face + 0.4, { template: 'cyl', sx: 0.22, sy: 10, sz: 0.22, color: [0.32, 0.32, 0.34], emissive: NONE, metal: 0.7, rank: 1, pitch: Math.PI / 2 }, Math.PI / 2);
  add(96, 2.4, face + 2.3, { template: 'cyl', sx: 0.08, sy: 4.6, sz: 0.08, color: [0.12, 0.12, 0.13], emissive: NONE, metal: 0.55, rank: 1, pitch: Math.PI / 2 + 0.18 });
  add(104, 1.7, face + 2.3, { template: 'cyl', sx: 0.08, sy: 4.6, sz: 0.08, color: [0.12, 0.12, 0.13], emissive: NONE, metal: 0.55, rank: 1, pitch: Math.PI / 2 - 0.22 });

  for (const x of [-80, -20, 40, 96]) {
    add(x, 3.7, face + 4.5, { template: 'cyl', sx: 0.2, sy: 7.4, sz: 0.2, color: CON, emissive: NONE, metal: 0.5, rank: 0 });
    add(x, 7.3, face + 4.5, { template: 'box', sx: 1.5, sy: 0.16, sz: 0.4, color: [0.6, 0.34, 0.14], emissive: SODIUM, metal: 0.1, rank: 0 });
    const [px, pz] = localToWorld(l.x, l.z, yaw, x, face + 4.6);
    pools.push({ x: px, y: g + 0.05, z: pz, yaw, wid: 7, len: 3, rgb: [0.9, 0.48, 0.16], intensity: 0.5, rank: 0 });
  }
  const [vx, vz] = localToWorld(l.x, l.z, yaw, -40, face + 1.4);
  pools.push({ x: vx, y: g + 0.05, z: vz, yaw, wid: 8, len: 2.4, rgb: [0.35, 0.55, 0.7], intensity: 0.28, rank: 1 });

  const aisle = face + 5.4;
  const loop: Array<[number, number]> = [
    [-88, aisle], [100, aisle], [100, aisle - 1.6], [-88, aisle - 1.6],
  ];
  loops.push(loop.map(([lx, lz]) => localToWorld(l.x, l.z, yaw, lx, lz)));
  return { props, pools, steam, loops };
}
