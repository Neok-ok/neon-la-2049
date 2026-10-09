// Finds the yard, a strip, a quiet street and a tower the cameras and the diner share.
import type { CityLayout } from '../../world/layout';
import { enumerateBlocks } from '../../world/fabric/generator';
import type { BlockInfo } from '../../world/fabric/types';
import { planSprawl, type SprawlBlock, type SprawlPlan } from '../_shared/sprawl/plan';
import { HUB, WESTSIDE_PARAMS } from './spec';

export interface Found {
  block: SprawlBlock;
  plan: SprawlPlan;
}

export function toSprawl(b: BlockInfo): SprawlBlock {
  return {
    id: b.district.id,
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: b.bx, bz: b.bz,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
}

export function worldAt(b: SprawlBlock, s: number, t: number, y = 0): { x: number; y: number; z: number } {
  return {
    x: b.cx + b.ax * s + b.bx * t,
    y: b.ground + y,
    z: b.cz + b.az * s + b.bz * t,
  };
}

export function searchSprawl(layout: CityLayout, x: number, z: number, span: number): Found[] {
  const out: Found[] = [];
  for (const b of enumerateBlocks(layout, x - span / 2, z - span / 2, span)) {
    if (b.district.id !== 'westside' || b.ground > 45) continue;
    const block = toSprawl(b);
    out.push({ block, plan: planSprawl(block, WESTSIDE_PARAMS, layout) });
  }
  return out;
}

let hubCache: Found | null | undefined;

export function findHub(layout: CityLayout): Found | null {
  if (hubCache !== undefined) return hubCache;
  hubCache = searchSprawl(layout, HUB.x, HUB.z, 420).find((f) => f.plan.hub) ?? null;
  return hubCache;
}

/** Door frame. Local +Z points out the door, south into the yard on this grid. */
export function dinerOrigin(layout: CityLayout): { x: number; y: number; z: number; yaw: number } | null {
  const hub = findHub(layout);
  if (!hub?.plan.diner) return null;
  const p = worldAt(hub.block, hub.plan.diner.s, hub.plan.diner.t, 0);
  return { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(-hub.block.ax, -hub.block.az) };
}
