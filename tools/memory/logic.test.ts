// Pure checks for the memory budget, screen-space LOD, residency fit and the guard.
// Run with `node tools/memory/run-logic.mjs` (Vite loads the TypeScript).
import { BufferAttribute, BufferGeometry } from 'three/webgpu';
import { detectBudget, type BudgetDevice } from '../../src/core/memory/budget';
import { stepGovernor, PRESSURE_REST } from '../../src/core/memory/governor';
import { estimateStreamingBytes, fitRadii } from '../../src/core/memory/residency';
import { installResourceGuard, resources } from '../../src/core/memory/resources';
import { noteCreation, resetScopeCounts, runTracked, setStrict } from '../../src/core/memory/scope';
import { pickLod, screenSpaceError } from '../../src/core/memory/sse';
import { mipChainBytes, texelBytes } from '../../src/core/memory/estimate';
import { lensTargetMemory, phoneLensReport } from '../../src/photo/limits';

const MB = 1024 * 1024;

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const phone: BudgetDevice = {
  isIOS: false, isMobile: true, gpu: 'Adreno (TM) 730', cores: 8, memory: 4,
  webgpu: true, dpr: 2.625, screenMin: 412,
};
const desktop: BudgetDevice = {
  isIOS: false, isMobile: false, gpu: 'ANGLE (NVIDIA GeForce RTX 4070)', cores: 16, memory: 16,
  webgpu: true, dpr: 2, screenMin: 1080,
};
const ios: BudgetDevice = {
  isIOS: true, isMobile: true, gpu: 'Apple GPU', cores: 4, memory: undefined,
  webgpu: false, dpr: 3, screenMin: 390,
};

const android = detectBudget({ device: phone });
assert(android.deviceClass === 'android', 'pixel is android');
assert(android.totalBytes >= 600 * MB && android.totalBytes <= 900 * MB, `android total ${android.totalBytes} outside 600-900MB`);
assert(android.totalBytes === 750 * MB, '4GB android is 750MB');

const lowRam = detectBudget({ device: { ...phone, memory: 2 } });
assert(lowRam.totalBytes === 600 * MB, '2GB android is 600MB');
const highRam = detectBudget({ device: { ...phone, memory: 8 } });
assert(highRam.totalBytes === 900 * MB, '8GB android is 900MB');

const desk = detectBudget({ device: desktop });
assert(desk.deviceClass === 'desktop', 'discrete gpu is desktop');
assert(desk.totalBytes > 3000 * MB, 'desktop budget is much larger');
assert(desk.geometryBytes > android.geometryBytes * 3, 'desktop keeps more geometry');

const forced = detectBudget({ device: desktop, override: 'android' });
assert(forced.deviceClass === 'android', 'override android');
assert(forced.totalBytes <= 900 * MB, 'override uses the phone band');
const mbOverride = detectBudget({ device: phone, override: '720' });
assert(mbOverride.totalBytes === 720 * MB, 'numeric override is megabytes');

const apple = detectBudget({ device: ios });
assert(apple.deviceClass === 'ios', 'iphone class');
assert(apple.totalBytes >= 600 * MB && apple.totalBytes <= 1000 * MB, 'ios stays conservative');

const capped = detectBudget({ device: phone, limits: { maxTextureSize: 2048, maxSamples: 2, maxRenderbufferSize: 2048, maxBufferSize: 0 } });
assert(capped.textureBytes <= 32 * MB, 'tiny texture cap shrinks the texture budget');

const near = screenSpaceError(32, 80, Math.PI / 3, 915);
const far = screenSpaceError(32, 8000, Math.PI / 3, 915);
assert(near > far * 10, 'error falls with distance');

const street = pickLod({
  distance: 40, fovY: Math.PI / 3, viewport: 915, threshold: 3.5, current: -1, finest: 0,
});
assert(street === 0, `ultra street wants lod0, got ${street}`);

const horizon = pickLod({
  distance: 9000, fovY: Math.PI / 3, viewport: 915, threshold: 14, current: -1, finest: 0,
});
assert(horizon === 2, `low horizon stays lod2, got ${horizon}`);

const held = pickLod({
  distance: 500, fovY: Math.PI / 3, viewport: 844, threshold: 8, current: 1, finest: 0,
});
const flipped = pickLod({
  distance: 500, fovY: Math.PI / 3, viewport: 844, threshold: 8, current: held, finest: 0,
});
assert(flipped === held, 'hysteresis does not flip a settled lod on the next call');

const ultraWant = { far: 14000, near: 2400, lod0: 800 };
const ultraBytes = estimateStreamingBytes(ultraWant.far, ultraWant.near, ultraWant.lod0);
const fitted = fitRadii(ultraWant, android.geometryBytes, 420);
assert(fitted.lod0 >= 420, `ultra lod0 floor held, got ${fitted.lod0}`);
assert(fitted.far < ultraWant.far, 'phone ultra shrinks the horizon');
assert(estimateStreamingBytes(fitted.far, fitted.near, fitted.lod0) <= android.geometryBytes * 1.05
  || fitted.lod0 <= 420, 'fitted radii respect the geometry budget or the lod0 floor');
assert(ultraBytes > android.geometryBytes, 'unclamped ultra does not fit a phone');

const lowWant = { far: 4500, near: 900, lod0: 320 };
const lowFit = fitRadii(lowWant, android.geometryBytes, 200);
assert(lowFit.far === lowWant.far && lowFit.lod0 === lowWant.lod0, 'low already fits, radii stay');

let pressure = { ...PRESSURE_REST };
for (let i = 0; i < 4; i++) pressure = stepGovernor(pressure, 0.9, 1, 400);
assert(pressure.level === 1, `one step after sustained pressure, got ${pressure.level}`);
assert(pressure.mipBias === 0 && pressure.resolutionScale === 1, 'first step only drops far detail');
for (let i = 0; i < 4; i++) pressure = stepGovernor(pressure, 0.95, 1, 400);
assert(pressure.level === 2 && pressure.mipBias === 1, 'second step lowers mips');
assert(pressure.resolutionScale === 1, 'resolution waits until the last step');
for (let i = 0; i < 4; i++) pressure = stepGovernor(pressure, 0.99, 1, 400);
assert(pressure.level === 3 && pressure.resolutionScale < 1, 'third step scales render targets');
const spiked = stepGovernor(pressure, 0.4, 1, 200);
assert(spiked.level === 3, 'a short dip does not recover');
let cool = spiked;
for (let i = 0; i < 8; i++) cool = stepGovernor(cool, 0.4, 1, 400);
assert(cool.level === 2, `recovery is one level, got ${cool.level}`);

setStrict(true);
resetScopeCounts();
let threw = false;
try { noteCreation('geometry'); } catch { threw = true; }
assert(threw, 'strict guard throws outside the manager');
const inside = runTracked(() => {
  noteCreation('geometry');
  return true;
});
assert(inside, 'strict guard allows resources created in scope');
setStrict(false);

installResourceGuard({ strict: true });
let ctorThrew = false;
try { new BufferGeometry(); } catch { ctorThrew = true; }
assert(ctorThrew, 'strict mode rejects a bare BufferGeometry');
const geo = resources.geometry(() => {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  return g;
}, { label: 'unit', owner: 'test', evictable: true });
resources.retain(geo);
assert(resources.release(geo), 'a retained geometry stays after one release');
const mid = resources.sample().counts.geometry;
assert(resources.release(geo), 'the last release disposes');
assert(resources.sample().counts.geometry === mid - 1, 'disposed geometry leaves the live set');
const shared = resources.sharedGeometry('unit-shared', () => new BufferGeometry());
assert(resources.release(shared), 'releasing a shared geometry does not dispose it');
assert(resources.sample().shared >= 1, 'shared geometry stays resident');
setStrict(false);

const rgba = texelBytes(256, 256);
assert(rgba === 256 * 256 * 4, 'rgba8 byte count');
assert(mipChainBytes(rgba, 9) > rgba && mipChainBytes(rgba, 9) < rgba * 1.4, 'mip chain is about 4/3');

const phoneLens = phoneLensReport(android.targetBytes, 1);
for (const row of phoneLens) {
  assert(row.bytes <= android.targetBytes, `${row.tier} phone lens ${row.bytes} exceeds target ${android.targetBytes}`);
  assert(row.bytes < 80 * MB, `${row.tier} phone lens ${row.bytes} is still near the rejected ultra cap`);
  assert(row.viewW <= row.governorW + 1 && row.viewH <= row.governorH + 1, `${row.tier} lens is not larger than the governor buffer`);
}
const tightLens = phoneLensReport(lowRam.targetBytes, 1);
for (const row of tightLens) {
  assert(row.bytes <= lowRam.targetBytes, `${row.tier} 2GB phone lens ${row.bytes} exceeds ${lowRam.targetBytes}`);
}
const rawUltra = lensTargetMemory('ultra', 1280 * 3, 720 * 3);
assert(rawUltra.bytes > 150 * MB, 'the raw ultra pixel-ratio cap is the oversized figure');
const ultraPhone = phoneLens.find((row) => row.tier === 'ultra');
assert(ultraPhone && ultraPhone.bytes * 2 < rawUltra.bytes, 'phone ultra lens is well under the raw cap');
assert(ultraPhone && ultraPhone.governorW < 1280 * 3, 'phone ultra is not sized from the raw pixel-ratio cap');

console.log('memory logic ok');
console.log(JSON.stringify({
  androidMB: Math.round(android.totalBytes / MB),
  geometryMB: Math.round(android.geometryBytes / MB),
  desktopMB: Math.round(desk.totalBytes / MB),
  ultraFit: fitted,
  phoneLensMiB: phoneLens.map((row) => ({
    tier: row.tier,
    buffer: `${row.viewW}x${row.viewH}`,
    governor: `${row.governorW}x${row.governorH}`,
    budgetScale: Number(row.budgetScale.toFixed(3)),
    dofMiB: Number((row.dofBytes / MB).toFixed(2)),
    totalMiB: Number((row.bytes / MB).toFixed(2)),
  })),
}, null, 2));
