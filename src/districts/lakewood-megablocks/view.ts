// Screenshot and debug cameras for Stage 11 (`__nla.lakewoodView`).
import type { CityLayout } from '../../world/layout';
import { geoToLocal } from '../../world/geo';
import { findHub, searchResidential, worldAt, type Found } from './locate';
import { HUB, K_TOWER } from './spec';

export type LakewoodView =
  | 'street'
  | 'courtyard'
  | 'market'
  | 'laundry'
  | 'traffic'
  | 'k-edge'
  | 'river'
  | 'aerial'
  | 'shop'
  | 'hub';

export interface LakePose {
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
): LakePose {
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
): LakePose {
  const dist = Math.hypot(look.x - eye.x, look.z - eye.z) || 1;
  return {
    x: eye.x, y: eye.y, z: eye.z,
    heading: headingTo(eye.x, eye.z, look.x, look.z),
    pitch: Math.atan2(look.y - eye.y, dist),
    mode: 'fly', cockpit,
  };
}

function around(layout: CityLayout): Found[] {
  const list = searchResidential(layout, HUB.x, HUB.z, 1600);
  list.sort((a, b) => {
    const da = (a.block.cx - HUB.x) ** 2 + (a.block.cz - HUB.z) ** 2;
    const db = (b.block.cx - HUB.x) ** 2 + (b.block.cz - HUB.z) ** 2;
    return da - db;
  });
  return list;
}

export function lakewoodCamera(layout: CityLayout, kind: LakewoodView): LakePose | null {
  if (kind === 'aerial') {
    const [x, z] = geoToLocal(33.86, -118.145);
    const g = layout.heightAt(x, z);
    return fly({ x, y: g + 680, z: z + 420 }, { x, y: g + 36, z }, true);
  }
  if (kind === 'k-edge') {
    const x = K_TOWER.x;
    const z = K_TOWER.z + 760;
    if (layout.districtAt(x, z).id !== 'lakewood-megablocks' || layout.isReserved(x, z, 2)) return null;
    const g = layout.heightAt(x, z);
    return walk({ x, y: g, z }, { x, y: g + 96, z: K_TOWER.z }, 0.55);
  }
  if (kind === 'river') {
    // West face of an edge block, where the −B sidewalk meets the river / I-710 reserve.
    const edges = searchResidential(layout, 6400, 21400, 7000).filter((f) => f.plan.edge);
    edges.sort((a, b) => a.block.cx - b.block.cx);
    for (const f of edges) {
      const b = f.block;
      const probe = worldAt(b, 0, -b.lb / 2 - 16, 0);
      if (!layout.isReserved(probe.x, probe.z, 2)) continue;
      const feet = worldAt(b, -6, -b.lb / 2 - 8, 0.04);
      if (layout.districtAt(feet.x, feet.z).id !== 'lakewood-megablocks') continue;
      if (layout.isReserved(feet.x, feet.z, 0.8)) continue;
      const look = worldAt(b, 10, -b.lb / 2 + 6, 3.2);
      return walk(feet, look, 0.16);
    }
    return null;
  }
  if (kind === 'traffic') {
    let best: LakePose | null = null;
    let bd = Infinity;
    for (let di = -10; di <= 10; di++) {
      for (let dj = -10; dj <= 10; dj++) {
        const i = -105 + di;
        const j = 73 + dj;
        const x = j * 130;
        const z = -i * 210;
        if (layout.districtAt(x, z).id !== 'lakewood-megablocks') continue;
        if (layout.isReserved(x, z, 6)) continue;
        const sx = x + 9.4;
        const sz = z + 5;
        if (layout.districtAt(sx, sz).id !== 'lakewood-megablocks') continue;
        if (layout.isReserved(sx, sz, 1)) continue;
        const d = (x - HUB.x) ** 2 + (z - HUB.z) ** 2;
        if (d >= bd) continue;
        bd = d;
        const g = layout.heightAt(sx, sz);
        best = walk({ x: sx, y: g, z: sz }, { x, y: g + 1.6, z }, 0.06);
      }
    }
    return best;
  }

  const list = around(layout);
  if (kind === 'shop' || kind === 'hub') {
    const hub = findHub(layout);
    if (!hub?.plan.shop) return null;
    const door = worldAt(hub.block, hub.plan.shop.s, hub.plan.shop.t, 0);
    if (kind === 'hub') {
      // South yard, looking north. The tanks sit beside the door, so a stance there is a slot.
      const feet = worldAt(hub.block, -16, 6, 0.04);
      const look = worldAt(hub.block, 28, -2, 5.5);
      return walk(feet, look, 0.14);
    }
    // Inside the corridor, looking north into the counter room. Local +Z is south.
    const feet = { x: door.x, y: door.y + 0.16, z: door.z - 2.1 };
    const look = { x: door.x, y: door.y + 1.35, z: door.z - 6.4 };
    return walk(feet, look, 0.02);
  }
  if (kind === 'courtyard') {
    const hit = list.find((f) => f.plan.court && f.plan.entry);
    if (!hit?.plan.court || !hit.plan.entry) return null;
    const feet = worldAt(hit.block, hit.plan.court.s - 2, hit.plan.court.t + 11, 0.12);
    const look = worldAt(hit.block, hit.plan.court.s + 18, hit.plan.court.t - 4, 16);
    return walk(feet, look, 0.18);
  }
  if (kind === 'market') {
    const hit = list.find((f) => !f.plan.hub && f.plan.stalls.length >= 3);
    const stall = hit?.plan.stalls[0];
    if (!hit || !stall) return null;
    const outS = stall.face === 0 ? 5.5 : stall.face === 2 ? -5.5 : 0;
    const outT = stall.face === 1 ? 5.5 : stall.face === 3 ? -5.5 : 0;
    const feet = worldAt(hit.block, stall.s + outS, stall.t + outT, 0.04);
    const look = worldAt(hit.block, stall.s, stall.t, 2.2);
    return walk(feet, look, 0.16);
  }
  if (kind === 'laundry') {
    const hit = list.find((f) => f.plan.laundry && !f.plan.hub && !f.plan.edge && f.plan.height > 40);
    const L = hit?.plan.laundry;
    if (!hit || !L) return null;
    // Off the −B face, aimed at the cage. Pitch follows that point so the lines sit mid-frame.
    const feet = worldAt(hit.block, L.s + L.ns * 8 - 2.4, L.t + L.nt * 8, 0.04);
    const look = worldAt(hit.block, L.s + L.ns * 0.2, L.t + L.nt * 0.15, L.y);
    const dist = Math.hypot(look.x - feet.x, look.z - feet.z) || 1;
    return walk(feet, look, Math.atan2(L.y - 1.7, dist));
  }
  // Sidewalk, looking along the street. A look into the mass fills the frame with one slab.
  const hit = list.find((f) => f.plan.family === 'bar' && !f.plan.hub && !f.plan.edge);
  if (!hit) return null;
  const s = -(hit.block.la / 2 + 8);
  const feet = worldAt(hit.block, s, -22, 0.04);
  const look = worldAt(hit.block, s + 10, 58, 8);
  return walk(feet, look, 0.1);
}
