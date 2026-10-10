// Sidewalk loops. Strips and the hall add a second and third loop so the same share lands heavier there.
// The worker ships `seed` as float32. Rebuild it with hash2i so the loop sits on the stalls.
import type { CityQuery, PackedBlock } from '../../world/CityQuery';
import { registerCrowdSource } from '../little-tokyo-market/crowd';
import { dressSprawl } from '../_shared/sprawl/dress';
import { gridIndex, planSprawl, type SprawlBlock } from '../_shared/sprawl/plan';
import { blockSeed, DISTRICT, EAST_LA_PARAMS } from './spec';

function idOf(b: PackedBlock, query: CityQuery): { id: string; index: number } | null {
  const d = b.districtIndex === 0 ? query.layout.defaultDistrict : query.layout.districts[b.districtIndex - 1];
  if (!d || d.id !== DISTRICT) return null;
  return { id: d.id, index: d.index };
}

function asBlock(b: PackedBlock, id: string, index: number): SprawlBlock {
  const block: SprawlBlock = {
    id,
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: -b.az, bz: b.ax,
    la: b.la, lb: b.lb, street: b.street, seed: 1, ground: b.ground,
  };
  const { i, j } = gridIndex(block);
  block.seed = blockSeed(i, j, index);
  return block;
}

registerCrowdSource(DISTRICT, (blocks, query) => {
  const loops: Array<Array<[number, number]>> = [];
  for (const b of blocks) {
    const own = idOf(b, query);
    if (!own) continue;
    const block = asBlock(b, own.id, own.index);
    const plan = planSprawl(block, EAST_LA_PARAMS, query.layout);
    loops.push(...dressSprawl(block, plan, query.layout).loops);
  }
  return loops;
});
