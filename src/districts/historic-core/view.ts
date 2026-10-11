// Screenshot and debug cameras for Stage 6 (`__nla.broadwayView`).
import type { CityLayout } from '../../world/layout';
import {
  AX, AZ, BLOCK_A, BLOCK_B, BRADBURY_FRONT, BRADBURY_HOLE, BRADBURY_I, BRADBURY_J,
  BRADBURY_S, BRADBURY_T, BROADWAY_T, BX, BZ, FACE_YAW, STREET, headingAlong, localToWorld,
} from './spec';

export type BroadwayView = 'street' | 'bridge' | 'bradbury' | 'spinner' | 'atrium';

export interface BroadwayPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  mode: 'walk' | 'fly';
  cockpit?: boolean;
  feet?: { x: number; y: number; z: number };
}

function at(layout: CityLayout, s: number, t: number, eye: number): { x: number; y: number; z: number; g: number } {
  const [x, z] = [AX * s + BX * t, AZ * s + BZ * t];
  const g = layout.heightAt(x, z);
  return { x, y: g + eye, z, g };
}

export function broadwayCamera(layout: CityLayout, kind: BroadwayView): BroadwayPose | null {
  if (kind === 'street') {
    // North-west of the Bradbury shutter, looking south down the east wall.
    // Standing in the street plane of the north face hides the plate behind that wall.
    const shutterS = (BRADBURY_I + 0.5) * BLOCK_A + BRADBURY_HOLE.s1 + 8;
    const shutterT = (BRADBURY_J + 0.5) * BLOCK_B - (BLOCK_B - STREET) / 2 - 0.35;
    const p = at(layout, shutterS + 28, shutterT - 18, 0);
    const look = at(layout, shutterS - 36, shutterT + 1, 6);
    const horiz = Math.hypot(look.x - p.x, look.z - p.z) || 1;
    return {
      x: p.x, y: p.g, z: p.z,
      heading: headingAlong(look.x - p.x, look.z - p.z),
      pitch: Math.atan2(look.y - (p.g + 1.7), horiz),
      mode: 'walk',
      feet: { x: p.x, y: p.g, z: p.z },
    };
  }

  if (kind === 'bridge') {
    // North of the Broadway intersection, off the centreline, so the feet stay in frame.
    const s = -7 * BLOCK_A;
    const p = at(layout, s + 50, BROADWAY_T + 4.2, 0);
    const target = at(layout, s, BROADWAY_T, 20);
    const horiz = Math.hypot(target.x - p.x, target.z - p.z) || 1;
    const pitch = Math.atan2(target.y - (p.g + 1.7), horiz);
    return {
      x: p.x, y: p.g, z: p.z,
      heading: headingAlong(target.x - p.x, target.z - p.z),
      pitch,
      mode: 'walk',
      feet: { x: p.x, y: p.g, z: p.z },
    };
  }

  if (kind === 'bradbury') {
    // Street centre, square to the door. Walk mode stays put; fly mode climbs out of the west block.
    const p = at(layout, BRADBURY_S - 2, -210.8, 0);
    const face = at(layout, BRADBURY_S, -201, 12);
    const horiz = Math.hypot(face.x - p.x, face.z - p.z) || 1;
    return {
      x: p.x, y: p.g, z: p.z,
      heading: headingAlong(face.x - p.x, face.z - p.z),
      pitch: Math.atan2(face.y - (p.g + 1.7), horiz),
      mode: 'walk',
      feet: { x: p.x, y: p.g, z: p.z },
    };
  }

  if (kind === 'atrium') {
    const l = layout.landmarkById('bradbury-building');
    if (!l) return null;
    const [x, z] = localToWorld(l.x, l.z, FACE_YAW, 0, BRADBURY_FRONT - 15);
    const g = layout.heightAt(x, z);
    const [dx, dz] = localToWorld(l.x, l.z, FACE_YAW, 0, BRADBURY_FRONT - 2);
    return {
      x, y: g, z,
      heading: headingAlong(dx - x, dz - z),
      pitch: 0.55,
      mode: 'walk',
      feet: { x, y: g + 0.14, z },
    };
  }

  // Spinner height, north of the Bradbury, nose down the canyon.
  const p = at(layout, BRADBURY_S + 140, BRADBURY_T, 168);
  return {
    x: p.x, y: p.y, z: p.z,
    heading: headingAlong(-AX, -AZ),
    pitch: -0.42,
    mode: 'fly',
    cockpit: true,
  };
}
