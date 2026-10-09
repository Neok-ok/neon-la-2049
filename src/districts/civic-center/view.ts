// Screenshot and debug cameras for Stage 5 (`__nla.civicView`).
import { Vector3 } from 'three/webgpu';
import type { CityLayout } from '../../world/layout';
import { sampleLane, type SkyLane } from '../../vehicles/skyLanes';
import { HQ, HALL_STAIR, localToWorld, yawOf } from './spec';

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
    const lane = lanes.find((l) => l.id === 'lapd-pad-a') ?? lanes.find((l) => l.id.startsWith('lapd-pad-'));
    const p = new Vector3();
    const tan = new Vector3();
    if (lane) sampleLane(lane, lane.length * 0.34, p, tan);
    else {
      const [x, z] = localToWorld(lapd.x, lapd.z, yaw, -70, -140);
      p.set(x, 210, z);
      tan.set(0, 0, 1);
    }
    const [tx, tz] = localToWorld(lapd.x, lapd.z, yaw, -10, -20);
    // Sit just off the lane so the camera is not inside a traffic spinner.
    const sx = -tan.z, sz = tan.x;
    const x = p.x + sx * 16;
    const z = p.z + sz * 16;
    const y = p.y + 2;
    return { x, y, z, heading: headingTo(x, z, tx, tz), pitch: -0.06, mode: 'fly', cockpit: true };
  }

  if (kind === 'steps') {
    // Low on the stair, off the centre line, looking up the run toward the door.
    const [x, z] = localToWorld(lapd.x, lapd.z, yaw, 7.5, -74);
    const [dx, dz] = localToWorld(lapd.x, lapd.z, yaw, 0, -50);
    const y = g + 0.7;
    return {
      x, y, z, heading: headingTo(x, z, dx, dz), pitch: 0.42, mode: 'walk',
      feet: { x, y, z },
    };
  }

  if (kind === 'lobby') {
    const [x, z] = localToWorld(lapd.x, lapd.z, yaw, 0, -52);
    const [dx, dz] = localToWorld(lapd.x, lapd.z, yaw, 0, -43);
    const y = g + HQ.lobbyFloor;
    return {
      x, y, z, heading: headingTo(x, z, dx, dz), pitch: 0.06, mode: 'walk',
      feet: { x, y, z },
    };
  }

  if (kind === 'plaza') {
    const [x, z] = localToWorld(lapd.x, lapd.z, yaw, 6, -130);
    const y = g + 0.2;
    return {
      x, y, z, heading: headingTo(x, z, lapd.x, lapd.z), pitch: 0.22, mode: 'walk',
      feet: { x, y, z },
    };
  }

  if (!hall) return null;
  const hy = yawOf(hall.bearingDeg);
  const gh = layout.heightAt(hall.x, hall.z);
  // A few treads up, so the pyramid sits over the stair.
  const [x, z] = localToWorld(hall.x, hall.z, hy, 4.5, (HALL_STAIR.z0 + HALL_STAIR.z1) / 2);
  const [tx, tz] = localToWorld(hall.x, hall.z, hy, 0, 10);
  const y = gh + 1.4;
  return {
    x, y, z, heading: headingTo(x, z, tx, tz), pitch: 0.5, mode: 'walk',
    feet: { x, y, z },
  };
}
