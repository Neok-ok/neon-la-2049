// One-shot counts for the X6 pass. Not part of the runtime.
import { createTrafficDress } from '../src/vehicles/freewayDress';
import { generateFabric } from '../src/world/fabric/generator';
import { packQuery, BOX_STRIDE, QUERY_BLOCK_STRIDE } from '../src/world/queryPack';
import { getLayout } from '../src/world/layout';
import { geoToLocal } from '../src/world/geo';
import { autoTier, stepAutoGuard, type DeviceInfo, type Tier } from '../src/core/quality';

type Probe = DeviceInfo & { dpr?: number; screenMin?: number };

const layout = getLayout();
const tDress = performance.now();
const dress = createTrafficDress(layout);
const binSizes = dress.streetBins.map((b) => b.total);
console.log(JSON.stringify({
  dressMs: Math.round(performance.now() - tDress),
  freewayStreaks: dress.freewayStreaks,
  streakTotal: dress.streakTotal,
  streetStreaks: dress.streakTotal - dress.freewayStreaks,
  streetBins: dress.streetBins.length,
  streetBinMax: binSizes.length ? Math.max(...binSizes) : 0,
  districts: layout.districts.length + 1,
}, null, 2));

const spots: Array<[string, number, number]> = [
  ['little-tokyo', 34.0487, -118.2392],
  ['dtla', 34.05989, -118.2537],
  ['hollywood', 34.10005, -118.340792],
  ['lax', 33.937916, -118.408611],
  ['long-beach', 33.77227, -118.119448],
  ['east-la', 34.045743, -118.192714],
];
for (const [name, lat, lon] of spots) {
  const [x, z] = geoToLocal(lat, lon);
  const x0 = Math.floor(x / 500) * 500;
  const z0 = Math.floor(z / 500) * 500;
  const t0 = performance.now();
  const fab = generateFabric(layout, x0, z0, 500);
  const ms = performance.now() - t0;
  const packed = packQuery(fab);
  if (packed.boxes.length !== fab.boxes.length * BOX_STRIDE) throw new Error(`${name} box pack`);
  if (packed.blocks.length !== fab.blocks.length * QUERY_BLOCK_STRIDE) throw new Error(`${name} block pack`);
  const f = (n: number) => Math.fround(n);
  if (fab.boxes.length) {
    const b = fab.boxes[0]!;
    if (packed.boxes[0] !== f(b.x) || packed.boxes[4] !== f(b.h) || packed.boxes[9] !== f(b.detail)) throw new Error(`${name} box fields`);
  }
  if (fab.blocks.length) {
    const b = fab.blocks[0]!;
    if (packed.blocks[10] !== b.i || packed.blocks[12] !== f(b.bx)) throw new Error(`${name} block fields ${packed.blocks[10]} ${b.i} ${packed.blocks[12]} ${b.bx}`);
  }
  console.log(JSON.stringify({
    name, x0, z0, ms: Math.round(ms * 10) / 10, boxes: fab.boxes.length, blocks: fab.blocks.length,
  }));
}

function dev(partial: Partial<Probe> & Pick<Probe, 'gpu'>): Probe {
  return {
    isIOS: false,
    isMobile: false,
    cores: 8,
    webgpu: false,
    dpr: 1,
    screenMin: 800,
    ...partial,
  };
}

const classes: Probe[] = [
  dev({ gpu: 'Google SwiftShader', isMobile: false }),
  dev({ gpu: 'Apple GPU', isIOS: true, isMobile: true, webgpu: false, cores: 4, dpr: 3, screenMin: 390 }),
  dev({ gpu: 'Apple GPU', isIOS: true, isMobile: true, webgpu: true, cores: 6, dpr: 3, screenMin: 402 }),
  dev({ gpu: 'Apple GPU', isIOS: true, isMobile: true, webgpu: false, cores: 4, dpr: 2, screenMin: 375 }),
  dev({ gpu: 'Apple GPU', isIOS: true, isMobile: true, webgpu: false, cores: 4, dpr: 2, screenMin: 414 }),
  dev({ gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)', cores: 8, dpr: 2, screenMin: 900 }),
  dev({ gpu: 'Intel(R) UHD Graphics', cores: 4, memory: 8, dpr: 1, screenMin: 800 }),
  dev({ gpu: 'Adreno (TM) 740', isMobile: true, cores: 8, memory: 8, dpr: 2.75, screenMin: 412 }),
  dev({ gpu: 'Adreno (TM) 610', isMobile: true, cores: 8, memory: 4, dpr: 2, screenMin: 360 }),
];
for (const d of classes) {
  const r = autoTier(d);
  console.log(JSON.stringify({ gpu: d.gpu, ios: d.isIOS, mobile: d.isMobile, webgpu: d.webgpu, dpr: d.dpr, screenMin: d.screenMin, ...r }));
}

function expectTier(label: string, got: Tier, want: Tier): void {
  if (got !== want) throw new Error(`${label}: got ${got}, want ${want}`);
}

const phone = dev({ gpu: 'Apple GPU', isIOS: true, isMobile: true, webgpu: false, cores: 4, dpr: 3, screenMin: 390 });
expectTier('iphone 13 no webgpu', autoTier(phone).tier, 'medium');
expectTier('iphone webgpu stays medium', autoTier({ ...phone, webgpu: true, dpr: 3 }).tier, 'medium');
expectTier('iphone se', autoTier(dev({ gpu: 'Apple GPU', isIOS: true, isMobile: true, webgpu: false, cores: 4, dpr: 2, screenMin: 375 })).tier, 'low');
expectTier('swiftshader', autoTier(dev({ gpu: 'Google SwiftShader' })).tier, 'low');
expectTier('m3', autoTier(dev({ gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)' })).tier, 'high');

let guard = { tier: 'medium' as Tier, choice: 'auto' as const, elapsedMs: 9000, slowMs: 0, frameMs: 50 };
let drops = 0;
for (let i = 0; i < 80; i++) {
  const n = stepAutoGuard(guard);
  guard = { ...guard, tier: n.tier, slowMs: n.slowMs };
  if (n.dropped) drops++;
}
expectTier('sustained slow drops once to low', guard.tier, 'low');
if (drops !== 1) throw new Error(`expected one drop, got ${drops}`);
for (let i = 0; i < 40; i++) {
  const n = stepAutoGuard({ ...guard, frameMs: 12 });
  guard = { ...guard, slowMs: n.slowMs, tier: n.tier };
  if (n.dropped) throw new Error('safety net raised or dropped again from low');
}
expectTier('no flap back up', guard.tier, 'low');
const manual = stepAutoGuard({ tier: 'ultra', choice: 'ultra', elapsedMs: 60_000, slowMs: 0, frameMs: 80 });
if (manual.dropped || manual.tier !== 'ultra') throw new Error('manual tier moved');
const early = stepAutoGuard({ tier: 'high', choice: 'auto', elapsedMs: 1000, slowMs: 0, frameMs: 100 });
if (early.dropped) throw new Error('dropped during warmup');
console.log('guard ok');
