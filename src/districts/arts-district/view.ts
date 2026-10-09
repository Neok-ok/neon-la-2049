// Screenshot and debug cameras for Stage 9 (`__nla.artsView`).
import type { CityLayout } from '../../world/layout';
import { eastClearance, planArts } from './plan';
import {
  DOOR_S, artsBlock, doorWorld, pourBlock, type ArtsBlock,
} from './spec';

export type ArtsView = 'aerial' | 'stacks' | 'foundry' | 'pipes' | 'river' | 'street' | 'interior';

export interface ArtsPose {
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

function at(b: ArtsBlock, s: number, t: number, y: number): { x: number; y: number; z: number } {
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
): ArtsPose {
  return {
    x: feet.x, y: feet.y + 1.7, z: feet.z,
    heading: headingTo(feet.x, feet.z, look.x, look.z),
    pitch, mode: 'walk', feet,
  };
}

function fly(
  eye: { x: number; y: number; z: number },
  look: { x: number; y: number; z: number },
): ArtsPose {
  const dist = Math.hypot(look.x - eye.x, look.z - eye.z) || 1;
  return {
    x: eye.x, y: eye.y, z: eye.z,
    heading: headingTo(eye.x, eye.z, look.x, look.z),
    pitch: Math.atan2(look.y - eye.y, dist),
    mode: 'fly', cockpit: true,
  };
}

function owned(layout: CityLayout, x: number, z: number): boolean {
  return layout.districtAt(x, z).id === 'arts-district' && !layout.isReserved(x, z, 1.2);
}

function blocks(layout: CityLayout): ArtsBlock[] {
  const out: ArtsBlock[] = [];
  for (let i = -15; i <= -1; i++) {
    for (let j = 2; j <= 12; j++) {
      const b = artsBlock(layout, i, j);
      if (layout.districtAt(b.cx, b.cz).id !== 'arts-district') continue;
      if (layout.isReserved(b.cx, b.cz, 2)) continue;
      out.push(b);
    }
  }
  return out;
}

export function artsCamera(layout: CityLayout, kind: ArtsView): ArtsPose | null {
  const pour = pourBlock(layout);
  if (kind === 'aerial') {
    const b = pour ?? blocks(layout)[0];
    if (!b) return null;
    return fly(
      { x: b.cx - 260, y: b.ground + 168, z: b.cz + 90 },
      { x: b.cx + 70, y: b.ground + 36, z: b.cz - 70 },
    );
  }
  if (kind === 'interior') {
    if (!pour) return null;
    const door = doorWorld(pour);
    // Off the crucible, inside the bay. Local +Z is south, so −Z walks into the hall.
    // Clear of the steam column and the crucible. Local +Z is south.
    const feet = { x: door.x - 1.8, y: door.y + 0.16, z: door.z - 5.4 };
    const look = { x: door.x + 0.2, y: door.y + 1.45, z: door.z - 8.6 };
    return walk(feet, look, 0.08);
  }
  if (kind === 'foundry') {
    if (!pour) return null;
    const feet = at(pour, DOOR_S - 12, 0.4, 0.04);
    const look = at(pour, DOOR_S + 0.4, 0, 2.8);
    if (!owned(layout, feet.x, feet.z)) return null;
    return walk(feet, look, -0.04);
  }
  if (kind === 'stacks') {
    for (const b of blocks(layout)) {
      const stack = planArts(b, layout).boxes.find((box) => box.h > 70);
      if (!stack) continue;
      const t = Math.max(-18, Math.min(18, stack.t * 0.25));
      const near = at(b, -(b.la / 2 + 8), t, 22);
      const far = at(b, -(b.la / 2 + 80), t, 24);
      const eye = owned(layout, far.x, far.z) ? far : near;
      const look = at(b, stack.s, stack.t, stack.h * 0.55);
      if (!owned(layout, eye.x, eye.z)) continue;
      return fly(eye, look);
    }
    return null;
  }
  if (kind === 'pipes') {
    for (const b of blocks(layout)) {
      const pipe = planArts(b, layout).boxes.find((box) => box.h < 0.5 && box.base > 6 && box.la < 1 && box.lb > 20);
      if (!pipe) continue;
      const feet = at(b, b.la / 2 + 7, -6, 0.04);
      const look = at(b, pipe.s, 12, pipe.base + 0.6);
      if (!owned(layout, feet.x, feet.z)) continue;
      return walk(feet, look, -0.24);
    }
    return null;
  }
  if (kind === 'river') {
    const anchor = pour?.cz ?? 1200;
    let best: { b: ArtsBlock; east: number; score: number } | null = null;
    for (const b of blocks(layout)) {
      const east = eastClearance(layout, b);
      if (east > 16 || east < -28) continue;
      const score = Math.abs(b.cz - anchor) + Math.max(0, east) * 8;
      if (!best || score < best.score) best = { b, east, score };
    }
    if (!best) return null;
    // Easternmost stance that is still on the works, looking down at the channel.
    let feet: { x: number; y: number; z: number } | null = null;
    for (let t = best.b.lb / 2 + 8; t >= -best.b.lb / 2; t -= 2) {
      const p = at(best.b, 4, t, 0.04);
      if (!owned(layout, p.x, p.z)) continue;
      feet = p;
      break;
    }
    if (!feet) return null;
    return walk(feet, { x: feet.x + 16, y: feet.y - 1.4, z: feet.z + 2 }, -0.48);
  }
  const anchorZ = pour?.cz ?? 1200;
  let street: { b: ArtsBlock; score: number } | null = null;
  for (const b of blocks(layout)) {
    const plan = planArts(b, layout);
    if (plan.foundry || eastClearance(layout, b) < 24) continue;
    const hall = plan.boxes.find((box) => box.h >= 12 && box.h <= 45 && box.base < 0.2 && box.la > 20);
    if (!hall) continue;
    const score = Math.abs(b.cz - anchorZ);
    if (!street || score < street.score) street = { b, score };
  }
  if (!street) return null;
  const s = -(street.b.la / 2 + 8);
  const feet = at(street.b, s, -16, 0.04);
  const look = at(street.b, s, 36, 2.4);
  if (!owned(layout, feet.x, feet.z)) return null;
  return walk(feet, look, 0.05);
}
