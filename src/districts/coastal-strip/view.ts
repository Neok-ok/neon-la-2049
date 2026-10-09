// Screenshot cameras for Stage 10 (`__nla.coastView`).
import type { CityLayout } from '../../world/layout';
import { planApron } from './apronPlan';
import { framePoint } from './profile';
import { pierFocusPoint } from './piers';

export type CoastView = 'crest' | 'terraces' | 'apron' | 'spray' | 'piers' | 'blocks' | 'aerial';

export interface CoastPose {
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

function pitchTo(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number): number {
  return Math.atan2(ty - fy, Math.hypot(tx - fx, tz - fz) || 1);
}

function walk(
  feet: { x: number; y: number; z: number },
  look: { x: number; y: number; z: number },
  pitch: number,
): CoastPose {
  return {
    x: feet.x,
    y: feet.y + 1.7,
    z: feet.z,
    heading: headingTo(feet.x, feet.z, look.x, look.z),
    pitch,
    mode: 'walk',
    feet,
  };
}

function fly(
  eye: { x: number; y: number; z: number },
  look: { x: number; y: number; z: number },
): CoastPose {
  return {
    x: eye.x,
    y: eye.y - 1.22,
    z: eye.z,
    heading: headingTo(eye.x, eye.z, look.x, look.z),
    pitch: pitchTo(eye.x, eye.y, eye.z, look.x, look.y, look.z),
    mode: 'fly',
    cockpit: true,
  };
}

export function coastCamera(
  layout: CityLayout,
  kind: CoastView,
  snap?: (x: number, z: number) => [number, number],
): CoastPose | null {
  const plan = planApron(layout);
  const f = plan.frame;
  const H = f.H;
  const at = (across: number, along: number, y: number) => {
    const p = framePoint(f, across, along);
    return { x: p.x, y, z: p.z };
  };

  if (kind === 'crest') {
    // Seaward side of the crest road, looking along the lamps and down the face.
    const feet = at(3, 6, H + 0.02);
    const look = at(22, 42, H - 18);
    return walk(feet, look, -0.32);
  }
  if (kind === 'terraces') {
    // Off the steep face, not on the flat collider (that box sits inside the slope).
    // Ladder chainage is about +88 m from the fight frame.
    const eye = at(58, 74, 48);
    const look = at(48, 88, 54);
    return fly(eye, look);
  }
  if (kind === 'apron') {
    const eye = at(plan.across1 + 18, -4, 12.5);
    const look = at(plan.across1 - 14, 10, 9);
    return fly(eye, look);
  }
  if (kind === 'spray') {
    const feet = at(plan.across1 - 14, -2, plan.deckY + 0.02);
    const look = at(plan.across1 + 6, 12, plan.deckY + 2.2);
    return walk(feet, look, -0.1);
  }
  if (kind === 'piers') {
    const pier = pierFocusPoint();
    if (!pier) return null;
    const eye = {
      x: pier.x + pier.frame.nx * 28 + pier.frame.tx * -18,
      y: 14,
      z: pier.z + pier.frame.nz * 28 + pier.frame.tz * -18,
    };
    return fly(eye, { x: pier.x, y: pier.y, z: pier.z });
  }
  if (kind === 'blocks') {
    // Seed only. App re-aims this onto the nearest block's street axis.
    const raw = at(-190, 36, 0);
    const [sx, sz] = snap ? snap(raw.x, raw.z) : [raw.x, raw.z];
    const feet = { x: sx, y: layout.heightAt(sx, sz) + 0.02, z: sz };
    const look = at(-40, 70, 16);
    return walk(feet, look, 0.06);
  }
  const eye = at(-90, -520, 260);
  const look = at(20, 80, 70);
  return fly(eye, look);
}
