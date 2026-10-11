// Practicals in the city and kit shaders, plus the four fog in-scatter slots.
// Eight uniforms, not a texture: a float index texture mis-reads on the WebGL2 fallback.
import { uniform } from 'three/tsl';
import { Color, Vector4 } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../atmosphere/uniforms';
import { SLOT_COUNT } from './cluster.ts';
import type { SlotLight } from './cluster.ts';
import { SODIUM_RGB } from './presets.ts';

const T = TSL as any;
const {
  float, vec2, vec3, length, max, clamp, pow, dot, normalize, smoothstep, mix, step, abs, log, floor, fract, sin, exp, cameraPosition,
} = T;

const pos = Array.from({ length: SLOT_COUNT }, () => uniform(new Vector4(0, 0, 0, 0)));
const col = Array.from({ length: SLOT_COUNT }, () => uniform(new Color(0, 0, 0)));
const meta = Array.from({ length: SLOT_COUNT }, () => uniform(new Vector4(0, -1, -1, 0)));
const dir = Array.from({ length: SLOT_COUNT }, () => uniform(new Vector4(0, -1, 0, 0)));

const hazeP = [0, 1, 2, 3].map(() => uniform(new Vector4(0, 0, 0, 0)));
const hazeC = [0, 1, 2, 3].map(() => uniform(new Color(0, 0, 0)));
const hazeI = [0, 1, 2, 3].map(() => uniform(0));

/** 1/exposure. Glare billboards (beacons, flares) stay readable when the iris stops down for the sun. */
export const authoredLiftU = uniform(1);
/** Low tier only: a flat sodium luminance on upward surfaces, in nits. */
export const bakedNits = uniform(0);
export const contactAmt = uniform(1);
export const probeColor = uniform(new Color(1, 0.55, 0.28));
export const probeStrength = uniform(0);

const NEAR = 1.6;
const FAR = 56;

function attenuation(dist: any, range: any): any {
  const d = max(dist, 0.08);
  const r = max(range, 0.2);
  const x = clamp(float(1).sub(pow(d.div(r), float(4))), 0, 1);
  return x.mul(x).div(d.mul(d));
}

function oneLight(i: number, world: any, N: any, V: any, albedo: any): any {
  const P = pos[i]!.xyz;
  const range = pos[i]!.w;
  const cd = meta[i]!.x;
  const live = step(float(0.5), cd);
  const delta = P.sub(world);
  const dist = max(length(delta), 0.08);
  const L = delta.div(dist);
  const att = attenuation(dist, range);
  const toSurf = L.mul(-1);
  const cosO = meta[i]!.y;
  const cosI = meta[i]!.z;
  const spot = smoothstep(cosO, max(cosI, cosO.add(0.02)), dot(dir[i]!.xyz, toSurf));
  const point = step(cosO, float(-0.2));
  const mask = mix(spot, float(1), point);
  const E = cd.mul(att).mul(mask).mul(live);
  const ndl = max(dot(N, L), 0);
  const horiz = length(vec2(delta.x, delta.z));
  const up = clamp(N.y, 0, 1);
  // A small disc under the pole. The old 2.5 m radius ate the pool the lantern was supposed to make.
  const disc = smoothstep(float(1.15), float(0.25), horiz).mul(up).mul(meta[i]!.w).mul(contactAmt);
  const shade = float(1).sub(disc.mul(0.55));
  const diffuse = albedo.mul(E).mul(ndl).mul(shade).div(Math.PI);
  const H = normalize(L.add(V));
  const wet = U.wetness;
  // A wide lobe dyed the foreground orange. The pool is the diffuse term.
  // The highlight stays a short streak toward the lamp.
  const wetGloss = mix(float(140), float(110), up);
  const gloss = mix(float(48), wetGloss, wet);
  const specW = mix(float(0.012), mix(float(0.014), float(0.012), up), wet);
  const spec = pow(max(dot(N, H), 0), gloss).mul(E).mul(specW);
  return col[i]!.mul(diffuse.add(spec));
}

/**
 * Reflected radiance in nits from the clustered practicals, plus the low-tier bake
 * and a wet probe sheen. `albedo` is the surface's linear base colour.
 */
export function practicalLit(world: any, normal: any, viewDir: any, albedo: any): any {
  const dist = length(world.sub(cameraPosition));
  const u = clamp(log(max(dist, NEAR)).sub(Math.log(NEAR)).div(Math.log(FAR / NEAR)), 0, 0.999);
  const slice = floor(u.mul(2));
  let acc = vec3(0, 0, 0);
  for (let s = 0; s < 2; s++) {
    const match = step(abs(slice.sub(float(s))), float(0.5));
    for (let k = 0; k < 4; k++) acc = acc.add(oneLight(s * 4 + k, world, normal, viewDir, albedo).mul(match));
  }
  const up = clamp(normal.y, 0, 1);
  // Low tier has no clustered loop. A flat sodium field read as an orange carpet, so most of the
  // ground stays dim and a few 34 m cells carry a pool. High tiers set bakedNits to 0.
  const cell = floor(world.xz.div(34.0));
  const jitter = fract(sin(dot(cell, vec2(12.9898, 78.233))).mul(43758.5453));
  const local = world.xz.div(34.0).sub(cell).sub(0.5);
  const pool = exp(dot(local, local).mul(-9.0)).mul(smoothstep(0.58, 0.74, jitter));
  const bake = vec3(SODIUM_RGB[0], SODIUM_RGB[1], SODIUM_RGB[2]).mul(up).mul(bakedNits).mul(float(0.28).add(pool.mul(2.6)));
  const fres = pow(float(1).sub(clamp(dot(normal, viewDir), 0, 1)), float(5.5));
  const sheen = probeColor.mul(probeStrength).mul(fres).mul(up).mul(U.wetness);
  return acc.add(bake).add(sheen);
}

/** In-scattered nits from the four haze slots. Henyey–Greenstein, g = 0.42, one sample at the surface. */
export function practicalInscatter(world: any): any {
  const V = normalize(cameraPosition.sub(world));
  const g = 0.42;
  const norm = float((1 - g * g) / (4 * Math.PI));
  let acc = vec3(0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const P = hazeP[i]!.xyz;
    const range = hazeP[i]!.w;
    const delta = P.sub(world);
    const dist = max(length(delta), 0.2);
    const L = delta.div(dist);
    const cos = clamp(dot(V, L), -1, 1);
    const denom = float(1 + g * g).sub(cos.mul(2 * g));
    const phase = norm.div(pow(max(denom, 0.05), float(1.5)));
    const live = step(float(1), hazeI[i]);
    acc = acc.add(hazeC[i]!.mul(hazeI[i]).mul(attenuation(dist, range)).mul(phase).mul(live));
  }
  return acc.mul(U.fogDensity).mul(55);
}

export function writeShadeSlots(slots: SlotLight[]): void {
  for (let i = 0; i < SLOT_COUNT; i++) {
    const s = slots[i];
    const p = pos[i]!;
    const m = meta[i]!;
    if (!s || s.candela <= 0) {
      p.value.w = 0;
      m.value.x = 0;
      continue;
    }
    p.value.set(s.x, s.y, s.z, s.range);
    col[i]!.value.setRGB(s.r, s.g, s.b);
    m.value.set(s.candela, s.cosOuter, s.cosInner, s.contact);
    dir[i]!.value.set(s.dx, s.dy, s.dz, 0);
  }
}

export function writeHazeSlots(slots: SlotLight[]): void {
  for (let i = 0; i < 4; i++) {
    const s = slots[i];
    const p = hazeP[i]!;
    if (!s || s.candela <= 0) {
      p.value.w = 0;
      hazeI[i]!.value = 0;
      continue;
    }
    p.value.set(s.x, s.y, s.z, s.range);
    hazeC[i]!.value.setRGB(s.r, s.g, s.b);
    hazeI[i]!.value = s.candela;
  }
}

export function clearShade(): void {
  for (let i = 0; i < SLOT_COUNT; i++) {
    pos[i]!.value.w = 0;
    meta[i]!.value.x = 0;
  }
  for (let i = 0; i < 4; i++) {
    hazeP[i]!.value.w = 0;
    hazeI[i]!.value = 0;
  }
}
