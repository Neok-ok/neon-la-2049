// Debug / screenshot cameras for Stage 4 (`__nla.dtlaView`). Main thread only.
import { Vector3 } from 'three/webgpu';
import { bearingToYaw } from '../../world/geo';
import type { CityLayout } from '../../world/layout';
import { generateFabric } from '../../world/fabric/generator';
import { sampleLane, type SkyLane } from '../../vehicles/skyLanes';
import { HERO_SPECS } from '../financial-megatowers/specs';
import { blockCenter, gridAxes, lineWalkY } from '../_shared/megablock/grid';

export type DtlaView = 'street' | 'walkway' | 'roof' | 'lanes' | 'plaza';

export interface DtlaPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  mode: 'walk' | 'fly';
  cockpit?: boolean;
  /** Walk feet. `enter` snaps to the terrain, so the caller writes this onto the controller after setPose. */
  feet?: { x: number; y: number; z: number };
}

const headingTo = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(tx - fx, -(tz - fz));

const STREET = 34;
const LA = 205 - STREET;
const LB = 125 - STREET;

function canyonStreet(layout: CityLayout): { x: number; z: number; ground: number; ax: number; az: number; bx: number; bz: number } {
  const { ax, az, bx, bz } = gridAxes();
  const c = blockCenter(0, -10);
  const off = -(LB / 2 + STREET / 2);
  // Near curb: 12 m off the centre line, toward the block, clear of the ±7.2 m car lanes.
  const x = c.x + bx * (off + 12);
  const z = c.z + bz * (off + 12);
  return { x, z, ground: layout.heightAt(x, z), ax, az, bx, bz };
}

export function dtlaCamera(layout: CityLayout, kind: DtlaView, lanes: readonly SkyLane[]): DtlaPose | null {
  if (kind === 'street') {
    const s = canyonStreet(layout);
    const heading = (38 * Math.PI) / 180;
    return {
      x: s.x, y: s.ground, z: s.z, heading, pitch: 0.18, mode: 'walk',
      feet: { x: s.x, y: s.ground, z: s.z },
    };
  }

  if (kind === 'walkway') {
    // The +A crossing of block (0, −10). Deck top is the shared walk height plus the slab.
    const { ax, az } = gridAxes();
    const c = blockCenter(0, -10);
    const s = LA / 2 + STREET / 2;
    const x = c.x + ax * s;
    const z = c.z + az * s;
    const deck = layout.heightAt(x, z) + lineWalkY(1, -10, 1, false) + 1.35;
    return {
      x, y: deck, z, heading: (78 * Math.PI) / 180, pitch: 0.14, mode: 'walk',
      feet: { x, y: deck, z },
    };
  }

  if (kind === 'roof') {
    const c = blockCenter(0, -10);
    const fab = generateFabric(layout, Math.floor(c.x / 500) * 500, Math.floor(c.z / 500) * 500, 500);
    let top = layout.heightAt(c.x, c.z) + 120;
    let bx = c.x, bz = c.z;
    for (const box of fab.boxes) {
      if (Math.hypot(box.x - c.x, box.z - c.z) > 90) continue;
      const t = box.y0 + box.h;
      if (t > top) { top = t; bx = box.x; bz = box.z; }
    }
    const mt1 = layout.landmarkById('megatower-1');
    const tx = mt1?.x ?? c.x + 400, tz = mt1?.z ?? c.z + 200;
    const dx = tx - bx, dz = tz - bz, d = Math.hypot(dx, dz) || 1;
    // Just off the roof, in a spinner cockpit, looking across the tanks toward MT-1.
    const x = bx - (dx / d) * 22;
    const z = bz - (dz / d) * 22;
    const y = top + 8;
    return { x, y, z, heading: headingTo(x, z, tx, tz), pitch: 0.04, mode: 'fly', cockpit: true };
  }

  if (kind === 'lanes') {
    const lane = lanes.find((l) => l.id.startsWith('dtla-avenue-')) ?? lanes.find((l) => l.id.startsWith('avenue-'));
    if (!lane) return null;
    const p = new Vector3(), tan = new Vector3(), q = new Vector3();
    sampleLane(lane, lane.length * 0.42, p, tan);
    sampleLane(lane, lane.length * 0.7, q, tan);
    const sx = -tan.z, sz = tan.x;
    const x = p.x + sx * 26, z = p.z + sz * 26;
    return { x, y: p.y + 8, z, heading: headingTo(x, z, q.x, q.z), pitch: -0.05, mode: 'fly', cockpit: true };
  }

  const mt1 = layout.landmarkById('megatower-1');
  const spec = mt1 ? HERO_SPECS[mt1.id] : undefined;
  if (!mt1 || !spec) return null;
  const yaw = bearingToYaw(mt1.bearingDeg) + ((spec.turn ?? 0) * Math.PI) / 2;
  const nx = Math.sin(yaw), nz = Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const out = spec.podium.d / 2 + 26;
  const x = mt1.x + nx * out + rx * 7;
  const z = mt1.z + nz * out + rz * 7;
  const ground = layout.heightAt(x, z);
  return {
    x, y: ground, z, heading: headingTo(x, z, mt1.x, mt1.z), pitch: 0.32, mode: 'walk',
    feet: { x, y: ground, z },
  };
}
