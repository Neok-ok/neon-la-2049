// Pure street furniture for Civic Center. Cold pylons, bollards, a bench, almost no neon.
// Owned edges only (a+ and b+), same rule as the market, so a street is not dressed twice.
import { Rng } from '../../core/rng';
import type { CityLayout } from '../../world/layout';
import { localToWorld, yawOf } from './spec';

export interface CivicBlock {
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

export interface CivicProp {
  template: 'box' | 'cyl' | 'quadY';
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
  rank: number;
  pass?: 'opaque' | 'add';
}

export interface CivicPool {
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

export interface CivicSteam {
  x: number;
  y: number;
  z: number;
  seed: number;
  rank: number;
}

const GREY: [number, number, number] = [0.22, 0.23, 0.26];
const NONE: [number, number, number] = [0, 0, 0];
const LAMP: [number, number, number] = [0.62, 0.74, 0.92];

function world(b: CivicBlock, s: number, t: number): [number, number] {
  return [b.cx + b.ax * s + b.bx * t, b.cz + b.az * s + b.bz * t];
}

function put(
  b: CivicBlock, s: number, t: number, y: number, yaw: number,
  o: Omit<CivicProp, 'x' | 'y' | 'z' | 'yaw'>,
): CivicProp {
  const [x, z] = world(b, s, t);
  return { ...o, x, y: b.ground + y, z, yaw };
}

export function dressBlock(b: CivicBlock, layout: CityLayout): { props: CivicProp[]; pools: CivicPool[]; steam: CivicSteam[]; loop: Array<[number, number]> | null } {
  const r = new Rng(b.seed);
  const props: CivicProp[] = [];
  const pools: CivicPool[] = [];
  const steam: CivicSteam[] = [];
  const edges: Array<{ s: number; t: number; yaw: number; along: 'a' | 'b' }> = [];
  const curb = 1.8;
  // a+ and b+ only
  const nA = Math.max(2, Math.floor(b.lb / 28));
  for (let i = 0; i < nA; i++) {
    const t = -b.lb / 2 + ((i + 0.5) * b.lb) / nA;
    edges.push({ s: b.la / 2 + curb, t, yaw: Math.atan2(b.ax, b.az), along: 'a' });
  }
  const nB = Math.max(2, Math.floor(b.la / 34));
  for (let i = 0; i < nB; i++) {
    const s = -b.la / 2 + ((i + 0.5) * b.la) / nB;
    edges.push({ s, t: b.lb / 2 + curb, yaw: Math.atan2(b.bx, b.bz), along: 'b' });
  }
  edges.forEach((e, i) => {
    const [x, z] = world(b, e.s, e.t);
    if (layout.isReserved(x, z, 2) || layout.isOcean(x, z)) return;
    const lamp = i % 2 === 0;
    if (lamp) {
      props.push(put(b, e.s, e.t, 4.4, e.yaw, {
        template: 'box', sx: 0.42, sy: 8.8, sz: 0.42, color: GREY, emissive: NONE, metal: 0.35, rank: 0,
      }));
      props.push(put(b, e.s, e.t, 8.7, e.yaw, {
        template: 'box', sx: 1.5, sy: 0.28, sz: 0.42, color: [0.75, 0.82, 0.9], emissive: LAMP, metal: 0.1, rank: 0,
      }));
      pools.push({
        x, y: b.ground + 0.05, z, yaw: e.yaw, wid: 7, len: 3.2,
        rgb: [0.45, 0.6, 0.85], intensity: 0.35, rank: 1,
      });
    } else {
      props.push(put(b, e.s, e.t, 0.55, e.yaw, {
        template: 'cyl', sx: 0.42, sy: 1.1, sz: 0.42, color: GREY, emissive: NONE, metal: 0.5, rank: 0,
      }));
    }
    if (r.chance(0.28)) {
      const s = e.along === 'a' ? e.s - 1.7 : e.s;
      const t = e.along === 'b' ? e.t - 1.7 : e.t;
      props.push(put(b, s, t, 0.42, e.yaw, {
        template: 'box', sx: 1.6, sy: 0.48, sz: 0.5, color: [0.16, 0.16, 0.18], emissive: NONE, metal: 0.1, rank: 1,
      }));
    }
    if (r.chance(0.12)) {
      steam.push({ x, y: b.ground, z, seed: r.next(), rank: 2 });
    }
  });

  // sidewalk loop just outside the mass, skipped when the block sits on a monument
  const lapd = layout.landmarkById('lapd-hq');
  const hall = layout.landmarkById('city-hall');
  const onMonument = (lapd && Math.hypot(b.cx - lapd.x, b.cz - lapd.z) < lapd.reserveRadius + 8)
    || (hall && Math.hypot(b.cx - hall.x, b.cz - hall.z) < hall.reserveRadius + 8);
  let loop: Array<[number, number]> | null = null;
  if (!onMonument) {
    const s = b.la / 2 + 2.4, t = b.lb / 2 + 2.4;
    loop = [[s, t], [s, -t], [-s, -t], [-s, t]].map(([ds, dt]) => world(b, ds, dt));
  }
  return { props, pools, steam, loop };
}

/** Pylons and a walking loop on the LAPD forecourt and the mall. World space. */
export function plazaKit(layout: CityLayout): { props: CivicProp[]; pools: CivicPool[]; loops: Array<Array<[number, number]>> } {
  const lapd = layout.landmarkById('lapd-hq');
  const hall = layout.landmarkById('city-hall');
  const props: CivicProp[] = [];
  const pools: CivicPool[] = [];
  const loops: Array<Array<[number, number]>> = [];
  if (!lapd) return { props, pools, loops };
  const yaw = yawOf(lapd.bearingDeg);
  const g = layout.heightAt(lapd.x, lapd.z);
  const add = (lx: number, lz: number, y: number, sx: number, sy: number, sz: number, em: [number, number, number], rank: number) => {
    const [x, z] = localToWorld(lapd.x, lapd.z, yaw, lx, lz);
    props.push({
      template: 'box', x, y: g + y, z, yaw, sx, sy, sz,
      color: em[0] > 0 ? [0.7, 0.78, 0.88] : GREY, emissive: em, metal: 0.3, rank,
    });
  };
  for (const lx of [-20, 20]) {
    add(lx, -96, 5.2, 0.55, 10.4, 0.55, NONE, 0);
    add(lx, -96, 10.2, 2.2, 0.35, 0.5, LAMP, 0);
    const [x, z] = localToWorld(lapd.x, lapd.z, yaw, lx, -96);
    pools.push({ x, y: g + 0.08, z, yaw, wid: 10, len: 4, rgb: [0.55, 0.7, 0.95], intensity: 0.55, rank: 0 });
  }
  // crowd at the foot of the steps, clear of the treads (the treads occupy |x| < 15, z -78..-59)
  const foot: Array<[number, number]> = [[-22, -98], [22, -98], [22, -82], [-22, -82]];
  loops.push(foot.map(([lx, lz]) => localToWorld(lapd.x, lapd.z, yaw, lx, lz)));
  if (hall) {
    const hy = yawOf(hall.bearingDeg);
    const gh = layout.heightAt(hall.x, hall.z);
    for (const lx of [-14, 14]) {
      const [x, z] = localToWorld(hall.x, hall.z, hy, lx, 62);
      props.push({
        template: 'box', x, y: gh + 4.6, z, yaw: hy, sx: 0.5, sy: 9.2, sz: 0.5,
        color: GREY, emissive: NONE, metal: 0.3, rank: 0,
      });
      props.push({
        template: 'box', x, y: gh + 9.1, z, yaw: hy, sx: 1.8, sy: 0.3, sz: 0.45,
        color: [0.85, 0.78, 0.62], emissive: [0.9, 0.7, 0.4], metal: 0.1, rank: 0,
      });
    }
    const ring: Array<[number, number]> = [[-16, 64], [16, 64], [16, 54], [-16, 54]];
    loops.push(ring.map(([lx, lz]) => localToWorld(hall.x, hall.z, hy, lx, lz)));
  }
  return { props, pools, loops };
}
