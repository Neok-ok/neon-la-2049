// Screenshot and debug cameras for Stage 17 (`__nla.laxView`).
import type { CityLayout } from '../../world/layout';
import { doorSite, padCenter } from './spec';

export type LaxView = 'aerial' | 'downtown' | 'gantry' | 'terminal' | 'burn' | 'interior';

export interface LaxPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  mode: 'walk' | 'fly';
  cockpit?: boolean;
  feet?: { x: number; y: number; z: number };
}

/** downtown frames the centre pad. burn frames the west pad. Both arm a mid-ascent launch. */
export function laxLaunchFor(kind: LaxView): { phase: number; pad: number } | null {
  if (kind === 'downtown') return { phase: 0.45, pad: 1 };
  if (kind === 'burn') return { phase: 0.45, pad: 0 };
  return null;
}

function headingTo(fx: number, fz: number, tx: number, tz: number): number {
  return Math.atan2(tx - fx, -(tz - fz));
}

function walk(
  feet: { x: number; y: number; z: number },
  look: { x: number; y: number; z: number },
): LaxPose {
  const dist = Math.hypot(look.x - feet.x, look.z - feet.z) || 1;
  return {
    x: feet.x, y: feet.y + 1.7, z: feet.z,
    heading: headingTo(feet.x, feet.z, look.x, look.z),
    pitch: Math.atan2(look.y - (feet.y + 1.7), dist),
    mode: 'walk',
    feet,
  };
}

function fly(
  eye: { x: number; y: number; z: number },
  look: { x: number; y: number; z: number },
): LaxPose {
  const dist = Math.hypot(look.x - eye.x, look.z - eye.z) || 1;
  return {
    x: eye.x, y: eye.y, z: eye.z,
    heading: headingTo(eye.x, eye.z, look.x, look.z),
    pitch: Math.atan2(look.y - eye.y, dist),
    mode: 'fly',
    cockpit: true,
  };
}

export function laxCamera(layout: CityLayout, kind: LaxView): LaxPose | null {
  const door = doorSite();
  const doorG = layout.heightAt(door.x, door.z);
  const centre = padCenter(1);
  const west = padCenter(0);
  const westG = layout.heightAt(west.x, west.z);

  if (kind === 'aerial') {
    return fly(
      { x: door.x + 240, y: doorG + 1000, z: door.z + 780 },
      { x: centre.x, y: doorG + 70, z: centre.z },
    );
  }
  if (kind === 'downtown') {
    return fly(
      { x: -220, y: 1320, z: -360 },
      { x: centre.x, y: 1500, z: centre.z },
    );
  }
  if (kind === 'gantry' || kind === 'burn') {
    const feet = { x: west.x + 22, y: westG, z: west.z + 88 };
    return walk(feet, { x: west.x - 32, y: westG + 150, z: west.z });
  }
  if (kind === 'terminal') {
    const feet = { x: door.x + 10, y: doorG, z: door.z - 16 };
    return walk(feet, { x: door.x - 18, y: doorG + 26, z: door.z + 4 });
  }
  if (kind === 'interior') {
    const feet = { x: door.x, y: doorG, z: door.z + 4.8 };
    return walk(feet, { x: door.x, y: doorG + 1.5, z: door.z + 9 });
  }
  return null;
}
