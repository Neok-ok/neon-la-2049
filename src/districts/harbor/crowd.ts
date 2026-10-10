// A few quay hands. The mesh stays the market crowd.
import type { CityQuery, PackedBlock } from '../../world/CityQuery';
import { registerCrowdSource } from '../little-tokyo-market/crowd';
import { craneNear, harborSites } from './sites';

function idOf(b: PackedBlock, query: CityQuery): string {
  const d = b.districtIndex === 0 ? query.layout.defaultDistrict : query.layout.districts[b.districtIndex - 1];
  return d?.id ?? '';
}

registerCrowdSource('harbor', (blocks, query) => {
  const sites = harborSites(query.layout);
  const loops: Array<Array<[number, number]>> = [];
  for (const b of blocks) {
    if (idOf(b, query) !== 'harbor') continue;
    if (!craneNear(sites, b.cx, b.cz, 140)) continue;
    const yOff = 8;
    loops.push([
      [b.cx - yOff, b.cz - 20],
      [b.cx + 24, b.cz - 20],
      [b.cx + 24, b.cz + 16],
      [b.cx - yOff, b.cz + 16],
    ]);
  }
  return loops;
});
