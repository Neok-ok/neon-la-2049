// Screenshot and debug cameras for Stage 7 (`__nla.wallaceView`).
import type { CityLayout } from '../../world/layout';
import { bearingToYaw } from '../../world/geo';
import { xformXZ, type PlaceFrame } from '../../world/interiors';
import { COURT, factoryStreetX, localToWorld } from './spec';
import { atriumFrame } from './interior';

export type WallaceView = 'approach' | 'plaza' | 'face' | 'satellite' | 'factories' | 'convoy' | 'oldpyramids' | 'atrium';

export interface WallacePose {
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

export function wallaceCamera(layout: CityLayout, kind: WallaceView): WallacePose | null {
  const pyr = layout.landmarkById('wallace-pyramid');
  if (!pyr) return null;
  const yaw = bearingToYaw(pyr.bearingDeg);
  const g = layout.heightAt(pyr.x, pyr.z);
  const world = (lx: number, y: number, lz: number) => {
    const [x, z] = localToWorld(pyr.x, pyr.z, yaw, lx, lz);
    return { x, y: g + y, z };
  };
  const walk = (
    feet: { x: number; y: number; z: number },
    look: { x: number; y: number; z: number },
    pitch: number,
  ): WallacePose => ({
    x: feet.x, y: feet.y + 1.7, z: feet.z,
    heading: headingTo(feet.x, feet.z, look.x, look.z),
    pitch, mode: 'walk', feet,
  });
  const fly = (
    eye: { x: number; y: number; z: number },
    look: { x: number; y: number; z: number },
    cockpit = true,
  ): WallacePose => ({
    x: eye.x, y: eye.y, z: eye.z,
    heading: headingTo(eye.x, eye.z, look.x, look.z),
    pitch: pitchTo(eye.x, eye.y + 1.22, eye.z, look.x, look.y, look.z),
    mode: 'fly', cockpit,
  });

  if (kind === 'approach') {
    // In the walled causeway, above the truck lanes, looking south at the portal.
    const eye = world(0, 6.4, COURT.roadNorth + 78);
    const look = world(0, 42, -1900);
    return fly(eye, look);
  }
  if (kind === 'plaza') {
    // North court, through the security gap, so the paving and the stair read with the portal.
    const feet = world(6, 0.16, -2068);
    const look = world(0, 26, -1760);
    return walk(feet, look, 0.14);
  }
  if (kind === 'face') {
    // On the plinth, east of the pylons, a few dozen metres off the stone.
    const feet = world(248, COURT.deckY + 0.08, -1662);
    const look = world(300, 14, -1594);
    return walk(feet, look, 0.2);
  }
  if (kind === 'satellite') {
    const s = layout.landmarkById('wallace-satellite-a');
    if (!s) return null;
    const sg = layout.heightAt(s.x, s.z);
    const y = sg + s.height * 0.42;
    const eye = { x: s.x + s.baseWidth * 0.5 + 260, y, z: s.z - 30 };
    const look = { x: s.x, y: y + 20, z: s.z };
    return fly(eye, look);
  }
  if (kind === 'factories' || kind === 'convoy') {
    const sx = factoryStreetX(pyr.x);
    const eye = { x: sx + (kind === 'convoy' ? 18 : 14), y: g + (kind === 'convoy' ? 22 : 32), z: pyr.z + 640 };
    const look = { x: sx - 8, y: g + (kind === 'convoy' ? 12 : 16), z: pyr.z + (kind === 'convoy' ? 1080 : 1180) };
    return fly(eye, look);
  }
  if (kind === 'oldpyramids') {
    const n = layout.landmarkById('old-pyramid-north');
    const s = layout.landmarkById('old-pyramid-south');
    if (!n || !s) return null;
    const dx = s.x - n.x;
    const dz = s.z - n.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    const ng = layout.heightAt(n.x, n.z);
    const mx = (n.x + s.x) / 2;
    const mz = (n.z + s.z) / 2;
    // Beside the pair, outside both reserves, so both silhouettes and the near ring are in frame.
    const side = 720;
    const eye = { x: mx - uz * side, y: ng + 120, z: mz + ux * side };
    const look = { x: mx, y: ng + 200, z: mz };
    return fly(eye, look);
  }
  const frame: PlaceFrame | null = atriumFrame(layout);
  if (!frame) return null;
  const feetL = { x: 0.05, y: 0.22, z: -2.15 };
  const lookL = { x: 0.35, y: 1.05, z: -7.1 };
  const [fx, fz] = xformXZ(frame, feetL.x, feetL.z);
  const [lx, lz] = xformXZ(frame, lookL.x, lookL.z);
  const feet = { x: fx, y: frame.y + feetL.y, z: fz };
  const look = { x: lx, y: frame.y + lookL.y, z: lz };
  return walk(feet, look, pitchTo(feet.x, feet.y + 1.7, feet.z, look.x, look.y, look.z));
}
