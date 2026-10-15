// Auto tier. Run with: node --experimental-strip-types scripts/quality-selfcheck.ts
import { autoTier, type DeviceInfo, type Tier } from '../src/core/quality.ts';

function dev(over: Partial<DeviceInfo> & { gpu: string }): DeviceInfo {
  return {
    isIOS: false,
    isMobile: false,
    cores: 8,
    memory: 8,
    webgpu: true,
    dpr: 1.5,
    screenMin: 900,
    ...over,
  };
}

function expectTier(label: string, gpu: string, want: Tier, extra: Partial<DeviceInfo> = {}): void {
  const got = autoTier(dev({ gpu, ...extra }));
  if (got.tier !== want) throw new Error(`${label}: got ${got.tier} (${got.reason}), want ${want}`);
  if (got.tier === 'ultra') throw new Error(`${label}: auto returned ultra`);
}

expectTier('swiftshader', 'Google SwiftShader', 'low');
expectTier('llvmpipe', 'llvmpipe', 'low');
expectTier('780M', 'ANGLE (AMD, AMD Radeon 780M Graphics (0x000015BF) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium');
expectTier('radeon graphics', 'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium');
expectTier('vega', 'AMD Radeon Vega 8 Graphics', 'medium');
expectTier('rx 7900', 'ANGLE (AMD, AMD Radeon RX 7900 XTX Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high');
expectTier('rx 7600m', 'AMD Radeon RX 7600M', 'high');
expectTier('rtx 4060 laptop', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028A0) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high');
expectTier('intel uhd', 'Intel(R) UHD Graphics', 'medium');
expectTier('intel arc', 'Intel(R) Arc(TM) A770 Graphics', 'medium');
expectTier('apple m3', 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)', 'high');
expectTier('iphone 13', 'Apple GPU', 'medium', { isIOS: true, isMobile: true, webgpu: false, cores: 4, dpr: 3, screenMin: 390 });
expectTier('iphone se', 'Apple GPU', 'low', { isIOS: true, isMobile: true, webgpu: false, cores: 4, dpr: 2, screenMin: 375 });

const samples = [
  'AMD Radeon 780M',
  'NVIDIA GeForce RTX 4060 Laptop GPU',
  'Google SwiftShader',
  'Apple M3',
  'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
];
for (const gpu of samples) {
  const tier = autoTier(dev({ gpu })).tier;
  if (tier === 'ultra') throw new Error(`auto ultra for ${gpu}`);
}

console.log('quality selfcheck ok');
