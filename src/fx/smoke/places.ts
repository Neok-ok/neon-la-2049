// Emitters near the camera. Street points come from the same block grid the
// city builds. Stacks use the refinery plan so the column sits on the flame
// that is already there. Food steam sits on the noodle-bar and Bibi cook.
import { hash2i } from '../../core/rng';
import type { Tier } from '../../core/quality';
import { marketSpots } from '../../districts/little-tokyo-market/spots';
import { PAD_BLOCKS, blockCenter } from '../../districts/lax-spaceport/spec';
import { planSouthBay } from '../../districts/south-bay-refineries/plan';
import { BLOCK_A as SB_A, BLOCK_B as SB_B, LATTICE as SB_L, controlBlock, doorWorld, southBayBlock } from '../../districts/south-bay-refineries/spec';
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

function addMarket(
  vents: Emitter[],
  holes: Emitter[],
  roofs: Emitter[],
  food: Emitter[],
  layout: CityLayout,
  query: CityQuery,
  x: number,
  y: number,
  z: number,
): void {
  const spots = marketSpots(layout);
  const noodle = spots.noodle;
  if (noodle) {
    const s = noodle.street;
    const e = noodle.entrance;
    const tx = e.x - s.x;
    const tz = e.z - s.z;
    const tl = Math.hypot(tx, tz) || 1;
    const towardX = tx / tl;
    const towardZ = tz / tl;
    const ax = Math.sin(s.heading);
    const az = -Math.cos(s.heading);
    const lx = ax * 0.6 - towardX * 0.4;
    const lz = az * 0.6 - towardZ * 0.4;
    const heading = Math.atan2(lx, -lz) - 0.18;
    const hx = Math.sin(heading);
    const hz = -Math.cos(heading);
    const camX = s.x + towardX * 1.15;
    const camZ = s.z + towardZ * 1.15;
    if ((camX - x) ** 2 + (camZ - z) ** 2 < 40 * 40) {
      const rx = hz;
      const rz = -hx;
      vents.push(make({
        x: camX + hx * 8.5 + rx * 2.2,
        y: s.y + 1.15,
        z: camZ + hz * 8.5 + rz * 2.2,
        kind: KIND.vent,
        rate: 3.4,
        life: 2.6,
        size0: 0.22,
        size1: 0.95,
        heat: 0,
        radius: 0.06,
        spread: 0.1,
        rise: 1.75,
        fade: 18,
        aspect: 2.9,
        floorY: s.y,
      }));
      holes.push(make({
        x: camX + hx * 11.5,
        y: s.y + 0.42,
        z: camZ + hz * 11.5,
        kind: KIND.manhole,
        rate: 2.4,
        life: 4.4,
        size0: 0.45,
        size1: 2.3,
        heat: 0,
        radius: 0.18,
        spread: 0.75,
        rise: 0.26,
        fade: 22,
        aspect: 0.3,
        floorY: s.y,
      }));
    }
    if (y > s.y + 10 && (s.x - x) ** 2 + (s.z - z) ** 2 < 55 * 55) {
      const hx2 = Math.sin(s.heading);
      const hz2 = -Math.cos(s.heading);
      const rx = s.x + hx2 * 7;
      const rz = s.z + hz2 * 7;
      let roof = query.floorBelow(rx, s.y + 80, rz, true);
      if (!(roof > s.y + 5)) roof = query.floorBelow(s.x - hx2 * 5, s.y + 80, s.z - hz2 * 5, true);
      if (!(roof > s.y + 5)) roof = s.y + 16;
      roofs.push(make({
        x: rx, y: roof + 0.5, z: rz,
        kind: KIND.roof,
        rate: 3,
        life: 4.8,
        size0: 0.4,
        size1: 1.7,
        heat: 0.05,
        radius: 0.2,
        spread: 0.2,
        rise: 1.35,
        fade: 36,
        aspect: 1.85,
        floorY: roof,
      }));
    }
  }
  for (const shop of [spots.noodle, spots.bibi]) {
    if (!shop) continue;
    const c = shop.cook;
    const s = shop.street;
    if ((s.x - x) ** 2 + (s.z - z) ** 2 > 14 * 14) continue;
    food.push(make({
      x: c.x, y: c.y + 1.05, z: c.z,
      kind: KIND.stall,
      rate: 8,
      life: 1.4,
      size0: 0.1,
      size1: 0.38,
      heat: 0.25,
      radius: 0.04,
      spread: 0.04,
      rise: 1.25,
      fade: 10,
      aspect: 2.6,
      floorY: c.y,
    }));
  }
}

export function gatherEmitters(layout: CityLayout, query: CityQuery, x: number, y: number, z: number, tier: Tier): Emitter[] {
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

    const market = b.district.id === 'little-tokyo-market';
    if (!market && u < 0.62) {
      const manhole = u < 0.28;
      const into = manhole ? b.street * 0.55 : Math.max(0.5, b.street * 0.12);
      const p = curb(b, side, into, along);
      if (open(query, p.x, p.y, p.z)) {
        const list = manhole ? holes : vents;
        const kind: SmokeKind = manhole ? KIND.manhole : KIND.vent;
        list.push(make({
          x: p.x, y: p.y + (manhole ? 0.42 : 1.05), z: p.z,
          kind,
          rate: manhole ? 1.8 : 2.6,
          life: manhole ? 4.8 : 3.1,
          size0: manhole ? 0.35 : 0.2,
          size1: manhole ? 1.7 : 0.95,
          heat: 0,
          radius: manhole ? 0.25 : 0.1,
          spread: manhole ? 0.7 : 0.14,
          rise: manhole ? 0.3 : 1.55,
          fade: manhole ? 26 : 24,
          aspect: manhole ? 0.32 : 2.5,
          floorY: p.y,
        }));
      }
    }

    if (!market && WORK.has(b.district.id) && (h % 5) === 1) {
      const p = curb(b, side, 0.7, along * 0.5);
      if (open(query, p.x, p.y, p.z)) {
        barrels.push(make({
          x: p.x, y: p.y + 1.35, z: p.z,
          kind: KIND.barrel,
          rate: 4.2,
          life: 8,
          size0: 0.55,
          size1: 3.4,
          heat: 1,
          radius: 0.18,
          spread: 0.28,
          rise: 1.7,
          fade: 55,
          aspect: 1.55,
          floorY: p.y,
        }));
      }
    }

    if ((h % 6) === 2) {
      const probes: Array<[number, number]> = [
        [b.cx, b.cz],
        [b.cx + b.ax * b.la * 0.22, b.cz + b.az * b.la * 0.22],
      ];
      for (const [rx, rz] of probes) {
        const roof = query.floorBelow(rx, b.ground + 90, rz, true);
        if (roof > b.ground + 6 && roof < b.ground + 80) {
          roofs.push(make({
            x: rx, y: roof + 0.45, z: rz,
            kind: KIND.roof,
            rate: 2.6,
            life: 5.2,
            size0: 0.32,
            size1: 1.45,
            heat: 0.04,
            radius: 0.18,
            spread: 0.22,
            rise: 1.25,
            fade: 48,
            aspect: 1.9,
            floorY: roof,
          }));
          break;
        }
      }
    }
  }

  const stacks: Emitter[] = [];
  const pushStack = (f: Flame) => {
    stacks.push(make({
      x: f.x, y: f.y + 1.2, z: f.z,
      kind: KIND.stack,
      rate: 4.4,
      life: 20,
      size0: 1.25,
      size1: 5.6,
      heat: 0.42,
      radius: 0.4,
      spread: 0.32,
      rise: 5.4,
      fade: 1100,
      aspect: 1.65,
      floorY: f.y,
    }));
  };
  for (const f of flames(layout, x, z, 'south-bay-refineries', SB_A, SB_B, SB_L, (i, j) => southBayBlock(layout, i, j), (block) => planSouthBay(block, layout), 'sb')) pushStack(f);
  const gate = controlBlock(layout);
  if (gate) {
    const door = doorWorld(gate);
    // The street camera stands about 16 m before the door. The barrel sits in that gap.
    const bx = door.x + gate.ax * -7 + gate.bx * -1.6;
    const bz = door.z + gate.az * -7 + gate.bz * -1.6;
    if ((bx - x) ** 2 + (bz - z) ** 2 < 90 * 90) {
      barrels.push(make({
        x: bx, y: door.y + 1.3, z: bz,
        kind: KIND.barrel,
        rate: 5,
        life: 8,
        size0: 0.6,
        size1: 3.8,
        heat: 1,
        radius: 0.16,
        spread: 0.22,
        rise: 1.85,
        fade: 48,
        aspect: 1.7,
        floorY: door.y,
      }));
    }
  }
  for (const f of flames(layout, x, z, 'southeast-industrial', SE_A, SE_B, SE_L, (i, j) => southeastBlock(layout, i, j), (block) => planSoutheast(block, layout), 'se')) pushStack(f);

  const food: Emitter[] = [];
  addMarket(vents, holes, roofs, food, layout, query, x, y, z);

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
