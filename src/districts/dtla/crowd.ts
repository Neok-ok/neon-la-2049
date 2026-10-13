// Sidewalk loops for the shared crowd mesh. Registered from detail-index so App does not grow a
// per-district import. Plaza loops are the MT-1 / MT-5 aprons, and only while a nearby block is loaded.
// The placed B1 heroes sit west of those plazas, so a loaded block near one also gets a sidewalk
// around the footprint and a short queue at the door. The kite reserve has no door. Same mesh, same share.
import type { CityQuery, PackedBlock } from '../../world/CityQuery';
import { hash2i, hashString } from '../../core/rng';
import { bearingToDir } from '../../world/geo';
import { lifeSpot, type CrowdLifeSpot } from '../../world/crowdLife';
import { queueSpot } from '../../world/buildings/parts';
import { placeHero } from '../../world/buildings/place';
import { CURB_W, streetProfile } from '../../roads/profile';
import { streetGraph, visitBins } from '../../vehicles/streetGraph';
import { registerCrowdSource } from '../little-tokyo-market/crowd';
import { dressBlock, type DtlaBlock } from './block';
import { plazaLoops } from './plaza';

const HERO_DOOR: ReadonlyArray<readonly [string, 'hero-gate' | 'hero-step']> = [
  ['b1-gate', 'hero-gate'],
  ['b1-step', 'hero-step'],
];

function sidewalkLoop(query: CityQuery, x: number, z: number): Array<[number, number]> | null {
  const g = streetGraph(query.layout);
  let bestEdge = -1;
  let bestT = 0;
  let bestDist = 180;
  visitBins(x, z, 200, (key) => {
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
  // The inner 1.6 m of this sidewalk is the asphalt in the night frames.
  // Stand in the outer walk, short of the building line, so the shoes
  // are on the slab and the lane paint stays on the street side.
  const inset = Math.min(profile.sidewalk - 0.55, Math.max(1.15, profile.sidewalk * 0.78));
  const lat = side * (profile.carriageHalf + CURB_W + inset);
  const pts: Array<[number, number]> = [];
  for (const along of [-18, -6, 6, 18]) {
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

function asDtla(b: PackedBlock): DtlaBlock {
  // The query buffer stores the seed as float32, which does not round-trip.
  // Rebuild the generator seed so the door queue lands on the mesh that was actually built.
  const i = Math.round(b.i);
  const j = Math.round(b.j);
  const index = Math.round(b.districtIndex);
  return {
    cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, bx: b.bx, bz: b.bz,
    la: b.la, lb: b.lb, street: b.street,
    seed: hash2i(i + 100000, j + 100000, index * 7919 + 13),
    ground: b.ground,
    i, j,
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

registerCrowdSource('dtla', (blocks, query) => {
  const loops: Array<Array<[number, number]>> = [];
  const extra: Array<Array<[number, number]>> = [];
  const life: ReturnType<typeof dressBlock>['life'] = [];
  for (const b of blocks) {
    if (idOf(b, query) !== 'dtla') continue;
    const dressed = dressBlock(asDtla(b), query.layout);
    loops.push(...dressed.loops);
    extra.push(ring(b, 4.6), ring(b, 6.4));
    life.push(...dressed.life);
  }
  return { loops, extra, life };
}, 0.4);

function heroApron(query: CityQuery, blocks: PackedBlock[]): { extra: Array<Array<[number, number]>>; life: CrowdLifeSpot[] } {
  const extra: Array<Array<[number, number]>> = [];
  const life: CrowdLifeSpot[] = [];
  for (const [id, kind] of HERO_DOOR) {
    const l = query.layout.landmarkById(id);
    if (!l) continue;
    let close = false;
    for (const b of blocks) {
      if (idOf(b, query) !== 'financial-megatowers') continue;
      if (Math.hypot(b.cx - l.x, b.cz - l.z) < 170) { close = true; break; }
    }
    if (!close) continue;
    const w = l.baseWidth;
    const depth = l.baseDepth ?? w * 0.7;
    const out = 3.6;
    const [ax, az] = bearingToDir(l.bearingDeg);
    const [bx, bz] = bearingToDir(l.bearingDeg + 90);
    const hs = depth / 2 + out;
    const ht = w / 2 + out;
    extra.push([[hs, ht], [hs, -ht], [-hs, -ht], [-hs, ht]].map(([ds, dt]) => [
      l.x + ax * ds + bx * dt,
      l.z + az * ds + bz * dt,
    ]));
    const placed = placeHero(kind, w, depth, l.height, (hashString(l.id) % 1000) / 1000);
    const spot = queueSpot(placed.draft);
    if (!spot) continue;
    // Beside the jamb, opposite the flight, so the doorway and the steps stay readable.
    const ss = spot.s - 0.3;
    const tt = spot.t;
    const x = l.x + ax * ss + bx * tt;
    const z = l.z + az * ss + bz * tt;
    life.push(lifeSpot(x, z, Math.atan2(-ax, -az), 'queue', 3));
  }
  return { extra, life };
}

registerCrowdSource('financial-megatowers', (blocks, query) => {
  const mt1 = query.layout.landmarkById('megatower-1');
  const mt5 = query.layout.landmarkById('megatower-5');
  const loops: Array<Array<[number, number]>> = [];
  let near = false;
  for (const b of blocks) {
    if (idOf(b, query) !== 'financial-megatowers') continue;
    const walk = sidewalkLoop(query, b.cx, b.cz);
    if (walk) loops.push(walk);
    const d1 = mt1 ? Math.hypot(b.cx - mt1.x, b.cz - mt1.z) : 1e9;
    const d5 = mt5 ? Math.hypot(b.cx - mt5.x, b.cz - mt5.z) : 1e9;
    if (d1 < 220 || d5 < 220) near = true;
  }
  if (near) loops.push(...plazaLoops(query.layout));
  const apron = heroApron(query, blocks);
  if (!loops.length && !apron.extra.length && !apron.life.length) return [];
  return { loops, extra: apron.extra, life: apron.life };
}, 0.4);
