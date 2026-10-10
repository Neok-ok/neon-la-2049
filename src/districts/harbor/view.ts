// Screenshot and debug cameras for Stage 19 (`__nla.harborView`).
import { distToSegment, type CityLayout } from '../../world/layout';
import { harborSites, type BerthFrame } from './sites';

export type HarborView = 'aerial' | 'wall' | 'stacks' | 'ship' | 'street' | 'interior' | 'lax';

export interface HarborPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  mode: 'walk' | 'fly';
  cockpit?: boolean;
  feet?: { x: number; y: number; z: number };
}

function headingTo(fx: number, fz: number, tx: number, tz: number): number {
  return Math.atan2(tx - fx, -(tz - fz));
}

function walk(
  feet: { x: number; y: number; z: number },
  look: { x: number; y: number; z: number },
  pitch?: number,
): HarborPose {
  const dist = Math.hypot(look.x - feet.x, look.z - feet.z) || 1;
  const p = pitch ?? Math.atan2(look.y - (feet.y + 1.7), dist);
  return {
    x: feet.x, y: feet.y + 1.7, z: feet.z,
    heading: headingTo(feet.x, feet.z, look.x, look.z),
    pitch: p, mode: 'walk', feet,
  };
}

function fly(
  eye: { x: number; y: number; z: number },
  look: { x: number; y: number; z: number },
): HarborPose {
  const dist = Math.hypot(look.x - eye.x, look.z - eye.z) || 1;
  return {
    x: eye.x, y: eye.y, z: eye.z,
    heading: headingTo(eye.x, eye.z, look.x, look.z),
    pitch: Math.atan2(look.y - eye.y, dist),
    mode: 'fly', cockpit: true,
  };
}

function heroPair(layout: CityLayout): { crane: BerthFrame; ship: BerthFrame } | null {
  const sites = harborSites(layout);
  if (!sites.cranes.length) return null;
  const i = Math.floor(sites.cranes.length / 2);
  return { crane: sites.cranes[i]!, ship: sites.ships[i]! };
}

function wallPoint(layout: CityLayout, x: number, z: number): { x: number; z: number; crest: number } | null {
  const wall = layout.seaWalls.find((w) => w.id === 'harbor-sea-wall');
  if (!wall) return null;
  let best: { x: number; z: number; d: number } | null = null;
  for (let i = 0; i < wall.pts.length - 1; i++) {
    const ax = wall.pts[i]![0];
    const az = wall.pts[i]![1];
    const bx = wall.pts[i + 1]![0];
    const bz = wall.pts[i + 1]![1];
    const d = distToSegment(x, z, ax, az, bx, bz);
    if (best && d >= best.d) continue;
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    best = { x: ax + dx * t, z: az + dz * t, d };
  }
  if (!best) return null;
  return { x: best.x, z: best.z, crest: wall.crestHeight };
}

export function harborCamera(layout: CityLayout, kind: HarborView): HarborPose | null {
  const pair = heroPair(layout);
  if (!pair) return null;
  const { crane, ship } = pair;
  const door = harborSites(layout).control;

  if (kind === 'aerial') {
    return fly(
      { x: crane.x - crane.tx * 280 - crane.nx * 80, y: crane.ground + 1000, z: crane.z - crane.tz * 280 - crane.nz * 80 },
      { x: crane.x + crane.tx * 160, y: crane.ground + 40, z: crane.z + crane.tz * 160 },
    );
  }
  if (kind === 'wall') {
    const hit = wallPoint(layout, crane.x, crane.z);
    if (!hit) return null;
    // Seaward of the crest, low, so the 80 m house reads over the 75 m wall.
    const eye = {
      x: hit.x + crane.nx * 170,
      y: 28,
      z: hit.z + crane.nz * 170,
    };
    return fly(eye, { x: crane.x, y: crane.ground + 62, z: crane.z });
  }
  if (kind === 'stacks') {
    const feet = {
      x: crane.x - crane.nx * 22 + crane.tx * 4,
      y: crane.ground + 0.02,
      z: crane.z - crane.nz * 22 + crane.tz * 4,
    };
    const look = {
      x: crane.x - crane.nx * 34,
      y: crane.ground + 6,
      z: crane.z - crane.nz * 34,
    };
    return walk(feet, look);
  }
  if (kind === 'ship') {
    return fly(
      { x: ship.x + ship.nx * 36, y: ship.ground + 14, z: ship.z + ship.nz * 36 },
      { x: ship.x - ship.tx * 8, y: ship.ground + 16, z: ship.z - ship.tz * 8 },
    );
  }
  if (kind === 'street') {
    if (!door) return null;
    const feet = { x: door.x - 42, y: door.y + 0.02, z: door.z - 18 };
    const look = { x: crane.x, y: crane.ground + 28, z: crane.z };
    return walk(feet, look);
  }
  if (kind === 'interior') {
    if (!door) return null;
    const c = Math.cos(door.yaw);
    const s = Math.sin(door.yaw);
    const into = (lx: number, lz: number, y: number) => ({
      x: door.x + lx * c + lz * s,
      y: door.y + y,
      z: door.z - lx * s + lz * c,
    });
    const feet = into(0.2, -4.6, 0.02);
    const look = into(-0.4, -7.4, 1.35);
    return walk(feet, look, 0.02);
  }
  if (kind === 'lax') {
    const lax = layout.landmarkById('lax-spaceport-towers');
    if (!lax) return null;
    return fly(
      { x: lax.x + 40, y: 420, z: lax.z + 1400 },
      { x: crane.x, y: crane.ground + 70, z: crane.z },
    );
  }
  return null;
}
