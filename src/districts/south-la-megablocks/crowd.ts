// Sidewalk loops, heavier on market spines and at the Exposition yard.
// Share is the third argument of registerCrowdSource, above Lakewood and under K.
import type { CityQuery, PackedBlock } from '../../world/CityQuery';
import { registerCrowdSource } from '../little-tokyo-market/crowd';
import { dressResidential } from '../_shared/residential/dress';
import { planResidential, type ResBlock } from '../_shared/residential/plan';
import { SOUTH_LA_PARAMS } from './spec';

function idOf(b: PackedBlock, query: CityQuery): string {
  const d = b.districtIndex === 0 ? query.layout.defaultDistrict : query.layout.districts[b.districtIndex - 1];
  return d?.id ?? '';
}

function asBlock(b: PackedBlock, id: string): ResBlock {
  return {
    id,
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: -b.az, bz: b.ax,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
}

registerCrowdSource('south-la-megablocks', (blocks, query) => {
  const loops: Array<Array<[number, number]>> = [];
  const life: Array<ReturnType<typeof dressResidential>['life'][number]> = [];
  for (const b of blocks) {
    const id = idOf(b, query);
    if (id !== 'south-la-megablocks') continue;
    const block = asBlock(b, id);
    const plan = planResidential(block, SOUTH_LA_PARAMS, query.layout);
    const busy = plan.spine || plan.hub;
    const dressed = dressResidential(block, plan, query.layout, { busy });
    loops.push(...dressed.loops);
    life.push(...dressed.life);
  }
  return { loops, life };
}, 0.2);
