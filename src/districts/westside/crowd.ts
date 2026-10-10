// Sidewalk loops. Strips and the yard add a second and third loop so the same share lands heavier there.
import type { CityQuery, PackedBlock } from '../../world/CityQuery';
import { registerCrowdSource } from '../little-tokyo-market/crowd';
import { dressSprawl } from '../_shared/sprawl/dress';
import { planSprawl, type SprawlBlock } from '../_shared/sprawl/plan';
import { WESTSIDE_PARAMS } from './spec';

function idOf(b: PackedBlock, query: CityQuery): string {
  const d = b.districtIndex === 0 ? query.layout.defaultDistrict : query.layout.districts[b.districtIndex - 1];
  return d?.id ?? '';
}

function asBlock(b: PackedBlock, id: string): SprawlBlock {
  return {
    id,
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: -b.az, bz: b.ax,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
}

registerCrowdSource('westside', (blocks, query) => {
  const loops: Array<Array<[number, number]>> = [];
  const life: Array<ReturnType<typeof dressSprawl>['life'][number]> = [];
  for (const b of blocks) {
    const id = idOf(b, query);
    if (id !== 'westside') continue;
    const block = asBlock(b, id);
    const plan = planSprawl(block, WESTSIDE_PARAMS, query.layout);
    const dressed = dressSprawl(block, plan, query.layout);
    loops.push(...dressed.loops);
    life.push(...dressed.life);
  }
  return { loops, life };
}, 0.14);
