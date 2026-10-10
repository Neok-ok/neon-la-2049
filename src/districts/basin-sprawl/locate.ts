// Finds a quiet street, a strip and a roof the cameras share. No yard this stage.
import type { CityLayout } from '../../world/layout';
import { enumerateBlocks } from '../../world/fabric/generator';
import type { BlockInfo } from '../../world/fabric/types';
import { planSprawl, type SprawlBlock, type SprawlPlan } from '../_shared/sprawl/plan';
import { BASIN_PARAMS } from './spec';

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
    if (b.district.id !== 'basin-sprawl' || b.ground > 45) continue;
    const block = toSprawl(b);
    out.push({ block, plan: planSprawl(block, BASIN_PARAMS, layout) });
  }
  return out;
}
