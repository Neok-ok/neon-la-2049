// Screenshot and debug cameras for Stage 18 (`__nla.southBayView`).
import { distToSegment, type CityLayout } from '../../world/layout';
import type { RefineryBlock } from '../_shared/refinery/plan';
import { planSouthBay } from './plan';
import { COAST_X, DOOR_S, LATTICE, controlBlock, doorWorld, southBayBlock } from './spec';

export type SouthBayView = 'aerial' | 'lax' | 'tanks' | 'spheres' | 'wall' | 'flare' | 'street' | 'interior' | 'downtown';

export interface SouthBayPose {
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

function at(b: RefineryBlock, s: number, t: number, y: number): { x: number; y: number; z: number } {
  return {
    x: b.cx + b.ax * s + b.bx * t,
    y: b.ground + y,
    z: b.cz + b.az * s + b.bz * t,
  };
}

function walk(
  feet: { x: number; y: number; z: number },
  look: { x: number; y: number; z: number },
  pitch: number,
): SouthBayPose {
  return {
    x: feet.x, y: feet.y + 1.7, z: feet.z,
    heading: headingTo(feet.x, feet.z, look.x, look.z),
    pitch, mode: 'walk', feet,
  };
}

function fly(
  eye: { x: number; y: number; z: number },
  look: { x: number; y: number; z: number },
): SouthBayPose {
  const dist = Math.hypot(look.x - eye.x, look.z - eye.z) || 1;
  return {
    x: eye.x, y: eye.y, z: eye.z,
    heading: headingTo(eye.x, eye.z, look.x, look.z),
    pitch: Math.atan2(look.y - eye.y, dist),
    mode: 'fly', cockpit: true,
  };
}

function nearestSeaWall(layout: CityLayout, x: number, z: number): { x: number; z: number; d: number; crest: number } | null {
  let best: { x: number; z: number; d: number; crest: number } | null = null;
  for (const wall of layout.seaWalls) {
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
      best = { x: ax + dx * t, z: az + dz * t, d, crest: wall.crestHeight };
    }
  }
  return best;
}

function owned(layout: CityLayout, x: number, z: number): boolean {
  return layout.districtAt(x, z).id === 'south-bay-refineries' && !layout.isReserved(x, z, 2);
}

function blocks(layout: CityLayout): RefineryBlock[] {
  const out: RefineryBlock[] = [];
  const home = controlBlock(layout);
  for (let i = LATTICE.i0; i <= LATTICE.i1; i++) {
    for (let j = LATTICE.j0; j <= LATTICE.j1; j++) {
      const b = southBayBlock(layout, i, j);
      if (!b || !owned(layout, b.cx, b.cz) || b.ground > 45) continue;
      out.push(b);
    }
  }
  if (!home) return out;
  out.sort((a, b) => Math.hypot(a.cx - home.cx, a.cz - home.cz) - Math.hypot(b.cx - home.cx, b.cz - home.cz));
  return out;
}

export function southBayCamera(layout: CityLayout, kind: SouthBayView): SouthBayPose | null {
  const home = controlBlock(layout);
  const flare = layout.landmarkById('el-segundo-refinery');
  const lax = layout.landmarkById('lax-spaceport-towers');

  if (kind === 'downtown') {
    if (flare) return fly({ x: 180, y: 980, z: 420 }, { x: flare.x, y: flare.height * 0.7, z: flare.z });
    if (!home) return null;
    return fly({ x: 180, y: 980, z: 420 }, { x: home.cx, y: 80, z: home.cz });
  }
  if (kind === 'lax') {
    if (!flare || !lax) return null;
    return fly(
      { x: lax.x + 60, y: 220, z: lax.z + 980 },
      { x: flare.x + 240, y: 90, z: flare.z },
    );
  }
  if (kind === 'aerial') {
    const b = home ?? blocks(layout)[0];
    if (!b) return null;
    return fly(
      { x: b.cx - 260, y: b.ground + 1000, z: b.cz - 160 },
      { x: b.cx + 640, y: b.ground + 50, z: b.cz + 420 },
    );
  }
  if (kind === 'interior') {
    if (!home) return null;
    const door = doorWorld(home);
    const feet = { x: door.x - 0.3, y: door.y + 0.02, z: door.z - 6.6 };
    const look = { x: door.x + 0.2, y: door.y + 1.4, z: door.z - 9.2 };
    return walk(feet, look, 0.04);
  }
  if (kind === 'street') {
    if (!home) return null;
    const feet = at(home, DOOR_S - 16, -5.4, 0.02);
    const look = at(home, DOOR_S + 1, 0.4, 4.2);
    if (!owned(layout, feet.x, feet.z)) return null;
    return walk(feet, look, -0.02);
  }
  if (kind === 'flare') {
    for (const b of blocks(layout)) {
      const plan = planSouthBay(b, layout);
      if (plan.kind === 'pump') continue;
      const stack = plan.boxes.find((box) => box.h >= 100 && box.lb < 8 && box.la < 8);
      if (!stack || !plan.flames.length) continue;
      const eye = at(b, stack.s - 52, stack.t - 24, stack.h * 0.52);
      const look = at(b, stack.s, stack.t, stack.h * 0.94);
      if (!owned(layout, eye.x, eye.z)) continue;
      return fly(eye, look);
    }
    return null;
  }
  if (kind === 'tanks') {
    for (const b of blocks(layout)) {
      const plan = planSouthBay(b, layout);
      if (plan.kind !== 'tank') continue;
      const cyl = plan.props.find((p) => p.template === 'drum' && p.sy > 8);
      if (!cyl) continue;
      const feet = { x: cyl.x - 6, y: b.ground + 0.02, z: cyl.z + cyl.sx * 0.5 + 16 };
      const look = { x: cyl.x + 4, y: b.ground + cyl.sy * 0.42, z: cyl.z - 6 };
      if (!owned(layout, feet.x, feet.z)) continue;
      const dist = Math.hypot(look.x - feet.x, look.z - feet.z) || 1;
      const pitch = Math.atan2(look.y - (feet.y + 1.7), dist);
      return walk(feet, look, pitch);
    }
    return null;
  }
  if (kind === 'spheres') {
    for (const b of blocks(layout)) {
      const plan = planSouthBay(b, layout);
      if (plan.kind !== 'sphere') continue;
      const shell = plan.props.find((p) => p.template === 'sphere' && p.sy > 12);
      if (!shell) continue;
      const feet = { x: shell.x - 4, y: b.ground + 0.02, z: shell.z + shell.sy * 0.5 + 14 };
      const look = { x: shell.x + 2, y: b.ground + shell.sy * 0.45, z: shell.z - 4 };
      if (!owned(layout, feet.x, feet.z)) continue;
      const dist = Math.hypot(look.x - feet.x, look.z - feet.z) || 1;
      const pitch = Math.atan2(look.y - (feet.y + 1.7), dist);
      return walk(feet, look, pitch);
    }
    return null;
  }
  if (kind === 'wall') {
    let best: RefineryBlock | null = null;
    let hit: { x: number; z: number; crest: number } | null = null;
    let bestD = Infinity;
    for (const b of blocks(layout)) {
      if (b.cx >= COAST_X) continue;
      const plan = planSouthBay(b, layout);
      if (plan.kind !== 'sphere' && plan.kind !== 'tank') continue;
      const wall = nearestSeaWall(layout, b.cx, b.cz);
      if (!wall || wall.d >= bestD) continue;
      best = b;
      bestD = wall.d;
      hit = wall;
    }
    if (!best || !hit) return null;
    // The west face of this block is already the coastal strip. Stand on the east side
    // of the yard so the tanks sit between the camera and the wall.
    const eye = at(best, 0, best.lb * 0.35, 42);
    if (!owned(layout, eye.x, eye.z)) return fly(
      { x: best.cx, y: best.ground + 42, z: best.cz },
      { x: hit.x, y: hit.crest * 0.72, z: hit.z },
    );
    return fly(eye, { x: hit.x, y: hit.crest * 0.72, z: hit.z });
  }
  return null;
}
