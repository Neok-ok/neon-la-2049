// Sidewalk loops for the shared crowd mesh. Registered from detail-index so App does not grow a
// per-district import. Plaza loops are the MT-1 / MT-5 aprons, and only while a nearby block is loaded.
import type { CityQuery, PackedBlock } from '../../world/CityQuery';
import { registerCrowdSource } from '../little-tokyo-market/crowd';
import { blockIndexAt } from '../_shared/megablock/grid';
import { dressBlock, type DtlaBlock } from './block';
import { plazaLoops } from './plaza';

function idOf(b: PackedBlock, query: CityQuery): string {
  const d = b.districtIndex === 0 ? query.layout.defaultDistrict : query.layout.districts[b.districtIndex - 1];
  return d?.id ?? '';
}

function asDtla(b: PackedBlock): DtlaBlock {
  const idx = blockIndexAt(b.cx, b.cz);
  return {
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: -b.az, bz: b.ax,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
    i: idx.i, j: idx.j,
  };
}

registerCrowdSource('dtla', (blocks, query) => {
  const loops: Array<Array<[number, number]>> = [];
  for (const b of blocks) {
    if (idOf(b, query) !== 'dtla') continue;
    loops.push(...dressBlock(asDtla(b), query.layout).loops);
  }
  return loops;
});

registerCrowdSource('financial-megatowers', (blocks, query) => {
  const mt1 = query.layout.landmarkById('megatower-1');
  const mt5 = query.layout.landmarkById('megatower-5');
  let near = false;
  for (const b of blocks) {
    if (idOf(b, query) !== 'financial-megatowers') continue;
    const d1 = mt1 ? Math.hypot(b.cx - mt1.x, b.cz - mt1.z) : 1e9;
    const d5 = mt5 ? Math.hypot(b.cx - mt5.x, b.cz - mt5.z) : 1e9;
    if (d1 < 220 || d5 < 220) { near = true; break; }
  }
  return near ? plazaLoops(query.layout) : [];
});
