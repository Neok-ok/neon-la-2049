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
import { carriageNear } from '../../roads/streetSpan';
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

/** A point in the lane the camera is looking down, nudged until it is not inside a wall. */
function laneSpot(
  query: CityQuery,
  x: number, y: number, z: number,
  fx: number, fz: number, rx: number, rz: number,
  along: number, side: number, lift: number,
): { x: number; y: number; z: number } {
  const tries: Array<[number, number]> = [
    [along, side],
    [along, side + 1.4],
    [along, side - 1.4],
    [along + 1.6, 0],
    [along - 1.2, side],
  ];
  for (const [a, s] of tries) {
    const px = x + fx * a + rx * s;
    const pz = z + fz * a + rz * s;
    if (open(query, px, y + lift, pz)) return { x: px, y: y + lift, z: pz };
  }
  return { x: x + fx * along + rx * side, y: y + lift, z: z + fz * along + rz * side };
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
      // The street camera yaws toward the shop. Follow the carriage, or the
      // plume walks into the storefront.
      const lane = carriageNear(layout, s.x, s.z, 'little-tokyo-market');
      const ax = lane ? lane.fx : fx;
      const az = lane ? lane.fz : fz;
      const lx = -az;
      const lz = ax;
      // Locked to the shop's carriage, not the camera, so the column does not walk.
      const ox = lane ? lane.x : s.x;
      const oy = lane ? lane.y : s.y;
      const oz = lane ? lane.z : s.z;
      const vent = laneSpot(query, ox, oy, oz, ax, az, lx, lz, 8.4, 1.05, 0.55);
      vents.push(make({
        x: vent.x,
        y: vent.y,
        z: vent.z,
        kind: KIND.vent,
        rate: 18,
        life: 2.8,
        size0: 0.3,
        size1: 0.52,
        heat: 0,
        radius: 0.12,
        spread: 0.05,
        rise: 1.05,
        fade: 22,
        aspect: 2.1,
        floorY: oy,
      }));
      const hole = laneSpot(query, ox, oy, oz, ax, az, lx, lz, 5.4, -1.7, 0.12);
      holes.push(make({
        x: hole.x,
        y: hole.y,
        z: hole.z,
        kind: KIND.manhole,
        rate: 10,
        life: 2.2,
        size0: 1.0,
        size1: 1.7,
        heat: 0,
        radius: 0.3,
        spread: 0.04,
        rise: 0.18,
        fade: 16,
        aspect: 0.4,
        floorY: oy,
      }));
    }
    if (y > s.y + 10 && (s.x - x) ** 2 + (s.z - z) ** 2 < 55 * 55) {
      const fx = Math.sin(s.heading);
      const fz = -Math.cos(s.heading);
      const rx = fz;
      const rz = -fx;
      let best: { x: number; z: number; roof: number; score: number } | null = null;
      for (const along of [6, 10, 14, 18, 24, 30]) {
        for (const side of [-22, -14, -8, 8, 14, 22]) {
          const px = s.x + fx * along + rx * side;
          const pz = s.z + fz * along + rz * side;
          const roofY = query.floorBelow(px, y + 4, pz, true);
          if (!(roofY > s.y + 4) || roofY > y - 1.2) continue;
          const dist = Math.hypot(px - x, pz - z) || 1;
          if (dist < 6 || dist > 28) continue;
          const sy = roofY + 2.8;
          const pitch = Math.atan2(sy - y, dist);
          if (pitch > -0.15 || pitch < -1.35) continue;
          if (query.insideSolid(px, sy, pz, 0.5, true)) continue;
          const score = Math.abs(dist - 14) * 0.2 + Math.abs(pitch + 0.62) * 2;
          if (!best || score < best.score) best = { x: px, z: pz, roof: roofY, score };
        }
      }
      if (best) roofs.push(make({
        x: best.x, y: best.roof + 0.8, z: best.z,
        kind: KIND.roof,
        rate: 14,
        life: 4.6,
        size0: 0.55,
        size1: 1.55,
        heat: 0,
        radius: 0.16,
        spread: 0.06,
        rise: 3.1,
        fade: 42,
        aspect: 2.35,
        floorY: best.roof,
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
      x: s.x + hx * 4.4 + rx * 0.8, y: s.y + 1.05, z: s.z + hz * 4.4 + rz * 0.8,
      kind: KIND.stall,
      rate: 16,
      life: 1.4,
      size0: 0.14,
      size1: 0.3,
      heat: 0.12,
      radius: 0.05,
      spread: 0.04,
      rise: 0.72,
      fade: 10,
      aspect: 2.7,
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
          rate: manhole ? 3.2 : 4.2,
          life: manhole ? 1.8 : 2.8,
          size0: manhole ? 0.7 : 0.24,
          size1: manhole ? 1.85 : 0.85,
          heat: 0,
          radius: manhole ? 0.4 : 0.22,
          spread: manhole ? 0.1 : 0.2,
          rise: manhole ? 0.16 : 1.05,
          fade: manhole ? 16 : 22,
          aspect: manhole ? 0.3 : 1.45,
          floorY: p.y,
        }));
      }
    }

    if (!market && WORK.has(b.district.id) && (h % 5) === 1) {
      const p = curb(b, side, 0.7, along * 0.5);
      if (open(query, p.x, p.y, p.z)) {
        barrels.push(make({
          x: p.x, y: p.y + 0.7, z: p.z,
          kind: KIND.barrel,
          rate: 6,
          life: 3.1,
          size0: 0.22,
          size1: 0.62,
          heat: 0.85,
          radius: 0.1,
          spread: 0.08,
          rise: 0.85,
          fade: 18,
          aspect: 1.45,
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
            rate: 5,
            life: 4.4,
            size0: 0.8,
            size1: 2.3,
            heat: 0,
            radius: 0.28,
            spread: 0.14,
            rise: 2.1,
            fade: 42,
            aspect: 1.8,
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
      x: f.x, y: f.y + 1.5, z: f.z,
      kind: KIND.stack,
      rate: 14,
      life: 16,
      size0: 12,
      size1: 16,
      heat: 0.1,
      radius: 4,
      spread: 0.35,
      rise: 7.5,
      fade: 1100,
      aspect: 1.8,
      floorY: f.y - 20,
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
        rate: 16,
        life: 3.0,
        size0: 0.38,
        size1: 0.72,
        heat: 0.55,
        radius: 0.1,
        spread: 0.04,
        rise: 0.85,
        fade: 16,
        aspect: 1.7,
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
