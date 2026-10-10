// Sidewalk loops, plus the market aisle at the slab. Share is the third argument below.
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

registerCrowdSource('k-megablock', (blocks, query) => {
  const loops: Array<Array<[number, number]>> = [];
  const extra: Array<Array<[number, number]>> = [];
  const life: ReturnType<typeof marketKit>['life'] = [];
  let near = false;
  const tower = query.layout.landmarkById('k-megablock-tower');
  for (const b of blocks) {
    if (idOf(b, query) !== 'k-megablock') continue;
    const d = dressBlock(asBlock(b), query.layout);
    if (d.loop) {
      loops.push(d.loop);
      extra.push(ring(b, 3.9));
    }
    if (tower && Math.hypot(b.cx - tower.x, b.cz - tower.z) < 420) near = true;
  }
  if (near) {
    const kit = marketKit(query.layout);
    loops.push(...kit.loops);
    extra.push(...kit.extra);
    life.push(...kit.life);
  }
  return { loops, extra, life };
}, 0.32);
