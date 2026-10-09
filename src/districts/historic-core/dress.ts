// Both curbs of the streets a block owns (a+ and b+). Broadway is neon: pools, steam, bollards,
// a parked rickshaw. No sodium lamps — the canyon is signed, not lamped.
import { Rng } from '../../core/rng';
import type { CityLayout } from '../../world/layout';
import { BROADWAY_J, worldToGrid } from './spec';

export interface CanyonBlock {
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

export interface CanyonProp {
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
  rank: number;
}

export interface CanyonPool {
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

export interface CanyonSteam {
  x: number;
  y: number;
  z: number;
  seed: number;
  rank: number;
}

const CONCRETE: [number, number, number] = [0.16, 0.15, 0.17];
const NONE: [number, number, number] = [0, 0, 0];
const PINK: [number, number, number] = [1.4, 0.25, 0.55];
const VIOLET: [number, number, number] = [0.55, 0.22, 1.15];
const AMBER: [number, number, number] = [1.2, 0.62, 0.18];
const POOL_COLORS: Array<[number, number, number]> = [PINK, VIOLET, AMBER, PINK];

function world(b: CanyonBlock, s: number, t: number): [number, number] {
  return [b.cx + b.ax * s + b.bx * t, b.cz + b.az * s + b.bz * t];
}

export function dressBlock(b: CanyonBlock, layout: CityLayout): {
  props: CanyonProp[];
  pools: CanyonPool[];
  steam: CanyonSteam[];
  loops: Array<Array<[number, number]>>;
} {
  const r = new Rng(b.seed ^ 0x5a17);
  const props: CanyonProp[] = [];
  const pools: CanyonPool[] = [];
  const steam: CanyonSteam[] = [];
  const loops: Array<Array<[number, number]>> = [];
  const [, t0] = worldToGrid(b.cx, b.cz);
  const j = Math.floor(t0 / 70);
  const broadway = j === BROADWAY_J || j === BROADWAY_J - 1;
  const half = b.street / 2;

  // Owned edges only, both curbs, so a street is dressed once and still has two sidewalks.
  const edges: Array<{ along: 'a' | 'b'; near: number; far: number; yaw: number; len: number }> = [
    { along: 'a', near: b.la / 2 + 1.7, far: b.la / 2 + b.street - 1.7, yaw: Math.atan2(b.bx, b.bz), len: b.lb },
    { along: 'b', near: b.lb / 2 + 1.7, far: b.lb / 2 + b.street - 1.7, yaw: Math.atan2(b.ax, b.az), len: b.la },
  ];

  const pushLoop = (pts: Array<[number, number]>) => {
    if (pts.length < 3) return;
    const mid = pts[Math.floor(pts.length / 2)]!;
    if (layout.isReserved(mid[0], mid[1], 1)) return;
    const back = pts.slice(0, -1).reverse();
    loops.push([...pts, ...back]);
  };

  for (const edge of edges) {
    const samples = Math.max(4, Math.floor(edge.len / 8));
    for (const curb of [edge.near, edge.far]) {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= samples; i++) {
        const u = -edge.len / 2 + 2 + ((edge.len - 4) * i) / samples;
        const s = edge.along === 'a' ? curb : u;
        const t = edge.along === 'b' ? curb : u;
        const [x, z] = world(b, s, t);
        if (layout.isOcean(x, z)) continue;
        pts.push([x, z]);
        if (i % 2 === 0) {
          props.push({
            template: 'cyl', x, y: b.ground, z, yaw: edge.yaw,
            sx: 0.28, sy: 0.85, sz: 0.28,
            color: CONCRETE, emissive: NONE, metal: 0.2, rank: 0,
          });
        }
        if (broadway && i % 2 === 1) {
          const rgb = r.pick(POOL_COLORS);
          pools.push({
            x, y: b.ground + 0.04, z, yaw: edge.yaw,
            wid: 3.2, len: 7.5, rgb, intensity: 0.85, rank: 0,
          });
        } else if (!broadway && i % 4 === 1 && r.chance(0.5)) {
          pools.push({
            x, y: b.ground + 0.04, z, yaw: edge.yaw,
            wid: 2.4, len: 5, rgb: AMBER, intensity: 0.4, rank: 1,
          });
        }
      }
      pushLoop(pts);
    }

    // One grate per owned street, on the near curb.
    if (r.chance(broadway ? 0.85 : 0.4)) {
      const [x, z] = world(b, edge.along === 'a' ? edge.near : 0, edge.along === 'b' ? edge.near : 0);
      steam.push({ x, y: b.ground, z, seed: r.next(), rank: 1 });
    }

    // Parked rickshaw between the sidewalk and the 3.15 m driving line. Not in the lane.
    if (r.chance(broadway ? 0.65 : 0.28)) {
      const park = edge.near + (half - 3.15) * 0.55;
      const along = r.range(-edge.len * 0.3, edge.len * 0.3);
      const s = edge.along === 'a' ? park : along;
      const t = edge.along === 'b' ? park : along;
      const [x, z] = world(b, s, t);
      if (!layout.isReserved(x, z, 2)) {
        props.push({
          template: 'box', x, y: b.ground, z, yaw: edge.yaw,
          sx: 0.95, sy: 1.45, sz: 2.15,
          color: [0.12, 0.11, 0.13], emissive: [0.15, 0.04, 0.06], metal: 0.6, rank: 1,
        });
        props.push({
          template: 'box', x, y: b.ground + 1.15, z, yaw: edge.yaw,
          sx: 0.18, sy: 0.12, sz: 0.08,
          color: [0.2, 0.05, 0.08], emissive: PINK, metal: 0.1, rank: 2,
        });
      }
    }
  }

  return { props, pools, steam, loops };
}
