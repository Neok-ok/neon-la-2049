// Sky background + analytic exponential height fog. The fog integral along each view ray lets tall
// structures (Wallace pyramid, megatowers) rise out of a dense ground-level smog layer, as in the film.
import type { Scene } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from './uniforms';

const T = TSL as any;
const { Fn, float, vec3, vec2, exp, clamp, mix, max, pow, dot, normalize, smoothstep, positionWorld, positionWorldDirection, cameraPosition, length, abs, select, fract, sin, mx_noise_float, fog } = T;

/** Shared fog colour for a view direction: base fog + forward sun scatter + warm city under-glow. */
const fogColorFor = (dir: any) => {
  const sunScatter = pow(max(dot(dir, U.sunDir), 0.0), 6.0).mul(U.daylight).mul(0.35);
  const lowGlow = smoothstep(-0.05, 0.25, dir.y).oneMinus().mul(U.night).mul(0.35);
  return (U.fogColor as any).add(U.sunColor.mul(sunScatter)).add(U.fogColor.mul(lowGlow)).add(vec3(U.lightning.mul(0.5)));
};

/** erf(x), Winitzki's approximation (max error ~1e-4). */
const erf = (x: any) => {
  const x2 = x.mul(x);
  const a = 0.147;
  const k = x2.mul(a).add(4 / Math.PI).div(x2.mul(a).add(1.0));
  return T.sign(x).mul(T.sqrt(float(1.0).sub(exp(x2.mul(k).negate()))));
};

/** Mean of a unit gaussian along the ray from y0 to y1. Horizontal rays use the midpoint. */
const gaussSlab = (y0: any, y1: any, center: any, width: any) => {
  const w = max(width, 1.0);
  const u0 = y0.sub(center).div(w);
  const u1 = y1.sub(center).div(w);
  const du = u1.sub(u0);
  const um = u0.add(u1).mul(0.5);
  return select(abs(du).greaterThan(0.02), erf(u1).sub(erf(u0)).div(du).mul(Math.sqrt(Math.PI) / 2), exp(um.mul(um).negate()));
};

/**
 * Fog optical depth from `ro` to `p` (call inside a TSL Fn): exponential height fog, a gaussian smog
 * inversion layer (the flat brown sea the megatowers and the pyramid rise out of), a thin street
 * band, a high deck over the tallest tops, and uniform haze. The street band and the deck are
 * analytic terms on the same integral. Their densities are 0 on the low tier. Lights and holograms
 * use a fraction of it so they read through the smog like the film's beacons.
 */
export const fogDepth = (ro: any, p: any) => {
  const d = p.sub(ro);
  const dist = length(d);
  const rdY = d.y.div(max(dist, 0.001));
  const b = U.fogFalloff;
  const tt = clamp(b.mul(rdY).mul(dist), -60.0, 60.0);
  const integ = select(abs(tt).greaterThan(0.0001), float(1.0).sub(exp(tt.negate())).div(b.mul(rdY)), dist);
  const ground = U.fogDensity.mul(exp(b.mul(ro.y).negate().max(-60.0))).mul(integ);
  // ∫ exp(-((y(t) - Y) / W)²) dt along the ray, analytic via erf; near-horizontal rays use the midpoint.
  const layer = U.layerDensity.mul(dist).mul(gaussSlab(ro.y, p.y, U.layerY, U.layerW));
  const band = U.groundBand.mul(dist).mul(gaussSlab(ro.y, p.y, U.groundY, U.groundW));
  const deck = U.deckDensity.mul(dist).mul(gaussSlab(ro.y, p.y, U.deckY, U.deckW));
  return ground.add(layer).add(band).add(deck).add(U.haze.mul(dist));
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
    // High deck: looking up leaves the black zenith and picks up the murk the tower tops melt into.
    col = mix(col, U.deckColor, smoothstep(0.08, 0.55, up).mul(U.deckTint));
    // blend into the same colour the fog converges to so geometry melts into the horizon
    const fogC = fogColorFor(dir);
    col = mix(col, fogC, smoothstep(-0.02, 0.18, up).oneMinus());
    return col.add(vec3(U.lightning.mul(0.35)));
  })();

  const factor = Fn(() => {
    const amount = fogDepth(cameraPosition, positionWorld);
    // ±1/255 so a photo-mode gradient does not band in an 8-bit file.
    const n = fract(sin(dot(positionWorld.xz, vec2(12.9898, 78.233))).mul(43758.5453));
    const dither = n.sub(0.5).mul(0.008);
    return clamp(float(1.0).sub(exp(amount.negate())).add(dither), 0.0, 1.0);
  })();

  const color = Fn(() => {
    const dir = normalize(positionWorld.sub(cameraPosition));
    let col = fogColorFor(dir);
    const y = positionWorld.y;
    // edge0 must stay below edge1. GLSL smoothstep is undefined the other way.
    const low = float(1.0).sub(smoothstep(U.groundY, U.groundY.add(U.groundW.mul(1.6)), y));
    const tinted = col.mul(U.airTint);
    col = mix(col, tinted, low.mul(U.airTintMix));
    const high = smoothstep(U.deckY.sub(U.deckW), U.deckY.add(U.deckW.mul(0.15)), y);
    col = mix(col, U.deckColor, high.mul(U.deckTint));
    return col;
  })();
  s.fogNode = fog(color, factor);
}
