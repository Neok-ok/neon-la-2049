// Boulevard sidewalks. Share is registered here. A third loop sits just off the curb,
// away from the driving line, so the two original loops stay the main paths.
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

/** Shift a thin curb loop off the street. The short edge points toward the roadway. */
function offCurb(loop: Array<[number, number]>, metres: number): Array<[number, number]> | null {
  if (loop.length < 4) return null;
  let short = -1;
  let shortLen = 1e9;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < shortLen) { shortLen = L; short = i; }
  }
  if (short < 0 || shortLen < 0.2 || shortLen > 2) return null;
  const a = loop[short]!;
  const b = loop[(short + 1) % loop.length]!;
  const dx = (b[0] - a[0]) / shortLen;
  const dz = (b[1] - a[1]) / shortLen;
  return loop.map(([x, z]) => [x - dx * metres, z - dz * metres]);
}

registerCrowdSource('hollywood', (blocks, query) => {
  const loops: Array<Array<[number, number]>> = [];
  const extra: Array<Array<[number, number]>> = [];
  for (const b of blocks) {
    if (idOf(b, query) !== 'hollywood') continue;
    for (const loop of planHollywood(asBlock(b)).loops) {
      loops.push(loop);
      const shifted = offCurb(loop, 1.15);
      if (shifted) extra.push(shifted);
    }
  }
  return { loops, extra };
}, 0.22);
