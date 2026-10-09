// Sidewalk loops, plus the market aisle at the slab. Density is set in the market crowd field.
import type { CityQuery, PackedBlock } from '../../world/CityQuery';
import { registerCrowdSource } from '../little-tokyo-market/crowd';
import { dressBlock, marketKit, type KBlock } from './dress';

function idOf(b: PackedBlock, query: CityQuery): string {
  const d = b.districtIndex === 0 ? query.layout.defaultDistrict : query.layout.districts[b.districtIndex - 1];
  return d?.id ?? '';
}

function asBlock(b: PackedBlock): KBlock {
  return {
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: -b.az, bz: b.ax,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
}

registerCrowdSource('k-megablock', (blocks, query) => {
  const loops: Array<Array<[number, number]>> = [];
  let near = false;
  const tower = query.layout.landmarkById('k-megablock-tower');
  for (const b of blocks) {
    if (idOf(b, query) !== 'k-megablock') continue;
    const d = dressBlock(asBlock(b), query.layout);
    if (d.loop) loops.push(d.loop);
    if (tower && Math.hypot(b.cx - tower.x, b.cz - tower.z) < 420) near = true;
  }
  if (near) loops.push(...marketKit(query.layout).loops);
  return loops;
});
