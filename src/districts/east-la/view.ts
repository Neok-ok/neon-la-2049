// Screenshot and debug cameras for Stage 21 (`__nla.eastLaView`).
import type { CityLayout } from '../../world/layout';
import type { FaceDir } from '../../world/fabric/types';
import { eastLaCrossings, type Crossing } from './crossings';
import { counterOrigin, searchSprawl, worldAt, type Found } from './locate';
import { DECK_TOP, DISTRICT, HUB } from './spec';

export type EastLaView =
  | 'aerial'
  | 'interchange'
  | 'market'
  | 'river'
  | 'interior'
  | 'street'
  | 'deck';

export interface EastPose {
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

function walk(
  feet: { x: number; y: number; z: number },
  look: { x: number; y: number; z: number },
  pitch: number,
): EastPose {
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
): EastPose {
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
  return layout.districtAt(x, z).id === DISTRICT && !layout.isReserved(x, z, 1.2) && !layout.isOcean(x, z);
}

function outward(face: FaceDir, dist: number): { s: number; t: number } {
  if (face === 'a+') return { s: dist, t: 0 };
  if (face === 'a-') return { s: -dist, t: 0 };
  if (face === 'b+') return { s: 0, t: dist };
  return { s: 0, t: -dist };
}

function localDoor(
  door: { x: number; y: number; z: number },
  yaw: number,
  lx: number,
  lz: number,
  y: number,
): { x: number; y: number; z: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: door.x + lx * c + lz * s, y: door.y + y, z: door.z - lx * s + lz * c };
}

function mainCrossing(layout: CityLayout): Crossing | null {
  const list = eastLaCrossings(layout);
  return list.find((c) => c.id === 'el-10-710') ?? list[0] ?? null;
}

export function eastLaCamera(layout: CityLayout, kind: EastLaView): EastPose | null {
  const cross = mainCrossing(layout);
  if (kind === 'aerial' && cross) {
    const g = layout.heightAt(cross.x, cross.z);
    // About a kilometre up, far enough south that the junction sits in the far-LOD band.
    return fly(
      { x: cross.x - 260, y: g + 1050, z: cross.z + 1680 },
      { x: cross.x + 20, y: g + 24, z: cross.z - 80 },
      true,
    );
  }
  if ((kind === 'interchange' || kind === 'deck') && cross) {
    const g = layout.heightAt(cross.x, cross.z);
    const along = kind === 'deck' ? 70 : 46;
    const side = kind === 'deck' ? 28 : 22;
    const eye = {
      x: cross.x + cross.tx * along + cross.rx * side,
      y: g + (kind === 'deck' ? 22 : 16),
      z: cross.z + cross.tz * along + cross.rz * side,
    };
    return fly(eye, { x: cross.x, y: g + DECK_TOP + 1.4, z: cross.z }, true);
  }

  if (kind === 'river') {
    // Street i = 0 sits on z = 0, the same latitude as megatower 1. A stance further
    // east lets that crown clear the west-bank roofs; closer in, those roofs fill the slot.
    const z = 0;
    const tower = layout.landmarkById('megatower-1');
    const look = { x: tower?.x ?? -1134, y: 0, z: tower?.z ?? 22 };
    for (let x = 2140; x <= 2600; x += 8) {
      if (!openStreet(layout, x, z) || !openStreet(layout, x - 24, z)) continue;
      const ground = layout.heightAt(x, z);
      look.y = ground + 520;
      return walk({ x, y: ground, z }, look, 0.16);
    }
    return null;
  }

  if (kind === 'interior') {
    const origin = counterOrigin(layout);
    if (!origin) return null;
    const feet = localDoor(origin, origin.yaw, -0.15, -4.2, 0.05);
    const look = localDoor(origin, origin.yaw, -1.15, -5.6, 1.05);
    return walk(feet, look, 0.02);
  }

  const list = near(layout, HUB.x, HUB.z, 1400);
  if (kind === 'market') {
    const hit = list.find((f) => !f.plan.hub && !f.plan.edge && f.plan.stalls.length >= 3)
      ?? list.find((f) => f.plan.stalls.length >= 3);
    const stall = hit?.plan.stalls[1] ?? hit?.plan.stalls[0];
    if (!hit || !stall) return null;
    const out = outward(stall.face, 7);
    const slide = stall.face[0] === 'a' ? 6 : 0;
    const slideS = stall.face[0] === 'b' ? 6 : 0;
    const feet = worldAt(hit.block, stall.s + out.s + slideS, stall.t + out.t + slide, 0.04);
    if (!openStreet(layout, feet.x, feet.z)) return null;
    const look = worldAt(hit.block, stall.s, stall.t, 3.4);
    return walk(feet, look, 0.16);
  }
  const hit = list.find((f) => !f.plan.hub && !f.plan.strip && !f.plan.edge && !f.plan.tower && f.plan.boxes.length);
  if (!hit) return null;
  const s = -(hit.block.la / 2 + 6);
  const feet = worldAt(hit.block, s, -6, 0.04);
  if (!openStreet(layout, feet.x, feet.z)) return null;
  const look = worldAt(hit.block, s + 12, 14, 9);
  return walk(feet, look, 0.1);
}
