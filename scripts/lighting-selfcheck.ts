// Physical-lighting invariants. Run with: node --experimental-strip-types scripts/lighting-selfcheck.ts
// This file stays out of the Vite graph. It does not import three.js or the TSL shaders.
import { areaAttenuation, acesFitted, ev100, exposureFromCamera, exposureFromEv, frostbiteAttenuation, hueDegrees, kelvinToLinear, neutralTonemap, reflectedNits, sodiumLineLinear, srgbByteRoundTrip } from '../src/lighting/units.ts';
import { DAY_EV, NIGHT_CAMERA, NIGHT_EV, stepExposure, sunLux } from '../src/lighting/exposure.ts';
import { PRESETS } from '../src/lighting/presets.ts';
import { LightingError, assertKelvin, checkPunctual } from '../src/lighting/validate.ts';
import { allLights, resetRegistry, retainChunk } from '../src/lighting/registry.ts';
import { clusterAssign, sliceOf } from '../src/lighting/cluster.ts';
import { bakeInteriorVertex } from '../src/lighting/interiorBake.ts';
import {
  lightingMemory, lightingResolutionScale, setLightingResolutionScale, shadowEdge, watchLightingResolutionScale,
} from '../src/lighting/memory.ts';

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const nightEv = ev100(NIGHT_CAMERA.aperture, NIGHT_CAMERA.shutter, NIGHT_CAMERA.iso);
assert(Math.abs(nightEv - NIGHT_EV) < 1e-9, 'night EV drifted from the camera');
assert(Math.abs(nightEv - 4.263) < 0.01, `night EV ${nightEv} is not f/2, 1/48, ISO 1000`);
const nightExp = exposureFromEv(nightEv);
assert(Math.abs(nightExp - exposureFromCamera(2, 1 / 48, 1000)) < 1e-12, 'exposure helpers disagree');
assert(nightExp > 0.04 && nightExp < 0.05, `night exposure ${nightExp} left the Filament 1.2·2^EV band`);
assert(DAY_EV > NIGHT_EV + 6, 'day camera is not stopped down from the night push');

for (const byte of [0, 16, 128, 255]) {
  assert(srgbByteRoundTrip(byte) === 0, `sRGB byte ${byte} did not round-trip`);
}

const near = frostbiteAttenuation(1, 28);
const far = frostbiteAttenuation(20, 28);
const edge = frostbiteAttenuation(28, 28);
assert(near > far && far > edge && edge === 0, 'windowed inverse-square did not reach zero at the range');
assert(Number.isFinite(frostbiteAttenuation(0, 28)), 'a point at the source went non-finite');
assert(Number.isFinite(areaAttenuation(0, 8, 0.42)) && areaAttenuation(0, 8, 0.42) < 20, 'tube singularity');

const sodium = kelvinToLinear(2000);
const led = kelvinToLinear(4000);
const sky = kelvinToLinear(6500);
const warmth = (rgb: [number, number, number]) => rgb[0] / Math.max(rgb[2], 1e-4);
assert(warmth(sodium) > warmth(led) && warmth(led) > warmth(sky), 'kelvin did not cool from 2000 K to 6500 K');
const line = sodiumLineLinear();
assert(line[0] > line[1] && line[1] > line[2] && line[2] < 0.05, '589 nm sodium is not the orange locus');

for (const band of Object.values(PRESETS)) {
  assert(band.candela >= band.cdMin && band.candela <= band.cdMax, `${band.id} default candela is outside its band`);
  assert(band.nits >= 0 && band.nits <= 20000, `${band.id} nits`);
  if (band.kelvin != null) assertKelvin(band.kelvin, band.id);
}

const lamp = checkPunctual({ preset: 'street-sodium', x: 1, y: 8, z: -2 });
assert(lamp.candela === PRESETS['street-sodium'].candela, 'street default candela');
assert(lamp.dy < -0.9 && lamp.cosOuter > 0, 'street lamp is not a downward cone');

let threw = false;
try {
  checkPunctual({ preset: 'neon-sign', x: 0, y: 0, z: 0, candela: 1e9 });
} catch (err) {
  threw = err instanceof LightingError;
}
assert(threw, 'a 1e9 cd sign must throw LightingError');

threw = false;
try {
  checkPunctual({ preset: 'window-warm', x: Number.NaN, y: 0, z: 0 });
} catch (err) {
  threw = err instanceof LightingError;
}
assert(threw, 'a non-finite position must throw');

resetRegistry();
const release = retainChunk('0:0', [{ preset: 'street-led', x: 10, y: 7, z: 4 }]);
assert(allLights().length === 1, 'retain');
const release2 = retainChunk('0:0', [{ preset: 'street-sodium', x: 12, y: 7, z: 4 }]);
release();
assert(allLights().length === 1 && allLights()[0]?.preset === 'street-sodium', 'stale release dropped the live chunk');
release2();
assert(allLights().length === 0, 'release');

const slots = clusterAssign(0, 2, 0, [
  { ...lamp, id: 1, x: 3, y: 8, z: 0 },
  { ...lamp, id: 2, x: 40, y: 8, z: 0, candela: 20000 },
], 4, 56);
assert(slots.length === 8, 'two slices × four slots');
assert(slots.some((s) => s.candela > 0), 'cluster kept a lamp');
assert(sliceOf(2) === 0 && sliceOf(40) === 1, 'log depth slices');

const sign = checkPunctual({ preset: 'neon-sign', x: 2, y: 2, z: 0, candela: 6000 });
const held = clusterAssign(0, 2, 0, [
  { ...lamp, id: 3, x: 4, y: 7, z: 0, candela: 5000 },
  { ...sign, id: 4 },
  { ...sign, id: 5, x: 3, y: 3, z: 1, candela: 7000 },
  { ...sign, id: 6, x: 4, y: 2, z: -1, candela: 7000 },
  { ...sign, id: 7, x: 5, y: 2, z: 2, candela: 7000 },
], 4, 56);
assert(held.slice(0, 4).some((s) => s.contact === 1), 'a street lamp keeps a near slot when signs are brighter');

const neon: [number, number, number] = [8, 0.4, 3];
const aces = acesFitted(neon);
const neutral = neutralTonemap(neon);
assert(Math.abs(hueDegrees(aces) - hueDegrees(neon)) > Math.abs(hueDegrees(neutral) - hueDegrees(neon)), 'Neutral should hold neon hue closer than fitted ACES');

const asphalt = reflectedNits(90, 0.05);
assert(asphalt > 0.5 && asphalt < 3, `90 lux on dark asphalt should be about 1–2 cd/m², got ${asphalt}`);

const baked = bakeInteriorVertex(0, -1, 0, 0, 2, 0, [{ x: 0, y: 4, z: 0, color: [1, 0.8, 0.5], intensity: 3.4, range: 8 }], [0.02, 0.02, 0.025]);
assert(baked.every(Number.isFinite) && Math.max(...baked) <= 6.5 + 0.05, 'interior bake cap');

stepExposure(0, -0.2, 0, 0);
assert(Math.abs(stepExposure(0, -0.2, 0, 0) - nightExp) < 1e-6, 'frozen night did not snap to the night exposure');
assert(sunLux(0, 0) === 0, 'night sun lux');

const desk = { w: 1920, h: 1080 };
const high = lightingMemory('high', desk.w, desk.h, 1, false);
assert(high.renderTargets === 12 && high.bloomTargets === 11 && high.sceneTargets === 1, 'high bloom chain target count');
assert(high.shadowMaps === 0 && high.probes === 1, 'high has a probe and no sun shadow');
assert(high.sceneColorBytes === 1920 * 1080 * 8, 'scene color is half-float RGBA');
assert(high.sceneDepthBytes === 1920 * 1080 * 4, 'scene depth is 4 bytes');
assert(high.bytes === 40_077_120, `high 1080p net bytes ${high.bytes}`);
assert(high.probeBytes === 256 * 128 * 4 && high.bytes === high.sceneColorBytes + high.sceneDepthBytes + high.bloomBytes, 'probe replaces the atmosphere map');
const low = lightingMemory('low', desk.w, desk.h, 1, true);
const medium = lightingMemory('medium', desk.w, desk.h, 1, true);
assert(low.bytes === 0 && low.renderTargets === 0 && low.shadowMaps === 0 && low.probes === 0, 'low adds no lighting targets');
assert(medium.bytes === 0 && medium.shadowMaps === 0 && medium.probes === 0, 'medium adds no lighting targets');
const ultraNight = lightingMemory('ultra', desk.w, desk.h, 1, false);
const ultraDay = lightingMemory('ultra', desk.w, desk.h, 1, true);
assert(ultraNight.shadowMaps === 0 && ultraNight.bytes === high.bytes, 'night ultra does not allocate a shadow map');
assert(ultraDay.shadowMaps === 1 && ultraDay.shadowBytes === 1024 * 1024 * 8, 'one daylight sun shadow');
assert(ultraDay.bytes === high.bytes + ultraDay.shadowBytes, 'ultra day is high plus that one map');
const half = lightingMemory('high', desk.w, desk.h, 0.5, false);
assert(half.bytes < high.bytes / 3, 'half resolution scale cuts the bloom targets by more than 3×');
assert(shadowEdge(1) === 1024 && shadowEdge(0.5) === 512 && shadowEdge(0.25) === 256, 'sun shadow edge tracks the scale');
let seen = 0;
const stop = watchLightingResolutionScale((s) => { seen = s; });
setLightingResolutionScale(0.5);
assert(lightingResolutionScale() === 0.5 && seen === 0.5, 'governor scale notifies');
setLightingResolutionScale(Number.NaN);
assert(lightingResolutionScale() === 0.5, 'non-finite scale is ignored');
setLightingResolutionScale(0.01);
assert(lightingResolutionScale() === 0.25, 'scale floors at 0.25');
setLightingResolutionScale(4);
assert(lightingResolutionScale() === 1 && seen === 1, 'scale caps at 1');
stop();
setLightingResolutionScale(1);

const phone = (tier: 'low' | 'medium' | 'high' | 'ultra', ratio: number, day: boolean) =>
  lightingMemory(tier, Math.round(390 * ratio), Math.round(844 * ratio), 1, day);
console.log(`lighting memory 1080p scale1 high=${high.bytes} ultraDay=${ultraDay.bytes} half=${half.bytes}`);
console.log(`lighting memory phone low=${phone('low', 1, false).bytes} med=${phone('medium', 1.5, false).bytes} high=${phone('high', 2, false).bytes} ultraNight=${phone('ultra', 3, false).bytes} ultraDay=${phone('ultra', 3, true).bytes}`);

console.log('lighting selfcheck ok');
