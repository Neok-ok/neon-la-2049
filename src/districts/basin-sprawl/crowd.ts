// One sidewalk loop per block. A strip adds the stall line, so the same share sits heavier there.
import type { CityQuery, PackedBlock } from '../../world/CityQuery';
import { registerCrowdSource } from '../little-tokyo-market/crowd';
import { dressSprawl } from '../_shared/sprawl/dress';
import { planSprawl, type SprawlBlock } from '../_shared/sprawl/plan';
import { BASIN_PARAMS } from './spec';

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

registerCrowdSource('basin-sprawl', (blocks, query) => {
  const loops: Array<Array<[number, number]>> = [];
  const life: Array<ReturnType<typeof dressSprawl>['life'][number]> = [];
  for (const b of blocks) {
    const id = idOf(b, query);
    if (id !== 'basin-sprawl') continue;
    const block = asBlock(b, id);
    const plan = planSprawl(block, BASIN_PARAMS, query.layout);
    const dressed = dressSprawl(block, plan, query.layout);
    loops.push(...dressed.loops);
    life.push(...dressed.life);
  }
  return { loops, life };
}, 0.07);
