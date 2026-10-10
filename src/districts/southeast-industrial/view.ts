// Screenshot and debug cameras for Stage 15 (`__nla.southeastView`).
import type { CityLayout } from '../../world/layout';
import type { RefineryBlock } from '../_shared/refinery/plan';
import { planSoutheast } from './plan';
import { DOOR_S, LATTICE, doorWorld, pumpBlock, southeastBlock } from './spec';

export type SoutheastView = 'aerial' | 'flare' | 'tanks' | 'pipes' | 'street' | 'interior' | 'downtown';

export interface SoutheastPose {
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
): SoutheastPose {
  return {
    x: feet.x, y: feet.y + 1.7, z: feet.z,
    heading: headingTo(feet.x, feet.z, look.x, look.z),
    pitch, mode: 'walk', feet,
  };
}

function fly(
  eye: { x: number; y: number; z: number },
  look: { x: number; y: number; z: number },
): SoutheastPose {
  const dist = Math.hypot(look.x - eye.x, look.z - eye.z) || 1;
  return {
    x: eye.x, y: eye.y, z: eye.z,
    heading: headingTo(eye.x, eye.z, look.x, look.z),
    pitch: Math.atan2(look.y - eye.y, dist),
    mode: 'fly', cockpit: true,
  };
}

function owned(layout: CityLayout, x: number, z: number): boolean {
  return layout.districtAt(x, z).id === 'southeast-industrial' && !layout.isReserved(x, z, 2);
}

function blocks(layout: CityLayout): RefineryBlock[] {
  const out: RefineryBlock[] = [];
  for (let i = LATTICE.i0; i <= LATTICE.i1; i++) {
    for (let j = LATTICE.j0; j <= LATTICE.j1; j++) {
      const b = southeastBlock(layout, i, j);
      if (!b) continue;
      if (!owned(layout, b.cx, b.cz)) continue;
      if (b.ground > 45) continue;
      out.push(b);
    }
  }
  const pump = pumpBlock(layout);
  if (!pump) return out;
  out.sort((a, b) => Math.hypot(a.cx - pump.cx, a.cz - pump.cz) - Math.hypot(b.cx - pump.cx, b.cz - pump.cz));
  return out;
}

export function southeastCamera(layout: CityLayout, kind: SoutheastView): SoutheastPose | null {
  const pump = pumpBlock(layout);
  if (kind === 'downtown') {
    const look = pump ?? { cx: 8400, ground: 0, cz: 6400 };
    return fly(
      { x: 120, y: 1100, z: -480 },
      { x: look.cx, y: look.ground + 90, z: look.cz },
    );
  }
  if (kind === 'aerial') {
    const b = pump ?? blocks(layout)[0];
    if (!b) return null;
    return fly(
      { x: b.cx - 380, y: b.ground + 1000, z: b.cz - 220 },
      { x: b.cx + 620, y: b.ground + 70, z: b.cz + 480 },
    );
  }
  if (kind === 'interior') {
    if (!pump) return null;
    const door = doorWorld(pump);
    const feet = { x: door.x - 0.4, y: door.y + 0.02, z: door.z - 6.2 };
    const look = { x: door.x + 0.3, y: door.y + 1.35, z: door.z - 8.4 };
    return walk(feet, look, 0.04);
  }
  if (kind === 'street') {
    if (!pump) return null;
    const feet = at(pump, DOOR_S - 14, -4.2, 0.02);
    const look = at(pump, DOOR_S + 1, 1.2, 3.2);
    if (!owned(layout, feet.x, feet.z)) return null;
    return walk(feet, look, -0.02);
  }
  if (kind === 'flare') {
    for (const b of blocks(layout)) {
      const plan = planSoutheast(b, layout);
      if (plan.kind === 'pump') continue;
      const stack = plan.boxes.find((box) => box.h >= 84 && box.lb < 8 && box.la < 8);
      if (!stack || !plan.flames.length) continue;
      const eye = at(b, stack.s - 48, stack.t - 22, stack.h * 0.55);
      const look = at(b, stack.s, stack.t, stack.h * 0.92);
      if (!owned(layout, eye.x, eye.z)) continue;
      return fly(eye, look);
    }
    return null;
  }
  if (kind === 'tanks') {
    for (const b of blocks(layout)) {
      const plan = planSoutheast(b, layout);
      if (plan.kind !== 'tank') continue;
      const cyl = plan.props.find((p) => (p.template === 'drum' || p.template === 'cyl') && p.sy > 8);
      if (!cyl) continue;
      // South of the shell, in the yard, looking across the row so the cylinder fills the frame.
      const feet = { x: cyl.x - 6, y: b.ground + 0.02, z: cyl.z + cyl.sx * 0.5 + 16 };
      const look = { x: cyl.x + 4, y: b.ground + cyl.sy * 0.42, z: cyl.z - 6 };
      if (!owned(layout, feet.x, feet.z)) continue;
      const dist = Math.hypot(look.x - feet.x, look.z - feet.z) || 1;
      const pitch = Math.atan2(look.y - (feet.y + 1.7), dist);
      return walk(feet, look, pitch);
    }
    return null;
  }
  if (kind === 'pipes') {
    for (const b of blocks(layout)) {
      const plan = planSoutheast(b, layout);
      if (plan.kind !== 'pipes') continue;
      const pipe = plan.boxes.find((box) => box.base > 6 && box.h < 0.5 && box.lb > 20);
      if (!pipe) continue;
      // In the yard, south of the north rack, clear of the lamp line and the posts.
      const feet = at(b, pipe.s - 22, -8, 0.02);
      const look = at(b, pipe.s, 16, pipe.base + 0.3);
      if (!owned(layout, feet.x, feet.z)) continue;
      return walk(feet, look, 0.16);
    }
    return null;
  }
  return null;
}
