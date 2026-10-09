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
    // Low in the walled causeway, looking south at the portal.
    const eye = world(0, 4.6, COURT.roadNorth + 42);
    const look = world(0, 48, -1880);
    return fly(eye, look);
  }
  if (kind === 'plaza') {
    // On the plinth, inside the district polygon, facing the sealed portal.
    const feet = world(8, COURT.deckY + 0.04, -1688);
    const look = world(0, COURT.deckY + 18, COURT.doorZ);
    return walk(feet, look, 0.22);
  }
  if (kind === 'face') {
    // East of the portal pylons, close enough for the streamed skin.
    const feet = world(340, 0.04, -1724);
    const look = world(220, 48, -1596);
    return walk(feet, look, 0.42);
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
    const eye = { x: sx + (kind === 'convoy' ? 22 : 16), y: g + (kind === 'convoy' ? 28 : 36), z: pyr.z + 760 };
    const look = { x: sx, y: g + (kind === 'convoy' ? 18 : 22), z: pyr.z + (kind === 'convoy' ? 1180 : 1280) };
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
    const back = n.reserveRadius + 200;
    const ng = layout.heightAt(n.x, n.z);
    const eye = { x: n.x - ux * back, y: ng + 80, z: n.z - uz * back };
    const look = { x: (n.x + s.x) / 2, y: ng + 160, z: (n.z + s.z) / 2 };
    return fly(eye, look);
  }
  const frame: PlaceFrame | null = atriumFrame(layout);
  if (!frame) return null;
  const feetL = { x: 0.2, y: 0.24, z: -3.2 };
  const lookL = { x: -0.9, y: 1.55, z: -6.8 };
  const [fx, fz] = xformXZ(frame, feetL.x, feetL.z);
  const [lx, lz] = xformXZ(frame, lookL.x, lookL.z);
  const feet = { x: fx, y: frame.y + feetL.y, z: fz };
  const look = { x: lx, y: frame.y + lookL.y, z: lz };
  return walk(feet, look, pitchTo(feet.x, feet.y + 1.7, feet.z, look.x, look.y, look.z));
}
