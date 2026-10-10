// Sidewalk coats. The mesh stays the market crowd. Share is set in that file.
import type { CityQuery, PackedBlock } from '../../world/CityQuery';
import { registerCrowdSource } from '../little-tokyo-market/crowd';

function idOf(b: PackedBlock, query: CityQuery): string {
  const d = b.districtIndex === 0 ? query.layout.defaultDistrict : query.layout.districts[b.districtIndex - 1];
  return d?.id ?? '';
}

registerCrowdSource('long-beach', (blocks, query) => {
  const loops: Array<Array<[number, number]>> = [];
  for (const b of blocks) {
    if (idOf(b, query) !== 'long-beach') continue;
    if (b.ground > 45) continue;
    const bx = -b.az;
    const bz = b.ax;
    const s = b.la / 2 + 2.4;
    const t = b.lb / 2 + 2.4;
    const corner = (ds: number, dt: number): [number, number] => [
      b.cx + b.ax * ds + bx * dt,
      b.cz + b.az * ds + bz * dt,
    ];
    loops.push([corner(s, t), corner(s, -t), corner(-s, -t), corner(-s, t)]);
  }
  return loops;
});
