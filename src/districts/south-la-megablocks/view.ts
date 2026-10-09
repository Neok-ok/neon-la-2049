// Screenshot and debug cameras for Stage 12 (`__nla.southLaView`).
import type { CityLayout } from '../../world/layout';
import { geoToLocal } from '../../world/geo';
import { poseOn, streetGraph } from '../../vehicles/streetGraph';
import { findHub, searchResidential, worldAt, type Found } from './locate';
import { HUB } from './spec';

export type SouthLaView =
  | 'street'
  | 'courtyard'
  | 'market'
  | 'spine'
  | 'hub'
  | 'traffic'
  | 'trench'
  | 'wallace'
  | 'aerial'
  | 'seam'
  | 'room';

export interface SouthPose {
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
): SouthPose {
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
): SouthPose {
  const dist = Math.hypot(look.x - eye.x, look.z - eye.z) || 1;
  return {
    x: eye.x, y: eye.y, z: eye.z,
    heading: headingTo(eye.x, eye.z, look.x, look.z),
    pitch: Math.atan2(look.y - eye.y, dist),
    mode: 'fly', cockpit,
  };
}

function around(layout: CityLayout): Found[] {
  const list = searchResidential(layout, HUB.x, HUB.z, 1800);
  list.sort((a, b) => {
    const da = (a.block.cx - HUB.x) ** 2 + (a.block.cz - HUB.z) ** 2;
    const db = (b.block.cx - HUB.x) ** 2 + (b.block.cz - HUB.z) ** 2;
    return da - db;
  });
  return list;
}

function openStreet(layout: CityLayout, x: number, z: number): boolean {
  return layout.districtAt(x, z).id === 'south-la-megablocks' && !layout.isReserved(x, z, 1.2);
}

export function southLaCamera(layout: CityLayout, kind: SouthLaView): SouthPose | null {
  if (kind === 'aerial') {
    const [x, z] = geoToLocal(33.97, -118.29);
    const g = layout.heightAt(x, z);
    return fly({ x, y: g + 820, z: z + 380 }, { x, y: g + 40, z }, true);
  }
  if (kind === 'seam') {
    // Just southeast of the shared corner, looking down at it. Lakewood is the near ground.
    const [x, z] = geoToLocal(33.912, -118.212);
    const [lx, lz] = geoToLocal(33.920, -118.220);
    const g = layout.heightAt(x, z);
    return fly({ x, y: g + 720, z }, { x: lx, y: g + 8, z: lz }, true);
  }
  if (kind === 'wallace') {
    const py = layout.landmarkById('wallace-pyramid');
    const tower = layout.landmarkById('wallace-satellite-c');
    if (!py) return null;
    const aimX = tower ? (py.x * 0.72 + tower.x * 0.28) : py.x;
    const aimZ = tower ? (py.z * 0.72 + tower.z * 0.28) : py.z;
    // Eastern streets, inside the step-down, so the roofs do not hide the crown.
    for (const j of [1, 0, -1, -2, -3, -4, -6, -8]) {
      for (const i of [-26, -24, -28, -22]) {
        const x = j * 120 + 16;
        const z = -i * 200 + 7.2;
        if (!openStreet(layout, x, z)) continue;
        const g = layout.heightAt(x, z);
        return walk({ x, y: g, z }, { x: aimX, y: g + 400, z: aimZ }, 0.42);
      }
    }
    return null;
  }
  if (kind === 'trench') {
    // West lip of the 110, looking south down the cut. The block-edge stance
    // was either inside the hole or aimed at the retaining wall.
    const g = streetGraph(layout);
    let best: { index: number; z: number } | null = null;
    for (const e of g.edges) {
      if (e.kind !== 'freeway' || e.route !== 'I-110') continue;
      const a = g.nodes[e.a]!;
      const b = g.nodes[e.b]!;
      const mz = (a.z + b.z) / 2;
      if (mz < 5600 || mz > 8200) continue;
      if (!best || Math.abs(mz - 6400) < Math.abs(best.z - 6400)) best = { index: e.index, z: mz };
    }
    if (!best) return null;
    for (const side of [-54, 54, -68, 68]) {
      const pose = poseOn(g, best.index, 0.42, 1, side);
      if (!openStreet(layout, pose.x, pose.z)) continue;
      const ground = layout.heightAt(pose.x, pose.z);
      return walk(
        { x: pose.x, y: ground, z: pose.z },
        { x: pose.x + pose.fx * 40, y: ground - 6, z: pose.z + pose.fz * 40 },
        -0.46,
      );
    }
    return null;
  }
  if (kind === 'traffic') {
    let best: SouthPose | null = null;
    let bd = Infinity;
    for (let di = -8; di <= 8; di++) {
      for (let dj = -8; dj <= 8; dj++) {
        const i = -22 + di;
        const j = -35 + dj;
        const x = j * 120;
        const z = -i * 200;
        if (!openStreet(layout, x, z)) continue;
        const sx = x + 8.4;
        const sz = z + 4.5;
        if (!openStreet(layout, sx, sz)) continue;
        const d = (x - HUB.x) ** 2 + (z - HUB.z) ** 2;
        if (d >= bd) continue;
        bd = d;
        const g = layout.heightAt(sx, sz);
        best = walk({ x: sx, y: g, z: sz }, { x, y: g + 1.6, z }, 0.05);
      }
    }
    return best;
  }

  const list = around(layout);
  if (kind === 'room' || kind === 'hub') {
    const hub = findHub(layout);
    if (!hub?.plan.shop) return null;
    const door = worldAt(hub.block, hub.plan.shop.s, hub.plan.shop.t, 0);
    if (kind === 'hub') {
      const feet = worldAt(hub.block, -14, 8, 0.04);
      const look = worldAt(hub.block, 26, -2, 5.2);
      return walk(feet, look, 0.12);
    }
    // In the corridor, looking north along the washer row. Local +Z is south.
    const feet = { x: door.x - 0.85, y: door.y + 0.16, z: door.z - 2.15 };
    const look = { x: door.x - 1.5, y: door.y + 1.15, z: door.z - 7.6 };
    return walk(feet, look, 0.02);
  }
  if (kind === 'courtyard') {
    const hit = list.find((f) => f.plan.court && f.plan.entry && !f.plan.face);
    if (!hit?.plan.court || !hit.plan.entry) return null;
    const feet = worldAt(hit.block, hit.plan.court.s - 2, hit.plan.court.t + 10, 0.12);
    const look = worldAt(hit.block, hit.plan.court.s + 16, hit.plan.court.t - 4, 18);
    return walk(feet, look, 0.2);
  }
  if (kind === 'market') {
    const hit = list.find((f) => !f.plan.hub && !f.plan.spine && f.plan.stalls.length >= 3 && !f.plan.face);
    const stall = hit?.plan.stalls[0];
    if (!hit || !stall) return null;
    const outS = stall.face === 0 ? 5.5 : stall.face === 2 ? -5.5 : 0;
    const outT = stall.face === 1 ? 5.5 : stall.face === 3 ? -5.5 : 0;
    const feet = worldAt(hit.block, stall.s + outS, stall.t + outT, 0.04);
    const look = worldAt(hit.block, stall.s, stall.t, 2.2);
    return walk(feet, look, 0.16);
  }
  if (kind === 'spine') {
    const hit = list.find((f) => f.plan.spine && f.plan.stalls.length >= 3 && !f.plan.face);
    const stall = hit?.plan.stalls[1] ?? hit?.plan.stalls[0];
    if (!hit || !stall) return null;
    const outS = stall.face === 0 ? 7 : stall.face === 2 ? -7 : 2;
    const outT = stall.face === 1 ? 7 : stall.face === 3 ? -7 : 2;
    const feet = worldAt(hit.block, stall.s + outS, stall.t + outT, 0.04);
    const look = worldAt(hit.block, stall.s + 18, stall.t, 3.4);
    return walk(feet, look, 0.08);
  }
  const hit = list.find((f) => f.plan.family === 'bar' && !f.plan.hub && !f.plan.edge && !f.plan.spine && !f.plan.face && !f.plan.wall);
  if (!hit) return null;
  const s = -(hit.block.la / 2 + 8);
  const feet = worldAt(hit.block, s, -18, 0.04);
  const look = worldAt(hit.block, s + 8, 48, 9);
  return walk(feet, look, 0.1);
}
