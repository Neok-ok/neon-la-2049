// Sky background + analytic exponential height fog. The fog integral along each view ray lets tall
// structures (Wallace pyramid, megatowers) rise out of a dense ground-level smog layer, as in the film.
import type { Scene } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from './uniforms';

const T = TSL as any;
const { Fn, float, vec3, exp, clamp, mix, max, pow, dot, normalize, smoothstep, positionWorld, positionWorldDirection, cameraPosition, length, abs, select, mx_noise_float, fog } = T;

/** Shared fog colour for a view direction: base fog + forward sun scatter + warm city under-glow. */
const fogColorFor = (dir: any) => {
  const sunScatter = pow(max(dot(dir, U.sunDir), 0.0), 6.0).mul(U.daylight).mul(0.35);
  const lowGlow = smoothstep(0.25, -0.05, dir.y).mul(U.night).mul(0.35);
  return (U.fogColor as any).add(U.sunColor.mul(sunScatter)).add(U.fogColor.mul(lowGlow)).add(vec3(U.lightning.mul(0.5)));
};

export function installSkyAndFog(scene: Scene): void {
  const s = scene as any;

  s.backgroundNode = Fn(() => {
    const dir = positionWorldDirection;
    const up = clamp(dir.y, -1, 1);
    const tHor = smoothstep(-0.05, 0.45, up);
    let col = mix(U.skyHorizon, U.skyZenith, tHor);
    // low cloud deck texture (slow drift)
    const n = mx_noise_float(vec3(dir.x.mul(3.0).add(U.time.mul(0.004)), dir.z.mul(3.0), up.mul(2.0))).mul(0.5).add(0.5);
    col = col.mul(n.mul(0.25).add(0.88));
    // sun/moon glow through smog
    const sd = max(dot(dir, U.sunDir), 0.0);
    col = col.add(U.sunColor.mul(pow(sd, 64.0).mul(0.6).add(pow(sd, 8.0).mul(0.12))).mul(U.daylight));
    // blend into the same colour the fog converges to so geometry melts into the horizon
    const fogC = fogColorFor(dir);
    col = mix(col, fogC, smoothstep(0.18, -0.02, up));
    return col.add(vec3(U.lightning.mul(0.35)));
  })();

  const factor = Fn(() => {
    const ro = cameraPosition;
    const d = positionWorld.sub(ro);
    const dist = length(d);
    const rdY = d.y.div(max(dist, 0.001));
    const b = U.fogFalloff;
    const tt = clamp(b.mul(rdY).mul(dist), -60.0, 60.0);
    const integ = select(abs(tt).greaterThan(0.0001), float(1.0).sub(exp(tt.negate())).div(b.mul(rdY)), dist);
    const amount = U.fogDensity.mul(exp(b.mul(ro.y).negate().max(-60.0))).mul(integ).add(U.haze.mul(dist));
    return clamp(float(1.0).sub(exp(amount.negate())), 0.0, 1.0);
  })();

  const color = Fn(() => fogColorFor(normalize(positionWorld.sub(cameraPosition))))();
  s.fogNode = fog(color, factor);
}
