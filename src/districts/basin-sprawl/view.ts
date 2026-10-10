// Screenshot and debug cameras for Stage 14 (`__nla.basinView`).
import type { CityLayout } from '../../world/layout';
import { geoToLocal } from '../../world/geo';
import type { FaceDir } from '../../world/fabric/types';
import { searchSprawl, worldAt, type Found } from './locate';
import { STRIP_PIN } from './spec';

export type BasinView =
  | 'aerial'
  | 'street'
  | 'strip'
  | 'roof'
  | 'seam-west'
  | 'seam-south'
  | 'seam-lake'
  | 'seam-arts'
  | 'seam-dtla';

export interface BasinPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  mode: 'walk' | 'fly';
  cockpit?: boolean;
  feet?: { x: number; y: number; z: number };
}

/** Seam framing matches the before shots: eye offset, look offset, 1 km up. */
const SEAM: Record<string, { lat: number; lon: number; eyeSouth: number; eyeEast: number; lookSouth: number; lookEast: number }> = {
  'seam-west': { lat: 33.9935, lon: -118.42, eyeSouth: 900, eyeEast: 0, lookSouth: -400, lookEast: 0 },
  'seam-south': { lat: 33.98, lon: -118.34, eyeSouth: 0, eyeEast: -900, lookSouth: 0, lookEast: 400 },
  'seam-lake': { lat: 33.86, lon: -118.0695, eyeSouth: 0, eyeEast: 700, lookSouth: 0, lookEast: -400 },
  'seam-arts': { lat: 34.0306, lon: -118.234, eyeSouth: 800, eyeEast: 0, lookSouth: -300, lookEast: 0 },
  'seam-dtla': { lat: 34.0643, lon: -118.25, eyeSouth: -800, eyeEast: 0, lookSouth: 400, lookEast: 0 },
};

function headingTo(fx: number, fz: number, tx: number, tz: number): number {
  return Math.atan2(tx - fx, -(tz - fz));
}

function walk(
  feet: { x: number; y: number; z: number },
  look: { x: number; y: number; z: number },
  pitch: number,
): BasinPose {
  return {
    x: feet.x, y: feet.y + 1.7, z: feet.z,
    heading: headingTo(feet.x, feet.z, look.x, look.z),
    pitch, mode: 'walk', feet,
  };
}

function fly(
  eye: { x: number; y: number; z: number },
  look: { x: number; y: number; z: number },
  cockpit: boolean,
): BasinPose {
  const dist = Math.hypot(look.x - eye.x, look.z - eye.z) || 1;
  return {
    x: eye.x, y: eye.y, z: eye.z,
    heading: headingTo(eye.x, eye.z, look.x, look.z),
    pitch: Math.atan2(look.y - eye.y, dist),
    mode: 'fly', cockpit,
  };
}

function near(layout: CityLayout, x: number, z: number, span: number): Found[] {
  const list = searchSprawl(layout, x, z, span);
  list.sort((a, b) => {
    const da = (a.block.cx - x) ** 2 + (a.block.cz - z) ** 2;
    const db = (b.block.cx - x) ** 2 + (b.block.cz - z) ** 2;
    return da - db;
  });
  return list;
}

function openStreet(layout: CityLayout, x: number, z: number): boolean {
  return layout.districtAt(x, z).id === 'basin-sprawl' && !layout.isReserved(x, z, 1.2) && !layout.isOcean(x, z);
}

function outward(face: FaceDir, dist: number): { s: number; t: number } {
  if (face === 'a+') return { s: dist, t: 0 };
  if (face === 'a-') return { s: -dist, t: 0 };
  if (face === 'b+') return { s: 0, t: dist };
  return { s: 0, t: -dist };
}

function seamPose(layout: CityLayout, kind: string): BasinPose | null {
  const s = SEAM[kind];
  if (!s) return null;
  const [x, z] = geoToLocal(s.lat, s.lon);
  const g = layout.heightAt(x, z);
  return fly(
    { x: x + s.eyeEast, y: g + 1000, z: z + s.eyeSouth },
    { x: x + s.lookEast, y: g + 24, z: z + s.lookSouth },
    true,
  );
}

export function basinCamera(layout: CityLayout, kind: BasinView): BasinPose | null {
  const seam = seamPose(layout, kind);
  if (seam) return seam;

  const [px, pz] = geoToLocal(STRIP_PIN.lat, STRIP_PIN.lon);
  if (kind === 'aerial') {
    const g = layout.heightAt(px, pz);
    return fly({ x: px - 180, y: g + 1000, z: pz + 1200 }, { x: px, y: g + 16, z: pz - 80 }, true);
  }

  const list = near(layout, px, pz, 900);
  if (kind === 'strip') {
    const hit = list.find((f) => f.plan.stalls.length >= 3);
    const stall = hit?.plan.stalls[1] ?? hit?.plan.stalls[0];
    if (!hit || !stall) return null;
    const out = outward(stall.face, 14);
    const slide = stall.face[0] === 'a' ? 6 : 0;
    const slideS = stall.face[0] === 'b' ? 6 : 0;
    const feet = worldAt(hit.block, stall.s + out.s + slideS, stall.t + out.t + slide, 0.04);
    if (!openStreet(layout, feet.x, feet.z)) return null;
    const look = worldAt(hit.block, stall.s, stall.t, 3.2);
    return walk(feet, look, 0.14);
  }
  if (kind === 'roof') {
    const hit = list.find((f) => f.plan.roof && !f.plan.strip) ?? list.find((f) => f.plan.roof);
    const roof = hit?.plan.roof;
    if (!hit || !roof) return null;
    const eye = worldAt(hit.block, roof.s - 9, roof.t + 6, roof.h + 2.4);
    const look = worldAt(hit.block, roof.s + 2, roof.t - 1, roof.h + 2.8);
    return fly(eye, look, true);
  }
  const hit = list.find((f) => !f.plan.strip && !f.plan.edge && f.plan.boxes.length);
  if (!hit) return null;
  const s = -(hit.block.la / 2 + 6);
  const feet = worldAt(hit.block, s, -6, 0.04);
  if (!openStreet(layout, feet.x, feet.z)) return null;
  const look = worldAt(hit.block, s + 12, 14, 8);
  return walk(feet, look, 0.1);
}
