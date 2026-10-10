// Screenshot and debug cameras for Stage 20 (`__nla.longBeachView`).
import type { CityLayout } from '../../world/layout';
import { harborSites } from '../harbor/sites';
import { FREIGHT_I, HERO_A, HERO_B, BLOCK_A, BLOCK_B, concourseDoor, longBeachBlock } from './spec';

export type LongBeachView = 'aerial' | 'wall' | 'canyon' | 'lakewood' | 'interior' | 'lanes';

export interface LongBeachPose {
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
): LongBeachPose {
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
): LongBeachPose {
  const dist = Math.hypot(look.x - eye.x, look.z - eye.z) || 1;
  return {
    x: eye.x, y: eye.y, z: eye.z,
    heading: headingTo(eye.x, eye.z, look.x, look.z),
    pitch: Math.atan2(look.y - eye.y, dist),
    mode: 'fly', cockpit: true,
  };
}

function heroCenter(layout: CityLayout): { x: number; z: number; ground: number } {
  const b = longBeachBlock(layout, HERO_A.i, HERO_A.j);
  return {
    x: b?.cx ?? (HERO_A.j + 0.5) * BLOCK_B,
    z: b?.cz ?? -(HERO_A.i + 0.5) * BLOCK_A,
    ground: b?.ground ?? 0,
  };
}

export function longBeachCamera(layout: CityLayout, kind: LongBeachView): LongBeachPose | null {
  const hero = heroCenter(layout);
  const door = concourseDoor(layout);
  const other = longBeachBlock(layout, HERO_B.i, HERO_B.j);

  if (kind === 'aerial') {
    return fly(
      { x: hero.x - 420, y: hero.ground + 1000, z: hero.z + 680 },
      { x: hero.x + 40, y: hero.ground + 70, z: hero.z - 80 },
    );
  }
  if (kind === 'wall') {
    const cranes = harborSites(layout).cranes;
    let crane = cranes[0];
    for (const c of cranes) if (!crane || c.x > crane.x) crane = c;
    if (!crane) return null;
    const dx = hero.x - crane.x;
    const dz = hero.z - crane.z;
    const len = Math.hypot(dx, dz) || 1;
    // Seaward of the eastern crane and beside the boom, low enough that the 80 m
    // house stays in frame, high enough to clear the container tops.
    const eye = {
      x: crane.x - (dx / len) * 170 - crane.tz * 46,
      y: 64,
      z: crane.z - (dz / len) * 170 + crane.tx * 46,
    };
    return fly(eye, { x: hero.x, y: hero.ground + 120, z: hero.z });
  }
  if (kind === 'canyon') {
    const feet = { x: door.x + 6, y: door.y + 0.02, z: door.z + 14 };
    const look = { x: door.x - 2, y: door.y + 36, z: door.z - 28 };
    return walk(feet, look);
  }
  if (kind === 'lakewood') {
    // Above the Lakewood roofs, just north of lat 33.800, looking south into the core.
    return fly(
      { x: hero.x + 40, y: hero.ground + 168, z: 27580 },
      { x: hero.x - 20, y: hero.ground + 50, z: 29200 },
    );
  }
  if (kind === 'interior') {
    const c = Math.cos(door.yaw);
    const s = Math.sin(door.yaw);
    const into = (lx: number, lz: number, y: number) => ({
      x: door.x + lx * c + lz * s,
      y: door.y + y,
      z: door.z - lx * s + lz * c,
    });
    const feet = into(0.2, -4.8, 0.02);
    const look = into(-0.6, -8.2, 1.3);
    return walk(feet, look, 0.02);
  }
  if (kind === 'lanes') {
    const z = -FREIGHT_I * BLOCK_A;
    const x = ((other?.j ?? HERO_A.j) + 0.5) * BLOCK_B;
    return fly(
      { x: x - 80, y: hero.ground + 214, z: z + 36 },
      { x: x + 220, y: hero.ground + 200, z },
    );
  }
  return null;
}
