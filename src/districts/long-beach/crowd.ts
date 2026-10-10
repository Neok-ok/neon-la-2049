// Sidewalk coats. Share is registered here. The 2.4 m ring stays the main path;
// 4.3 m and 6.0 m stay inside the sidewalk (the driving line is about 8.2 m out).
import type { CityQuery, PackedBlock } from '../../world/CityQuery';
import { registerCrowdSource } from '../little-tokyo-market/crowd';

function idOf(b: PackedBlock, query: CityQuery): string {
  const d = b.districtIndex === 0 ? query.layout.defaultDistrict : query.layout.districts[b.districtIndex - 1];
  return d?.id ?? '';
}

function ring(b: PackedBlock, out: number): Array<[number, number]> {
  const bx = -b.az;
  const bz = b.ax;
  const s = b.la / 2 + out;
  const t = b.lb / 2 + out;
  return [[s, t], [s, -t], [-s, -t], [-s, t]].map(([ds, dt]) => [
    b.cx + b.ax * ds + bx * dt,
    b.cz + b.az * ds + bz * dt,
  ]);
}

registerCrowdSource('long-beach', (blocks, query) => {
  const loops: Array<Array<[number, number]>> = [];
  const extra: Array<Array<[number, number]>> = [];
  for (const b of blocks) {
    if (idOf(b, query) !== 'long-beach') continue;
    if (b.ground > 45) continue;
    loops.push(ring(b, 2.4));
    extra.push(ring(b, 4.3), ring(b, 6.0));
  }
  return { loops, extra };
}, 0.16);
