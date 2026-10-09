// Screenshot and debug cameras for Stage 5 (`__nla.civicView`).
import { Vector3 } from 'three/webgpu';
import type { CityLayout } from '../../world/layout';
import { sampleLane, type SkyLane } from '../../vehicles/skyLanes';
import { HQ, HALL_STAIR, HOVER_Y, STAIR, localToWorld, treadTop, yawOf } from './spec';

export type CivicView = 'approach' | 'steps' | 'hall' | 'lobby' | 'plaza';

export interface CivicPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  mode: 'walk' | 'fly';
  cockpit?: boolean;
  feet?: { x: number; y: number; z: number };
}

const headingTo = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(tx - fx, -(tz - fz));

export function civicCamera(layout: CityLayout, kind: CivicView, lanes: readonly SkyLane[]): CivicPose | null {
  const lapd = layout.landmarkById('lapd-hq');
  const hall = layout.landmarkById('city-hall');
  if (!lapd) return null;
  const yaw = yawOf(lapd.bearingDeg);
  const g = layout.heightAt(lapd.x, lapd.z);

  if (kind === 'approach') {
    const lane = lanes.find((l) => l.id === 'lapd-pad-a') ?? lanes.find((l) => l.id.startsWith('lapd-pad-') && !l.loop);
    const p = new Vector3();
    const tan = new Vector3();
    if (lane) {
      // On the way in, just outside the crown, so the deck fills the frame.
      let bestS = lane.length * 0.25;
      let best = Infinity;
      const probe = new Vector3();
      const c = Math.cos(yaw), s = Math.sin(yaw);
      for (let i = 1; i < 48; i++) {
        const u = (lane.length * i) / 48;
        sampleLane(lane, u, probe, tan);
        const dx = probe.x - lapd.x, dz = probe.z - lapd.z;
        const lz = dx * s + dz * c;
        const dist = Math.hypot(dx, dz);
        // Plaza side only (local −Z). The departure is a mirror of this leg.
        const score = Math.abs(dist - 160) + Math.abs(probe.y - 212) * 0.35 + (lz < -70 ? 0 : 400);
        if (score < best) { best = score; bestS = u; }
      }
      sampleLane(lane, bestS, p, tan);
    } else {
      const [x, z] = localToWorld(lapd.x, lapd.z, yaw, -55, -150);
      p.set(x, 214, z);
      tan.set(0, 0, 1);
    }
    // A point on the plaza-side deck, so the pads and the crown lip fill the frame.
    const [tx, tz] = localToWorld(lapd.x, lapd.z, yaw, -28, -55);
    const sx = -tan.z, sz = tan.x;
    const x = p.x + sx * 18;
    const z = p.z + sz * 18;
    const y = p.y + 16;
    const dist = Math.hypot(tx - x, tz - z) || 1;
    const pitch = Math.atan2(HOVER_Y - y, dist);
    return { x, y, z, heading: headingTo(x, z, tx, tz), pitch, mode: 'fly', cockpit: true };
  }

  if (kind === 'steps') {
    // Low on the stair, off the centre line, looking up the run toward the door.
    const lz = -80;
    const [x, z] = localToWorld(lapd.x, lapd.z, yaw, 4, lz);
    const [dx, dz] = localToWorld(lapd.x, lapd.z, yaw, 0, -52);
    const y = g + treadTop(STAIR, lz);
    return {
      x, y, z, heading: headingTo(x, z, dx, dz), pitch: 0.34, mode: 'walk',
      feet: { x, y, z },
    };
  }

  if (kind === 'lobby') {
    const [x, z] = localToWorld(lapd.x, lapd.z, yaw, 0, -52);
    const [dx, dz] = localToWorld(lapd.x, lapd.z, yaw, 0, -43);
    const y = g + HQ.lobbyFloor;
    return {
      x, y, z, heading: headingTo(x, z, dx, dz), pitch: -0.12, mode: 'walk',
      feet: { x, y, z },
    };
  }

  if (kind === 'plaza') {
    const [x, z] = localToWorld(lapd.x, lapd.z, yaw, 6, -130);
    const y = g + 0.2;
    return {
      x, y, z, heading: headingTo(x, z, lapd.x, lapd.z), pitch: 0.42, mode: 'walk',
      feet: { x, y, z },
    };
  }

  if (!hall) return null;
  const hy = yawOf(hall.bearingDeg);
  const gh = layout.heightAt(hall.x, hall.z);
  // At the foot of the stair, looking up so the pyramid sits in the frame.
  const lz = HALL_STAIR.z0 + 1.2;
  const [x, z] = localToWorld(hall.x, hall.z, hy, 0, lz);
  const [tx, tz] = localToWorld(hall.x, hall.z, hy, 0, 0);
  const y = gh + treadTop(HALL_STAIR, lz);
  return {
    x, y, z, heading: headingTo(x, z, tx, tz), pitch: 0.82, mode: 'walk',
    feet: { x, y, z },
  };
}
