// Sidewalk loops for the shared crowd mesh. Registered from detail-index so App does not grow a
// per-district import. Plaza loops are the MT-1 / MT-5 aprons, and only while a nearby block is loaded.
// The three B1 heroes sit west of those plazas, so a loaded block near one also gets a sidewalk
// around the footprint and a short queue at the door. Same mesh, same share.
import type { CityQuery, PackedBlock } from '../../world/CityQuery';
import { hashString } from '../../core/rng';
import { bearingToDir } from '../../world/geo';
import { lifeSpot, type CrowdLifeSpot } from '../../world/crowdLife';
import { doorFace } from '../../world/buildings/parts';
import { placeHero } from '../../world/buildings/place';
import { registerCrowdSource } from '../little-tokyo-market/crowd';
import { blockIndexAt } from '../_shared/megablock/grid';
import { dressBlock, type DtlaBlock } from './block';
import { plazaLoops } from './plaza';

const HERO_DOOR: ReadonlyArray<readonly [string, 'hero-gate' | 'hero-step' | 'hero-obelisk']> = [
  ['b1-gate', 'hero-gate'],
  ['b1-step', 'hero-step'],
  ['b1-obelisk', 'hero-obelisk'],
];

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
    const door = doorFace(placed.draft);
    if (!door) continue;
    // Beside the jamb, opposite the flight, so the doorway and the steps stay readable.
    const ss = door.s - 2.8;
    const tt = door.t - 2.6;
    const x = l.x + ax * ss + bx * tt;
    const z = l.z + az * ss + bz * tt;
    life.push(lifeSpot(x, z, Math.atan2(-ax, -az), 'queue', 3));
  }
  return { extra, life };
}

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
  const apron = heroApron(query, blocks);
  const loops = near ? plazaLoops(query.layout) : [];
  if (!loops.length && !apron.extra.length) return [];
  return { loops, extra: apron.extra, life: apron.life };
}, 0.4);
