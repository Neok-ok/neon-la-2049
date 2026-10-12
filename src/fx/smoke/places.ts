// Emitters near the camera. Street points come from the same block grid the
// city builds. Stacks use the refinery plan so the column sits on the flame
// that is already there. Food steam sits on the noodle-bar and Bibi cook.
import { hash2i } from '../../core/rng';
import type { Tier } from '../../core/quality';
import { marketSpots } from '../../districts/little-tokyo-market/spots';
import { PAD_BLOCKS, blockCenter } from '../../districts/lax-spaceport/spec';
import { planSouthBay } from '../../districts/south-bay-refineries/plan';
import { BLOCK_A as SB_A, BLOCK_B as SB_B, LATTICE as SB_L, southBayBlock } from '../../districts/south-bay-refineries/spec';
import { planSoutheast } from '../../districts/southeast-industrial/plan';
import { BLOCK_A as SE_A, BLOCK_B as SE_B, LATTICE as SE_L, southeastBlock } from '../../districts/southeast-industrial/spec';
import { enumerateBlocks } from '../../world/fabric/generator';
import type { CityLayout } from '../../world/layout';
import type { CityQuery } from '../../world/CityQuery';
import { GATHER_RADIUS } from './tiers';
import { KIND, type Emitter, type SmokeKind } from './types';

const WORK = new Set([
  'arts-district', 'southeast-industrial', 'south-bay-refineries', 'harbor', 'east-la', 'long-beach',
]);

const CAP = {
  vent: { low: 2, medium: 4, high: 6, ultra: 8 },
  manhole: { low: 2, medium: 3, high: 5, ultra: 6 },
  roof: { low: 1, medium: 3, high: 4, ultra: 5 },
  barrel: { low: 1, medium: 2, high: 3, ultra: 4 },
  stack: { low: 1, medium: 3, high: 4, ultra: 5 },
} as const;

interface Flame { x: number; y: number; z: number }
const flameCache = new Map<string, Flame[]>();

function padNear(x: number, z: number): boolean {
  for (const [i, j] of PAD_BLOCKS) {
    const c = blockCenter(i, j);
    if ((x - c.x) ** 2 + (z - c.z) ** 2 < 70 * 70) return true;
  }
  return false;
}

function bboxDist(b: [number, number, number, number], x: number, z: number): number {
  const dx = x < b[0] ? b[0] - x : x > b[2] ? x - b[2] : 0;
  const dz = z < b[1] ? b[1] - z : z > b[3] ? z - b[3] : 0;
  return Math.hypot(dx, dz);
}

function make(p: Omit<Emitter, 'acc'>): Emitter {
  return { ...p, acc: 0 };
}

function curb(
  b: { cx: number; cz: number; ax: number; az: number; bx: number; bz: number; la: number; lb: number; street: number; ground: number },
  side: number,
  into: number,
  along: number,
): { x: number; y: number; z: number } {
  const s = side * (b.la * 0.5 + into);
  const t = along * b.lb * 0.32;
  return {
    x: b.cx + b.ax * s + b.bx * t,
    y: b.ground,
    z: b.cz + b.az * s + b.bz * t,
  };
}

function open(query: CityQuery, x: number, y: number, z: number): boolean {
  if (query.layout.isOcean(x, z)) return false;
  return !query.insideSolid(x, y + 0.8, z, 0.35, false);
}

function flames(
  layout: CityLayout, x: number, z: number,
  id: string, a: number, b: number,
  lattice: { i0: number; i1: number; j0: number; j1: number },
  blockAt: (i: number, j: number) => { cx: number; cz: number } | null,
  plan: (block: NonNullable<ReturnType<typeof southBayBlock>>) => { flames: readonly Flame[] },
  prefix: string,
): Flame[] {
  const d = layout.districts.find((n) => n.id === id);
  if (!d || bboxDist(d.bbox, x, z) > 700) return [];
  const j0 = Math.round(x / b - 0.5);
  const i0 = Math.round(-z / a - 0.5);
  const out: Flame[] = [];
  for (let di = -2; di <= 2; di++) {
    for (let dj = -2; dj <= 2; dj++) {
      const i = i0 + di;
      const j = j0 + dj;
      if (i < lattice.i0 || i > lattice.i1 || j < lattice.j0 || j > lattice.j1) continue;
      const key = `${prefix}:${i}:${j}`;
      let list = flameCache.get(key);
      if (!list) {
        const block = blockAt(i, j);
        list = block ? plan(block as NonNullable<ReturnType<typeof southBayBlock>>).flames.map((f) => ({ x: f.x, y: f.y, z: f.z })) : [];
        flameCache.set(key, list);
      }
      for (const f of list) out.push(f);
    }
  }
  return out;
}

function takeNearest(list: Emitter[], x: number, z: number, n: number): Emitter[] {
  list.sort((a, b) => (a.x - x) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + (b.z - z) ** 2));
  return list.slice(0, n);
}

export function gatherEmitters(layout: CityLayout, query: CityQuery, x: number, z: number, tier: Tier): Emitter[] {
  const radius = GATHER_RADIUS[tier];
  const blocks = enumerateBlocks(layout, x - radius, z - radius, radius * 2);
  const vents: Emitter[] = [];
  const holes: Emitter[] = [];
  const roofs: Emitter[] = [];
  const barrels: Emitter[] = [];

  for (const b of blocks) {
    if (layout.isOcean(b.cx, b.cz)) continue;
    if (padNear(b.cx, b.cz)) continue;
    const h = hash2i(b.i, b.j, b.seed);
    const u = (h % 1000) / 1000;
    const side = (h & 2) === 0 ? 1 : -1;
    const along = ((h % 200) / 100) - 1;

    if (u < 0.55) {
      const p = curb(b, side, Math.max(0.8, b.street * 0.22), along);
      if (open(query, p.x, p.y, p.z)) {
        const manhole = u < 0.22;
        const list = manhole ? holes : vents;
        const kind: SmokeKind = manhole ? KIND.manhole : KIND.vent;
        list.push(make({
          x: p.x, y: p.y + (manhole ? 0.7 : 1.05), z: p.z,
          kind,
          rate: manhole ? 3.4 : 5.2,
          life: manhole ? 6.2 : 4.4,
          size0: manhole ? 0.7 : 0.28,
          size1: manhole ? 2.4 : 1.55,
          heat: 0,
          radius: manhole ? 0.45 : 0.22,
          spread: manhole ? 0.55 : 0.25,
          rise: manhole ? 0.7 : 1.15,
          fade: manhole ? 38 : 48,
          aspect: manhole ? 0.62 : 1.35,
          floorY: p.y,
        }));
      }
    }

    if (WORK.has(b.district.id) && (h % 5) === 1) {
      const p = curb(b, side, 0.7, along * 0.5);
      if (open(query, p.x, p.y, p.z)) {
        barrels.push(make({
          x: p.x, y: p.y + 1.15, z: p.z,
          kind: KIND.barrel,
          rate: 3.6,
          life: 7.5,
          size0: 0.45,
          size1: 2.4,
          heat: 0.9,
          radius: 0.2,
          spread: 0.3,
          rise: 1.3,
          fade: 60,
          aspect: 1.25,
          floorY: p.y,
        }));
      }
    }

    if ((h % 6) === 2) {
      const roof = query.floorBelow(b.cx, b.ground + 90, b.cz, false);
      if (roof > b.ground + 6 && roof < b.ground + 80) {
        roofs.push(make({
          x: b.cx, y: roof + 0.4, z: b.cz,
          kind: KIND.roof,
          rate: 2.4,
          life: 6.5,
          size0: 0.5,
          size1: 2.2,
          heat: 0,
          radius: 0.3,
          spread: 0.35,
          rise: 0.9,
          fade: 80,
          aspect: 1.2,
          floorY: roof,
        }));
      }
    }
  }

  const stacks: Emitter[] = [];
  const pushStack = (f: Flame) => {
    stacks.push(make({
      x: f.x, y: f.y + 1.2, z: f.z,
      kind: KIND.stack,
      rate: 2.4,
      life: 14,
      size0: 2.2,
      size1: 11,
      heat: 0.28,
      radius: 0.8,
      spread: 0.6,
      rise: 2.4,
      fade: 720,
      aspect: 1.35,
      floorY: f.y,
    }));
  };
  for (const f of flames(layout, x, z, 'south-bay-refineries', SB_A, SB_B, SB_L, (i, j) => southBayBlock(layout, i, j), (block) => planSouthBay(block, layout), 'sb')) pushStack(f);
  for (const f of flames(layout, x, z, 'southeast-industrial', SE_A, SE_B, SE_L, (i, j) => southeastBlock(layout, i, j), (block) => planSoutheast(block, layout), 'se')) pushStack(f);

  const food: Emitter[] = [];
  const spots = marketSpots(layout);
  for (const shop of [spots.noodle, spots.bibi]) {
    if (!shop) continue;
    const c = shop.cook;
    const s = shop.street;
    if ((c.x - x) ** 2 + (c.z - z) ** 2 > 90 * 90) continue;
    const dx = s.x - c.x;
    const dz = s.z - c.z;
    const len = Math.hypot(dx, dz) || 1;
    food.push(make({
      x: c.x + (dx / len) * 0.7, y: c.y + 1.5, z: c.z + (dz / len) * 0.7,
      kind: KIND.stall,
      rate: 6,
      life: 2.8,
      size0: 0.16,
      size1: 0.72,
      heat: 0.15,
      radius: 0.12,
      spread: 0.12,
      rise: 0.65,
      fade: 16,
      aspect: 1.45,
      floorY: c.y,
    }));
    food.push(make({
      x: s.x, y: s.y + 0.65, z: s.z,
      kind: KIND.manhole,
      rate: 1.4,
      life: 5.5,
      size0: 0.5,
      size1: 2.0,
      heat: 0,
      radius: 0.35,
      spread: 0.4,
      rise: 0.6,
      fade: 32,
      aspect: 0.7,
      floorY: s.y,
    }));
  }

  return [
    ...takeNearest(vents, x, z, CAP.vent[tier]),
    ...takeNearest(holes, x, z, CAP.manhole[tier]),
    ...takeNearest(roofs, x, z, CAP.roof[tier]),
    ...takeNearest(barrels, x, z, CAP.barrel[tier]),
    ...takeNearest(stacks, x, z, CAP.stack[tier]),
    ...food,
  ];
}

/** Barrel mouths, for the few flare practicals the cluster can spare. */
export function barrelLights(emitters: readonly Emitter[], x: number, z: number, n = 3): Emitter[] {
  const list = emitters.filter((e) => e.kind === KIND.barrel);
  return takeNearest(list, x, z, n);
}
