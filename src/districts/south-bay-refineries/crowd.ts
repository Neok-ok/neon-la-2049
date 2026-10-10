// A few yard workers. The mesh stays the market crowd.
import { hash2i } from '../../core/rng';
import type { CityQuery, PackedBlock } from '../../world/CityQuery';
import { registerCrowdSource } from '../little-tokyo-market/crowd';
import type { RefineryBlock } from '../_shared/refinery/plan';
import { planSouthBay } from './plan';
import { BLOCK_A, BLOCK_B } from './spec';

function idOf(b: PackedBlock, query: CityQuery): string {
  const d = b.districtIndex === 0 ? query.layout.defaultDistrict : query.layout.districts[b.districtIndex - 1];
  return d?.id ?? '';
}

function asBlock(b: PackedBlock, index: number): RefineryBlock {
  const i = Math.round(-b.cz / BLOCK_A - 0.5);
  const j = Math.round(b.cx / BLOCK_B - 0.5);
  return {
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: -b.az, bz: b.ax,
    la: b.la, lb: b.lb, street: b.street,
    seed: hash2i(i + 100000, j + 100000, index * 7919 + 13),
    ground: b.ground,
  };
}

registerCrowdSource('south-bay-refineries', (blocks, query) => {
  const loops: Array<Array<[number, number]>> = [];
  for (const b of blocks) {
    if (idOf(b, query) !== 'south-bay-refineries') continue;
    const d = b.districtIndex === 0 ? query.layout.defaultDistrict : query.layout.districts[b.districtIndex - 1];
    loops.push(...planSouthBay(asBlock(b, d?.index ?? 0), query.layout).loops);
  }
  return loops;
});
