// Debug / screenshot cameras for Stage 3 (`__nla.megaView`). Main thread only.
import { bearingToYaw } from '../../world/geo';
import type { CityLayout } from '../../world/layout';
import type { SkyLane } from '../../vehicles/skyLanes';
import { sampleLane } from '../../vehicles/skyLanes';
import { Vector3 } from 'three/webgpu';
import { heroPlan } from './specs';

export type MegaView = 'approach' | 'skyline' | 'street' | 'lanes' | 'crown';

export interface MegaPose {
  x: number;
  y: number;
  z: number;
  /** Compass radians, 0 = north. */
  heading: number;
  pitch: number;
  mode: 'walk' | 'fly';
  cockpit?: boolean;
}

const headingTo = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(tx - fx, -(tz - fz));

export function megaCamera(layout: CityLayout, kind: MegaView, lanes: readonly SkyLane[]): MegaPose | null {
  const mt1 = layout.landmarkById('megatower-1');
  const wal = layout.landmarkById('wallace-pyramid');
  if (!mt1 || !wal) return null;

  if (kind === 'approach') {
    // chase view, 5.2 km out on the downtown side, flying at the pyramid
    const dx = mt1.x - wal.x, dz = mt1.z - wal.z, d = Math.hypot(dx, dz);
    const x = wal.x + (dx / d) * 5200, z = wal.z + (dz / d) * 5200;
    return { x, y: 1050, z, heading: headingTo(x, z, wal.x, wal.z), pitch: 0.09, mode: 'fly', cockpit: false };
  }
  if (kind === 'skyline') {
    // from the hills north-west of downtown: the megatowers in front, the pyramid behind them
    const b = (312 * Math.PI) / 180;
    const x = mt1.x + Math.sin(b) * 5200, z = mt1.z - Math.cos(b) * 5200;
    return { x, y: 360, z, heading: headingTo(x, z, (mt1.x * 3 + wal.x) / 4, (mt1.z * 3 + wal.z) / 4), pitch: 0.1, mode: 'fly', cockpit: true };
  }
  if (kind === 'street') {
    // standing in front of MT-1's entrance canopy, looking up the slab
    const { spec } = heroPlan(mt1.id, mt1.height, mt1.baseWidth, mt1.baseDepth ?? mt1.baseWidth);
    const yaw = bearingToYaw(mt1.bearingDeg) + ((spec.turn ?? 0) * Math.PI) / 2;
    const nx = Math.sin(yaw), nz = Math.cos(yaw);
    const out = spec.podium.d / 2 + 34;
    const x = mt1.x + nx * out, z = mt1.z + nz * out;
    return { x, y: layout.heightAt(x, z) + 1.7, z, heading: headingTo(x, z, mt1.x, mt1.z), pitch: 0.95, mode: 'walk' };
  }
  if (kind === 'crown') {
    // level with the hammer crown, across the canyon
    const b = (200 * Math.PI) / 180;
    const x = mt1.x + Math.sin(b) * 620, z = mt1.z - Math.cos(b) * 620;
    return { x, y: mt1.height - 60, z, heading: headingTo(x, z, mt1.x, mt1.z), pitch: 0.02, mode: 'fly', cockpit: true };
  }
  // lanes: above a sky avenue, looking along it into the towers
  const lane = lanes.find((l) => l.id.startsWith('avenue-')) ?? lanes[0];
  if (!lane) return null;
  const p = new Vector3(), t = new Vector3(), q = new Vector3();
  sampleLane(lane, lane.length * 0.18, p, t);
  sampleLane(lane, lane.length * 0.55, q, t);
  const sx = -t.z, sz = t.x;
  const x = p.x + sx * 130, z = p.z + sz * 130;
  return { x, y: p.y + 70, z, heading: headingTo(x, z, q.x, q.z), pitch: -0.06, mode: 'fly', cockpit: true };
}
