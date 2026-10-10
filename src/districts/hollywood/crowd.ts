// Sidewalk loops on the boulevard only. The mesh stays the market crowd.
import type { CityQuery, PackedBlock } from '../../world/CityQuery';
import { registerCrowdSource } from '../little-tokyo-market/crowd';
import { planHollywood, type HwBlock } from './plan';
import { indexOf } from './spec';

function idOf(b: PackedBlock, query: CityQuery): string {
  const d = b.districtIndex === 0 ? query.layout.defaultDistrict : query.layout.districts[b.districtIndex - 1];
  return d?.id ?? '';
}

function asBlock(b: PackedBlock): HwBlock {
  const { i, j } = indexOf(b.cx, b.cz);
  return {
    i, j,
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: -b.az, bz: b.ax,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
}

registerCrowdSource('hollywood', (blocks, query) => {
  const loops: Array<Array<[number, number]>> = [];
  for (const b of blocks) {
    if (idOf(b, query) !== 'hollywood') continue;
    loops.push(...planHollywood(asBlock(b)).loops);
  }
  return loops;
});
