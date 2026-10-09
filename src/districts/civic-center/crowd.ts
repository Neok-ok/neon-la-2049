// Sidewalks plus the two forecourts. The mesh and the shader stay in the market module.
import type { CityQuery, PackedBlock } from '../../world/CityQuery';
import { registerCrowdSource } from '../little-tokyo-market/crowd';
import { dressBlock, plazaKit, type CivicBlock } from './dress';

function idOf(b: PackedBlock, query: CityQuery): string {
  const d = b.districtIndex === 0 ? query.layout.defaultDistrict : query.layout.districts[b.districtIndex - 1];
  return d?.id ?? '';
}

function asCivic(b: PackedBlock): CivicBlock {
  return {
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: -b.az, bz: b.ax,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
}

registerCrowdSource('civic-center', (blocks, query) => {
  const loops: Array<Array<[number, number]>> = [];
  let near = false;
  const lapd = query.layout.landmarkById('lapd-hq');
  for (const b of blocks) {
    if (idOf(b, query) !== 'civic-center') continue;
    const d = dressBlock(asCivic(b), query.layout);
    if (d.loop) loops.push(d.loop);
    if (lapd && Math.hypot(b.cx - lapd.x, b.cz - lapd.z) < 280) near = true;
  }
  if (near) loops.push(...plazaKit(query.layout).loops);
  return loops;
});
