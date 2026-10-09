// Screenshot and debug cameras for Stage 6 (`__nla.broadwayView`).
import type { CityLayout } from '../../world/layout';
import {
  AX, AZ, BRADBURY_S, BRADBURY_T, BRIDGE_S, BRIDGE_T, BX, BZ,
  FACE_YAW, headingAlong, localToWorld,
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
    // West sidewalk, just north of the Bradbury, looking south down the canyon.
    // Just off the centreline, so both façades frame the street instead of one wall filling the frame.
    const p = at(layout, BRADBURY_S + 42, -210.6, 0);
    return {
      x: p.x, y: p.g, z: p.z,
      heading: headingAlong(-AX, -AZ),
      pitch: 0.16,
      mode: 'walk',
      feet: { x: p.x, y: p.g, z: p.z },
    };
  }

  if (kind === 'bridge') {
    // Fifty metres north of the deck, a few metres off the centreline, looking up at the figure.
    const p = at(layout, BRIDGE_S + 26, BRIDGE_T + 3.2, 0);
    const target = at(layout, BRIDGE_S, BRIDGE_T, 20);
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
    // West sidewalk, looking east at the masonry face. Slightly north of the door.
    const p = at(layout, BRADBURY_S + 24, -211.2, 0);
    const face = at(layout, BRADBURY_S - 2, -201, 7);
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
    const [x, z] = localToWorld(l.x, l.z, FACE_YAW, 0, -15);
    const g = layout.heightAt(x, z);
    const [dx, dz] = localToWorld(l.x, l.z, FACE_YAW, 0, -2);
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
