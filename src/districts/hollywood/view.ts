// Screenshot and debug cameras for Stage 16 (`__nla.hollywoodView`).
import type { CityLayout } from '../../world/layout';
import { edgeIdsNear, poseOn, streetGraph, type GraphEdge } from '../../vehicles/streetGraph';
import { holoAnchor, lobbyDoor, signSite, streetNode, STRIP_LINE } from './spec';

export type HollywoodView = 'aerial' | 'street' | 'holo' | 'sign' | 'interior' | 'hills';

export interface HollywoodPose {
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
): HollywoodPose {
  return {
    x: feet.x, y: feet.y + 1.7, z: feet.z,
    heading: headingTo(feet.x, feet.z, look.x, look.z),
    pitch, mode: 'walk', feet,
  };
}

function fly(
  eye: { x: number; y: number; z: number },
  look: { x: number; y: number; z: number },
): HollywoodPose {
  const dist = Math.hypot(look.x - eye.x, look.z - eye.z) || 1;
  return {
    x: eye.x, y: eye.y, z: eye.z,
    heading: headingTo(eye.x, eye.z, look.x, look.z),
    pitch: Math.atan2(look.y - eye.y, dist),
    mode: 'fly', cockpit: true,
  };
}

export function hollywoodCamera(layout: CityLayout, kind: HollywoodView): HollywoodPose | null {
  const dancer = holoAnchor(-120);
  const dancerG = layout.heightAt(dancer.x, dancer.z);
  const sign = signSite();
  const signG = layout.heightAt(sign.x, sign.z);
  const door = lobbyDoor();
  const doorG = layout.heightAt(door.x, door.z);
  const strip = streetNode(STRIP_LINE, -120);
  const signStreet = streetNode(STRIP_LINE, -129);

  if (kind === 'aerial') {
    const look = { x: dancer.x, y: dancerG + 40, z: strip.z };
    return fly({ x: dancer.x + 180, y: dancerG + 1000, z: strip.z + 720 }, look);
  }
  if (kind === 'street') {
    const g = streetGraph(layout);
    const ids = edgeIdsNear(g, strip.x, strip.z, 160);
    let best: { e: GraphEdge; score: number } | null = null;
    for (const id of ids) {
      const e = g.edges[id];
      if (!e || e.kind === 'freeway' || e.district !== 'hollywood') continue;
      const a = g.nodes[e.a]!;
      const b = g.nodes[e.b]!;
      const d = Math.hypot((a.x + b.x) * 0.5 - strip.x, (a.z + b.z) * 0.5 - strip.z);
      const score = d + (e.axis === 1 ? 0 : 70);
      if (!best || score < best.score) best = { e, score };
    }
    if (best && best.score < 180) {
      const e = best.e;
      const a = g.nodes[e.a]!;
      const b = g.nodes[e.b]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz || 1;
      const targetX = strip.x + 70;
      let t = ((targetX - a.x) * dx + (strip.z - a.z) * dz) / l2;
      t = Math.max(0.08, Math.min(0.82, t));
      const pose = poseOn(g, e.index, t, 1, e.lane);
      const t2 = Math.max(0.02, Math.min(0.98, t + 36 / Math.max(8, e.length)));
      const ahead = poseOn(g, e.index, t2, 1, e.lane);
      const y = layout.heightAt(pose.x, pose.z);
      return walk(
        { x: pose.x, y, z: pose.z },
        { x: ahead.x * 0.72 + dancer.x * 0.28, y: y + 14, z: ahead.z * 0.72 + dancer.z * 0.28 },
        0.16,
      );
    }
    const feet = { x: dancer.x + 78, y: dancerG, z: strip.z + 6.5 };
    return walk(feet, { x: dancer.x, y: dancerG + 24, z: dancer.z }, 0.22);
  }
  if (kind === 'holo') {
    // South side of the boulevard, in the intersection, looking up the figure.
    const feet = { x: dancer.x + 4, y: dancerG, z: strip.z + 4 };
    return walk(feet, { x: dancer.x, y: dancerG + 36, z: dancer.z }, 1.05);
  }
  if (kind === 'sign') {
    const g = layout.heightAt(signStreet.x, signStreet.z);
    const feet = { x: signStreet.x + 2, y: g, z: signStreet.z + 5 };
    return walk(feet, { x: sign.x, y: signG + 32, z: sign.z }, 0.12);
  }
  if (kind === 'hills') {
    return fly(
      { x: sign.x + 40, y: signG + 90, z: sign.z + 220 },
      { x: sign.x, y: signG + 30, z: sign.z },
    );
  }
  if (kind === 'interior') {
    const feet = { x: door.x, y: doorG, z: door.z - 4.2 };
    return walk(feet, { x: door.x, y: doorG + 1.4, z: door.z - 8 }, -0.04);
  }
  return null;
}
