// Screenshot cameras for Stage 10 (`__nla.coastView`).
import type { CityLayout } from '../../world/layout';
import { planApron } from './apronPlan';
import { fightHit, framePoint } from './profile';
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
  const hit = fightHit(layout);
  const plan = planApron(layout);
  const f = plan.frame;
  const H = f.H;
  const at = (across: number, along: number, y: number) => {
    const p = framePoint(f, across, along);
    return { x: p.x, y, z: p.z };
  };

  if (kind === 'crest') {
    const feet = at(-2, 28, H + 0.02);
    const look = at(4, 90, H + 1.4);
    return walk(feet, look, -0.06);
  }
  if (kind === 'terraces') {
    const tread = hit.piece.profile.treads.find((t) => Math.abs(t.y - 45) < 1) ?? hit.piece.profile.treads[2];
    if (!tread) return null;
    const mid = (tread.inner + tread.outer) / 2;
    const feet = at(mid, 26, tread.y + 0.02);
    const look = at(tread.outer + 18, plan.stairAlong, 16);
    return walk(feet, look, -0.22);
  }
  if (kind === 'apron') {
    const eye = at(plan.across1 + 26, 0, 12);
    const look = at((plan.across0 + plan.across1) / 2, plan.stairAlong, 28);
    return fly(eye, look);
  }
  if (kind === 'spray') {
    const feet = at(plan.across1 - 3.2, 4, plan.deckY + 0.02);
    const look = at(plan.across1 + 6, 28, plan.deckY + 3.2);
    return walk(feet, look, 0.12);
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
    const raw = at(-190, 36, 0);
    const [sx, sz] = snap ? snap(raw.x, raw.z) : [raw.x, raw.z];
    const feet = { x: sx, y: layout.heightAt(sx, sz) + 0.02, z: sz };
    const look = at(-20, 10, 28);
    return walk(feet, look, 0.08);
  }
  const eye = at(-90, -520, 260);
  const look = at(20, 80, 70);
  return fly(eye, look);
}
