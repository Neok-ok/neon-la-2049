// Screenshot and debug cameras for Stage 21 (`__nla.eastLaView`).
import type { CityLayout } from '../../world/layout';
import { geoToLocal } from '../../world/geo';
import type { FaceDir } from '../../world/fabric/types';
import { eastLaCrossings, type Crossing } from './crossings';
import { counterOrigin, searchSprawl, worldAt, type Found } from './locate';
import { BLOCK_A, BLOCK_B, DECK_TOP, DISTRICT, HUB } from './spec';

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

function lipStand(layout: CityLayout, c: Crossing): { x: number; z: number } | null {
  // Both corridors are 70 m wide, so a point just off the 10 can still sit on the 5 or the 710.
  // The nearest open street centreline is the close-up.
  const j0 = Math.round(c.x / BLOCK_B);
  const i0 = Math.round(-c.z / BLOCK_A);
  let bestX = 0;
  let bestZ = 0;
  let bestD = Infinity;
  const consider = (x: number, z: number) => {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < 36 || d > 160 || d >= bestD) return;
    if (!openStreet(layout, x, z)) return;
    if (layout.heightAt(x, z) > 45) return;
    bestX = x;
    bestZ = z;
    bestD = d;
  };
  for (let di = -3; di <= 3; di++) {
    for (let dj = -3; dj <= 3; dj++) {
      const xLine = (j0 + dj) * BLOCK_B;
      const zLine = -(i0 + di) * BLOCK_A;
      consider(xLine, zLine);
      consider(xLine, c.z);
      consider(c.x, zLine);
      for (const k of [-48, -24, 24, 48]) {
        consider(xLine, c.z + k);
        consider(c.x + k, zLine);
      }
    }
  }
  return bestD < Infinity ? { x: bestX, z: bestZ } : null;
}

function lipWalk(layout: CityLayout, c: Crossing): EastPose | null {
  const g = layout.heightAt(c.x, c.z);
  const look = { x: c.x, y: g + DECK_TOP + 3.2, z: c.z };
  const stand = lipStand(layout, c);
  if (!stand) {
    return fly({ x: c.x - 90, y: g + 36, z: c.z + 90 }, { x: c.x, y: g + DECK_TOP + 2, z: c.z }, true);
  }
  const ground = layout.heightAt(stand.x, stand.z);
  return walk({ x: stand.x, y: ground, z: stand.z }, look, 0.1);
}

export function eastLaCamera(layout: CityLayout, kind: EastLaView): EastPose | null {
  const cross = mainCrossing(layout);
  if (kind === 'aerial' && cross) {
    const g = layout.heightAt(cross.x, cross.z);
    return fly(
      { x: cross.x - 420, y: g + 1000, z: cross.z + 1280 },
      { x: cross.x + 40, y: g + 16, z: cross.z - 160 },
      true,
    );
  }
  if ((kind === 'interchange' || kind === 'deck') && cross) {
    if (kind === 'deck') {
      const g = layout.heightAt(cross.x, cross.z);
      const eye = {
        x: cross.x + cross.tx * 70 + cross.rx * 28,
        y: g + 22,
        z: cross.z + cross.tz * 70 + cross.rz * 28,
      };
      return fly(eye, { x: cross.x, y: g + DECK_TOP + 1, z: cross.z }, true);
    }
    return lipWalk(layout, cross);
  }

  if (kind === 'river') {
    const [x0, z0] = geoToLocal(34.062, -118.218);
    const [lx, lz] = geoToLocal(34.048, -118.25);
    for (let step = 0; step < 14; step++) {
      const x = x0 + step * 10;
      const z = z0 + step * 4;
      if (!openStreet(layout, x, z)) continue;
      const ground = layout.heightAt(x, z);
      const look = { x: lx, y: ground + 80, z: lz };
      return walk({ x, y: ground, z }, look, 0.06);
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
    const out = outward(stall.face, 14);
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
