// Finds the dressed blocks cameras, the laundry hall and the hub ads all share.
import type { CityLayout } from '../../world/layout';
import { enumerateBlocks } from '../../world/fabric/generator';
import type { BlockInfo } from '../../world/fabric/types';
import { planResidential, type ResBlock, type ResidentialPlan } from '../_shared/residential/plan';
import { HUB, SOUTH_LA_PARAMS } from './spec';

export interface Found {
  block: ResBlock;
  plan: ResidentialPlan;
}

export function toRes(b: BlockInfo): ResBlock {
  return {
    id: b.district.id,
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: b.bx, bz: b.bz,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
}

export function worldAt(b: ResBlock, s: number, t: number, y = 0): { x: number; y: number; z: number } {
  return {
    x: b.cx + b.ax * s + b.bx * t,
    y: b.ground + y,
    z: b.cz + b.az * s + b.bz * t,
  };
}

export function searchResidential(layout: CityLayout, x: number, z: number, span: number): Found[] {
  const out: Found[] = [];
  for (const b of enumerateBlocks(layout, x - span / 2, z - span / 2, span)) {
    if (b.district.id !== 'south-la-megablocks') continue;
    const block = toRes(b);
    out.push({ block, plan: planResidential(block, SOUTH_LA_PARAMS, layout) });
  }
  return out;
}

let hubCache: Found | null | undefined;

export function findHub(layout: CityLayout): Found | null {
  if (hubCache !== undefined) return hubCache;
  hubCache = searchResidential(layout, HUB.x, HUB.z, 360).find((f) => f.plan.hub) ?? null;
  return hubCache;
}

/** Door frame. Local +Z points south, into the yard. The corridor runs north. */
export function laundryOrigin(layout: CityLayout): { x: number; y: number; z: number; yaw: number } | null {
  const hub = findHub(layout);
  if (!hub?.plan.shop) return null;
  const p = worldAt(hub.block, hub.plan.shop.s, hub.plan.shop.t, 0);
  return { x: p.x, y: p.y, z: p.z, yaw: 0 };
}
