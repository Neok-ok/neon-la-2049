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
  heading: number,
): void {
  const spots = marketSpots(layout);
  const noodle = spots.noodle;
  if (noodle) {
    const s = noodle.street;
    if ((s.x - x) ** 2 + (s.z - z) ** 2 < 28 * 28 && y < s.y + 8) {
      const fx = Math.sin(heading);
      const fz = -Math.cos(heading);
      const rx = fz;
      const rz = -fx;
      vents.push(make({
        x: x + fx * 6.4 + rx * 1.7,
        y: s.y + 0.2,
        z: z + fz * 6.4 + rz * 1.7,
        kind: KIND.vent,
        rate: 11,
        life: 2.5,
        size0: 0.5,
        size1: 1.55,
        heat: 0,
        radius: 0.1,
        spread: 0.1,
        rise: 2.05,
        fade: 16,
        aspect: 1.9,
        floorY: s.y,
      }));
      holes.push(make({
        x: x + fx * 12.2 - rx * 1.5,
        y: s.y + 0.35,
        z: z + fz * 12.2 - rz * 1.5,
        kind: KIND.manhole,
        rate: 10,
        life: 2.1,
        size0: 0.5,
        size1: 1.35,
        heat: 0,
        radius: 0.18,
        spread: 0.1,
        rise: 0.32,
        fade: 12,
        aspect: 0.58,
        floorY: s.y,
      }));
    }
    if (y > s.y + 10 && (s.x - x) ** 2 + (s.z - z) ** 2 < 55 * 55) {
      const fx = Math.sin(heading);
      const fz = -Math.cos(heading);
      const rx = fz;
      const rz = -fx;
      let best: { x: number; z: number; roof: number; score: number } | null = null;
      for (const along of [8, 14, 20, 26]) {
        for (const side of [-16, -10, -6, 6, 10, 16]) {
          const px = x + fx * along + rx * side;
          const pz = z + fz * along + rz * side;
          const roofY = query.floorBelow(px, y + 4, pz, true);
          if (!(roofY > s.y + 6) || roofY > y - 1.2) continue;
          const dist = Math.hypot(px - x, pz - z) || 1;
          if (dist < 6 || dist > 22) continue;
          const sy = roofY + 2.8;
          const pitch = Math.atan2(sy - y, dist);
          if (pitch > -0.45 || pitch < -1.25) continue;
          if (query.insideSolid(px, sy, pz, 0.5, true)) continue;
          const score = dist * 0.08 + Math.abs(pitch + 0.9) * 4;
          if (!best || score < best.score) best = { x: px, z: pz, roof: roofY, score };
        }
      }
      const spot = best ?? { x: x + fx * 16 + rx * 8, z: z + fz * 16 + rz * 8, roof: s.y + 18, score: 0 };
      roofs.push(make({
        x: spot.x, y: spot.roof + 0.8, z: spot.z,
        kind: KIND.roof,
        rate: 8,
        life: 5.6,
        size0: 1.05,
        size1: 2.7,
        heat: 0,
        radius: 0.16,
        spread: 0.12,
        rise: 3.1,
        fade: 44,
        aspect: 1.9,
        floorY: spot.roof,
      }));
    }
  }
  for (const shop of [spots.noodle, spots.bibi]) {
    if (!shop) continue;
    const s = shop.street;
    if (y > s.y + 6) continue;
    if ((s.x - x) ** 2 + (s.z - z) ** 2 > 8 * 8) continue;
    const dh = Math.atan2(Math.sin(heading - s.heading), Math.cos(heading - s.heading));
    if (Math.abs(dh) > 0.2) continue;
    const hx = Math.sin(s.heading);
    const hz = -Math.cos(s.heading);
    const rx = hz;
    const rz = -hx;
    food.push(make({
      x: s.x + hx * 3.4 + rx * 1.7, y: s.y + 1.15, z: s.z + hz * 3.4 + rz * 1.7,
      kind: KIND.stall,
      rate: 16,
      life: 1.3,
      size0: 0.22,
      size1: 0.68,
      heat: 0.15,
      radius: 0.08,
      spread: 0.08,
      rise: 0.62,
      fade: 8,
      aspect: 1.45,
      floorY: s.y,
    }));
  }
}

export function gatherEmitters(
  layout: CityLayout, query: CityQuery, x: number, y: number, z: number, heading: number, tier: Tier,
): Emitter[] {
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
          size0: manhole ? 0.45 : 0.22,
          size1: manhole ? 1.5 : 1.05,
          heat: 0,
          radius: manhole ? 0.3 : 0.08,
          spread: manhole ? 0.6 : 0.22,
          rise: manhole ? 0.2 : 0.9,
          fade: manhole ? 18 : 16,
          aspect: manhole ? 0.4 : 1.4,
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
          size0: 0.2,
          size1: 1.05,
          heat: 1,
          radius: 0.12,
          spread: 0.16,
          rise: 0.55,
          fade: 22,
          aspect: 1.05,
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
            x: rx, y: roof + 1.15, z: rz,
            kind: KIND.roof,
            rate: 2.6,
            life: 5.2,
            size0: 0.55,
            size1: 2.4,
            heat: 0,
            radius: 0.2,
            spread: 0.25,
            rise: 1.15,
            fade: 36,
            aspect: 1.5,
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
      x: f.x, y: f.y + 0.2, z: f.z,
      kind: KIND.stack,
      rate: 16,
      life: 12,
      size0: 4.6,
      size1: 11.5,
      heat: 0.45,
      radius: 0.55,
      spread: 0.16,
      rise: 2.3,
      fade: 1100,
      aspect: 1.05,
      floorY: f.y,
    }));
  };
  for (const f of flames(layout, x, z, 'south-bay-refineries', SB_A, SB_B, SB_L, (i, j) => southBayBlock(layout, i, j), (block) => planSouthBay(block, layout), 'sb')) pushStack(f);
  const gate = controlBlock(layout);
  if (gate) {
    const door = doorWorld(gate);
    // The street camera stands about 16 m before the door. The barrel sits in that gap.
    const bx = door.x + gate.ax * -7 + gate.bx * -3.2;
    const bz = door.z + gate.az * -7 + gate.bz * -3.2;
    if ((bx - x) ** 2 + (bz - z) ** 2 < 90 * 90) {
      barrels.push(make({
        x: bx, y: door.y + 0.65, z: bz,
        kind: KIND.barrel,
        rate: 14,
        life: 3.6,
        size0: 0.32,
        size1: 1.05,
        heat: 1,
        radius: 0.16,
        spread: 0.07,
        rise: 1.2,
        fade: 28,
        aspect: 1.4,
        floorY: door.y,
      }));
    }
  }
  for (const f of flames(layout, x, z, 'southeast-industrial', SE_A, SE_B, SE_L, (i, j) => southeastBlock(layout, i, j), (block) => planSoutheast(block, layout), 'se')) pushStack(f);

  const food: Emitter[] = [];
  addMarket(vents, holes, roofs, food, layout, query, x, y, z, heading);

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
