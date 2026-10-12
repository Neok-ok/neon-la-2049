// A few yard workers. The mesh stays the market crowd.
import type { CityQuery, PackedBlock } from '../../world/CityQuery';
import { CURB_W, streetProfile } from '../../roads/profile';
import { streetGraph, visitBins } from '../../vehicles/streetGraph';
import { registerCrowdSource } from '../little-tokyo-market/crowd';
import type { RefineryBlock } from '../_shared/refinery/plan';
import { planSoutheast } from './plan';

function sidewalkLoop(query: CityQuery, x: number, z: number): Array<[number, number]> | null {
  const g = streetGraph(query.layout);
  let bestEdge = -1;
  let bestT = 0;
  let bestDist = 160;
  visitBins(x, z, 180, (key) => {
    const list = g.bins.get(key);
    if (!list) return;
    for (const idx of list) {
      const e = g.edges[idx];
      if (!e || e.kind === 'freeway') continue;
      const a = g.nodes[e.a]!;
      const b = g.nodes[e.b]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz || 1;
      let t = ((x - a.x) * dx + (z - a.z) * dz) / l2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const dist = Math.hypot(px - x, pz - z);
      if (dist < bestDist) {
        bestEdge = idx;
        bestT = t;
        bestDist = dist;
      }
    }
  });
  if (bestEdge < 0) return null;
  const e = g.edges[bestEdge]!;
  const a = g.nodes[e.a]!;
  const b = g.nodes[e.b]!;
  const px = a.x + (b.x - a.x) * bestT;
  const pz = a.z + (b.z - a.z) * bestT;
  const rx = e.fz;
  const rz = -e.fx;
  const side = Math.sign((x - px) * rx + (z - pz) * rz) || 1;
  const street = query.layout.districtAt(px, pz).grid.street;
  const profile = streetProfile(street, e.lane, e.kind === 'canyon' ? 'canyon' : 'street');
  if (profile.sidewalk < 1.2) return null;
  const lat = side * (profile.carriageHalf + CURB_W + Math.min(1.6, profile.sidewalk * 0.55));
  const pts: Array<[number, number]> = [];
  for (const along of [-14, -4, 6, 16]) {
    const t = bestT + along / Math.max(8, e.length);
    if (t < 0.04 || t > 0.96) continue;
    pts.push([a.x + (b.x - a.x) * t + rx * lat, a.z + (b.z - a.z) * t + rz * lat]);
  }
  return pts.length >= 2 ? pts : null;
}

function idOf(b: PackedBlock, query: CityQuery): string {
  const d = b.districtIndex === 0 ? query.layout.defaultDistrict : query.layout.districts[b.districtIndex - 1];
  return d?.id ?? '';
}

function asBlock(b: PackedBlock): RefineryBlock {
  return {
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: -b.az, bz: b.ax,
    la: b.la, lb: b.lb, street: b.street, seed: b.seed, ground: b.ground,
  };
}

registerCrowdSource('southeast-industrial', (blocks, query) => {
  const loops: Array<Array<[number, number]>> = [];
  for (const b of blocks) {
    if (idOf(b, query) !== 'southeast-industrial') continue;
    loops.push(...planSoutheast(asBlock(b), query.layout).loops);
    const walk = sidewalkLoop(query, b.cx, b.cz);
    if (walk) loops.push(walk);
  }
  return loops;
}, 0.04);
