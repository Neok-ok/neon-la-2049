// Screenshot and debug cameras for Stage 13 (`__nla.westsideView`).
import type { CityLayout } from '../../world/layout';
import { geoToLocal } from '../../world/geo';
import type { FaceDir } from '../../world/fabric/types';
import { poseOn, streetGraph } from '../../vehicles/streetGraph';
import { findHub, searchSprawl, worldAt, type Found } from './locate';
import { CENTURY, HUB } from './spec';

export type WestsideView =
  | 'aerial'
  | 'street'
  | 'strip'
  | 'roof'
  | 'freeway'
  | 'interior'
  | 'hub'
  | 'towers';

export interface WestPose {
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
): WestPose {
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
): WestPose {
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
  return layout.districtAt(x, z).id === 'westside' && !layout.isReserved(x, z, 1.2) && !layout.isOcean(x, z);
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

export function westsideCamera(layout: CityLayout, kind: WestsideView): WestPose | null {
  if (kind === 'aerial') {
    const [x, z] = geoToLocal(34.05, -118.37);
    const g = layout.heightAt(x, z);
    return fly({ x, y: g + 1100, z: z + 480 }, { x, y: g + 24, z }, true);
  }
  if (kind === 'freeway') {
    const g = streetGraph(layout);
    let best: { index: number; x: number } | null = null;
    for (const e of g.edges) {
      if (e.kind !== 'freeway' || e.route !== 'I-10') continue;
      const a = g.nodes[e.a]!;
      const b = g.nodes[e.b]!;
      const mx = (a.x + b.x) / 2;
      if (mx < HUB.x - 2400 || mx > HUB.x + 2400) continue;
      if (!best || Math.abs(mx - HUB.x) < Math.abs(best.x - HUB.x)) best = { index: e.index, x: mx };
    }
    if (!best) return null;
    for (const side of [56, -56, 48, -48, 64, -64]) {
      const pose = poseOn(g, best.index, 0.5, 1, side);
      if (!openStreet(layout, pose.x, pose.z)) continue;
      const ground = layout.heightAt(pose.x, pose.z);
      const wall = searchSprawl(layout, pose.x, pose.z, 320).find((f) => f.plan.edge);
      const look = wall
        ? worldAt(wall.block, 0, 0, 8)
        : { x: pose.x + pose.fx * 36, y: ground + 4, z: pose.z + pose.fz * 36 };
      return walk({ x: pose.x, y: ground, z: pose.z }, look, wall ? 0.08 : 0.06);
    }
    return null;
  }

  if (kind === 'interior' || kind === 'hub') {
    const hub = findHub(layout);
    if (!hub?.plan.diner || !hub.plan.yard) return null;
    const door = worldAt(hub.block, hub.plan.diner.s, hub.plan.diner.t, 0);
    if (kind === 'hub') {
      const feet = worldAt(hub.block, hub.plan.yard.s - 16, 4, 0.04);
      if (!openStreet(layout, feet.x, feet.z)) return null;
      const look = worldAt(hub.block, hub.plan.diner.s, 0, 4.2);
      return walk(feet, look, 0.1);
    }
    const yaw = Math.atan2(-hub.block.ax, -hub.block.az);
    const feet = localDoor(door, yaw, -0.15, -4.2, 0.05);
    const look = localDoor(door, yaw, -1.15, -5.6, 1.05);
    return walk(feet, look, 0.02);
  }

  if (kind === 'towers') {
    const list = near(layout, CENTURY.x, CENTURY.z, 900);
    const hit = list.find((f) => f.plan.tower && f.plan.roof && !f.plan.hub)
      ?? list.find((f) => f.plan.tower && f.plan.roof);
    const roof = hit?.plan.roof;
    if (!hit || !roof) return null;
    const tries: Array<[number, number]> = [
      [-(hit.block.la / 2 + 7), 6],
      [hit.block.la / 2 + 7, -6],
      [4, -(hit.block.lb / 2 + 7)],
      [-4, hit.block.lb / 2 + 7],
    ];
    for (const [s, t] of tries) {
      const feet = worldAt(hit.block, s, t, 0.04);
      if (!openStreet(layout, feet.x, feet.z)) continue;
      const look = worldAt(hit.block, roof.s, roof.t, roof.h * 0.62);
      return walk(feet, look, 0.38);
    }
    return null;
  }

  const list = near(layout, HUB.x, HUB.z, 1700);
  if (kind === 'strip') {
    const hit = list.find((f) => !f.plan.hub && !f.plan.edge && f.plan.stalls.length >= 3);
    const stall = hit?.plan.stalls[1] ?? hit?.plan.stalls[0];
    if (!hit || !stall) return null;
    const out = outward(stall.face, 6.5);
    const feet = worldAt(hit.block, stall.s + out.s, stall.t + out.t, 0.04);
    if (!openStreet(layout, feet.x, feet.z)) return null;
    const look = worldAt(hit.block, stall.s, stall.t, 2.4);
    return walk(feet, look, 0.14);
  }
  if (kind === 'roof') {
    const hit = list.find((f) => f.plan.roof && !f.plan.hub && !f.plan.edge)
      ?? list.find((f) => f.plan.roof && !f.plan.hub);
    const roof = hit?.plan.roof;
    if (!hit || !roof) return null;
    const eye = worldAt(hit.block, roof.s - 16, roof.t + 10, roof.h + 9);
    const look = worldAt(hit.block, roof.s, roof.t, roof.h + 1.4);
    return fly(eye, look, true);
  }
  const hit = list.find((f) => !f.plan.hub && !f.plan.strip && !f.plan.edge && !f.plan.tower && f.plan.boxes.length);
  if (!hit) return null;
  const s = -(hit.block.la / 2 + 7);
  const feet = worldAt(hit.block, s, -8, 0.04);
  if (!openStreet(layout, feet.x, feet.z)) return null;
  const look = worldAt(hit.block, s + 14, 18, 11);
  return walk(feet, look, 0.12);
}
