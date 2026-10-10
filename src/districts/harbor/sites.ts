// Pure berth layout. Cranes and ships stay landward of the harbor sea wall.
// The wall polyline is not moved. Nothing here is a real carrier or a logo.
import { hash2i } from '../../core/rng';
import type { CityLayout } from '../../world/layout';
import {
  BOX_H, BOX_L, BOX_W, CRANE_BEHIND, DISTRICT, HOUSE_Y, MAST_Y,
  SHIP_ACROSS, SHIP_H, SHIP_L, blockIndexAt, harborBlock, streetGap,
} from './spec';

const BOOM_TIP = 72;

export interface BerthFrame {
  x: number;
  z: number;
  /** Seaward unit. */
  nx: number;
  nz: number;
  /** Along the wall, A → B. */
  tx: number;
  tz: number;
  /** Yaw that maps local +Z onto the seaward axis. */
  yaw: number;
  /** Hull yaw: local +Z runs along the wall. */
  hullYaw: number;
  phase: number;
  ground: number;
}

export interface StackBox {
  x: number;
  y: number;
  z: number;
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
  color: [number, number, number];
}

export interface WorkLight {
  x: number;
  y: number;
  z: number;
  size: number;
  seed: number;
}

export interface ControlSite {
  i: number;
  j: number;
  x: number;
  z: number;
  y: number;
  /** Local +Z points out the door. */
  yaw: number;
}

export interface HarborSites {
  cranes: BerthFrame[];
  ships: BerthFrame[];
  stacks: StackBox[];
  lights: WorkLight[];
  control: ControlSite | null;
}

const COLORS: Array<[number, number, number]> = [
  [0.42, 0.16, 0.11],
  [0.14, 0.30, 0.32],
  [0.50, 0.38, 0.16],
  [0.22, 0.24, 0.28],
  [0.36, 0.15, 0.16],
  [0.30, 0.26, 0.20],
];

const STEP = 240;

function orient(layout: CityLayout, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz) || 1;
  let nx = -dz / len;
  let nz = dx / len;
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  if (!layout.isOcean(mx + nx * 800, mz + nz * 800) && layout.isOcean(mx - nx * 800, mz - nz * 800)) {
    nx = -nx;
    nz = -nz;
  }
  return { nx, nz, tx: dx / len, tz: dz / len, len };
}

function owned(layout: CityLayout, x: number, z: number, margin: number): boolean {
  if (layout.districtAt(x, z).id !== DISTRICT) return false;
  if (layout.isOcean(x, z)) return false;
  if (layout.isReserved(x, z, margin)) return false;
  if (layout.heightAt(x, z) > 45) return false;
  return true;
}

/** Hull endpoints and the centre stay out of the 30 m streets. */
function hullFits(x: number, z: number, tx: number, tz: number, half: number): boolean {
  const need = 16;
  if (streetGap(x, z) < need) return false;
  if (streetGap(x + tx * half, z + tz * half) < need) return false;
  if (streetGap(x - tx * half, z - tz * half) < need) return false;
  return true;
}

function land(f: { x: number; z: number; nx: number; nz: number }, metres: number): { x: number; z: number } {
  return { x: f.x - f.nx * metres, z: f.z - f.nz * metres };
}

function cardinalYaw(lx: number, lz: number): number {
  if (Math.abs(lz) >= Math.abs(lx)) return lz >= 0 ? 0 : Math.PI;
  return lx >= 0 ? Math.PI / 2 : -Math.PI / 2;
}

let cache: { layout: CityLayout; sites: HarborSites } | null = null;

export function harborSites(layout: CityLayout): HarborSites {
  if (cache?.layout === layout) return cache.sites;
  const sites = build(layout);
  cache = { layout, sites };
  return sites;
}

function build(layout: CityLayout): HarborSites {
  const wall = layout.seaWalls.find((w) => w.id === 'harbor-sea-wall');
  const cranes: BerthFrame[] = [];
  const ships: BerthFrame[] = [];
  const used = new Set<string>();
  if (!wall) return { cranes, ships, stacks: [], lights: [], control: null };

  for (let s = 0; s < wall.pts.length - 1; s++) {
    const ax = wall.pts[s]![0];
    const az = wall.pts[s]![1];
    const bx = wall.pts[s + 1]![0];
    const bz = wall.pts[s + 1]![1];
    const o = orient(layout, ax, az, bx, bz);
    for (let u = 80; u < o.len - 80; u += STEP) {
      const x = ax + o.tx * u;
      const z = az + o.tz * u;
      const shipAt = land({ x, z, nx: o.nx, nz: o.nz }, SHIP_ACROSS);
      const idx = blockIndexAt(shipAt.x, shipAt.z);
      const block = harborBlock(layout, idx.i, idx.j);
      if (!block || layout.districtAt(block.cx, block.cz).id !== DISTRICT) continue;
      const key = `${idx.i},${idx.j}`;
      if (used.has(key)) continue;
      const half = SHIP_L / 2;
      let sx = shipAt.x;
      let sz = shipAt.z;
      if (!hullFits(sx, sz, o.tx, o.tz, half) || !owned(layout, sx, sz, 8)) {
        const near = Math.hypot(block.cx - shipAt.x, block.cz - shipAt.z) < 110;
        if (!near || !hullFits(block.cx, block.cz, o.tx, o.tz, half) || !owned(layout, block.cx, block.cz, 8)) continue;
        sx = block.cx;
        sz = block.cz;
      }
      const craneAt = land({ x: sx, z: sz, nx: o.nx, nz: o.nz }, CRANE_BEHIND);
      if (!owned(layout, craneAt.x, craneAt.z, 14) || streetGap(craneAt.x, craneAt.z) < 22) continue;
      const phase = (hash2i(cranes.length + 3, s, Math.round(u)) % 1000) / 1000;
      const ground = layout.heightAt(craneAt.x, craneAt.z);
      const frame: BerthFrame = {
        x: craneAt.x, z: craneAt.z,
        nx: o.nx, nz: o.nz, tx: o.tx, tz: o.tz,
        yaw: Math.atan2(o.nx, o.nz),
        hullYaw: Math.atan2(o.tx, o.tz),
        phase, ground,
      };
      const ship: BerthFrame = {
        ...frame,
        x: sx, z: sz,
        ground: layout.heightAt(sx, sz),
      };
      used.add(key);
      cranes.push(frame);
      ships.push(ship);
    }
  }

  const hero = cranes.length ? Math.floor(cranes.length / 2) : -1;
  const stacks: StackBox[] = [];
  const lights: WorkLight[] = [];
  for (let i = 0; i < cranes.length; i++) {
    const c = cranes[i]!;
    const ship = ships[i]!;
    pushYard(stacks, c, i, i === hero);
    pushDeck(stacks, ship, i);
    pushLights(lights, c, i);
  }
  return { cranes, ships, stacks, lights, control: hero >= 0 ? controlFor(layout, cranes[hero]!) : null };
}

function pushYard(out: StackBox[], c: BerthFrame, index: number, hero: boolean): void {
  const cols = hero ? 6 : 4;
  const rows = hero ? 4 : 3;
  const col0 = (cols - 1) / 2;
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const along = (col - col0) * (BOX_L + 0.8);
      const back = 16 + row * (BOX_W + 0.7);
      const x = c.x + c.tx * along - c.nx * back;
      const z = c.z + c.tz * along - c.nz * back;
      if (streetGap(x, z) < 18) continue;
      if (streetGap(x + c.tx * 5, z + c.tz * 5) < 16) continue;
      const n = 2 + (hash2i(index + 1, col + 4, row + 9) % 5);
      const color = COLORS[hash2i(index, col, row) % COLORS.length]!;
      for (let k = 0; k < n; k++) {
        out.push({
          x, z,
          y: c.ground + BOX_H * (k + 0.5),
          yaw: c.hullYaw,
          sx: BOX_L, sy: BOX_H, sz: BOX_W,
          color,
        });
      }
    }
  }
}

function pushDeck(out: StackBox[], ship: BerthFrame, index: number): void {
  for (let col = -1; col <= 2; col++) {
    for (let row = 0; row < 2; row++) {
      const along = col * (BOX_L + 0.4);
      const side = (row - 0.5) * (BOX_W + 0.35);
      const x = ship.x + ship.tx * along + ship.nx * side;
      const z = ship.z + ship.tz * along + ship.nz * side;
      const n = 2 + (hash2i(index + 40, col + 3, row) % 3);
      const color = COLORS[hash2i(index + 8, col + 2, row + 1) % COLORS.length]!;
      for (let k = 0; k < n; k++) {
        out.push({
          x, z,
          y: ship.ground + SHIP_H + BOX_H * (k + 0.5),
          yaw: ship.hullYaw,
          sx: BOX_L, sy: BOX_H, sz: BOX_W,
          color,
        });
      }
    }
  }
}

function pushLights(out: WorkLight[], c: BerthFrame, index: number): void {
  const mast = land(c, 6);
  out.push({
    x: mast.x, z: mast.z, y: c.ground + MAST_Y,
    size: 6.5,
    seed: (hash2i(index, 2, 5) % 1000) / 1000,
  });
  out.push({
    x: c.x + c.nx * 46, z: c.z + c.nz * 46, y: c.ground + BOOM_TIP,
    size: 4.2,
    seed: (hash2i(index, 6, 1) % 1000) / 1000,
  });
  out.push({
    x: c.x, z: c.z, y: c.ground + HOUSE_Y + 1.2,
    size: 3.4,
    seed: (hash2i(index, 9, 4) % 1000) / 1000,
  });
}

function controlFor(layout: CityLayout, crane: BerthFrame): ControlSite | null {
  const lx = -crane.nx;
  const lz = -crane.nz;
  const yaw = cardinalYaw(lx, lz);
  const x = crane.x + lx * 58;
  const z = crane.z + lz * 58;
  if (!owned(layout, x, z, 6) || streetGap(x, z) < 20) {
    const idx = blockIndexAt(crane.x, crane.z);
    const block = harborBlock(layout, idx.i, idx.j);
    if (!block) return null;
    return { i: block.i, j: block.j, x: block.cx, z: block.cz - 40, y: block.ground, yaw: 0 };
  }
  const idx = blockIndexAt(x, z);
  const block = harborBlock(layout, idx.i, idx.j);
  if (!block || layout.districtAt(block.cx, block.cz).id !== DISTRICT) return null;
  return { i: block.i, j: block.j, x, z, y: layout.heightAt(x, z), yaw };
}

export function craneNear(sites: HarborSites, x: number, z: number, r: number): boolean {
  const r2 = r * r;
  for (const c of sites.cranes) {
    const dx = c.x - x;
    const dz = c.z - z;
    if (dx * dx + dz * dz < r2) return true;
  }
  return false;
}

/** Control shell. 3 × 5.0 m. The door gap is in the plan, not a second room. */
export const SHELL = { depth: 16, width: 14, height: 15 } as const;
