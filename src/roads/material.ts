// Wet asphalt, sidewalk and paint. The low tier is flat colour and does not touch the atlases.
// Water darkens a porous surface and lowers roughness. Standing water flattens the normal.
// Ripples stay inside that puddle mask, and only while the fancy uniform is on.
import { DoubleSide, FrontSide, MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { uniform } from 'three/tsl';
import * as TSL from 'three/tsl';
import type { Tier } from '../core/quality';
import { U } from '../atmosphere/uniforms';
import { roadMaps, roadTextureMode } from './textures';

const T = TSL as any;
const {
  Fn, attribute, float, vec2, vec3, vec4, fract, mix, smoothstep, step, sin, pow, max, clamp,
  normalize, dot, abs, positionWorld, cameraPosition, normalWorld, uv, mx_noise_float,
} = T;

/** 1 on High and Ultra: a second trim sample, the normal map, and rain ripples. */
export const roadFancy = uniform(0);

let flatMat: MeshStandardNodeMaterial | null = null;
let richMat: MeshStandardNodeMaterial | null = null;
let markMat: MeshBasicNodeMaterial | null = null;
let signMat: MeshBasicNodeMaterial | null = null;
let puddleMat: MeshStandardNodeMaterial | null = null;

function bias(mat: MeshStandardNodeMaterial | MeshBasicNodeMaterial, factor: number): void {
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = factor;
  mat.polygonOffsetUnits = factor;
}

function kindAttr(): unknown {
  return attribute('kind', 'float');
}

function flatSolid(): MeshStandardNodeMaterial {
  if (flatMat) return flatMat;
  const m = new MeshStandardNodeMaterial();
  m.name = 'road-flat';
  m.side = FrontSide;
  bias(m, -1);
  const k = kindAttr();
  m.colorNode = Fn(() => {
    const asphalt = vec3(0.045, 0.044, 0.048);
    const walk = vec3(0.2, 0.19, 0.175);
    const concrete = vec3(0.28, 0.27, 0.25);
    const head = vec3(0.16, 0.09, 0.04);
    const pole = vec3(0.07, 0.07, 0.075);
    const surfaced = mix(asphalt, mix(walk, concrete, step(1.5, k)), step(0.5, k));
    return mix(surfaced, mix(head, pole, step(3.5, k)), step(2.5, k));
  })();
  m.roughnessNode = mix(float(0.9), float(0.45), step(2.5, kindAttr()));
  m.metalnessNode = mix(float(0.02), float(0.7), step(3.5, kindAttr()));
  const headOn = step(2.5, kindAttr()).mul(step(kindAttr(), 3.5));
  m.emissiveNode = vec3(1.0, 0.62, 0.28).mul(float(0.6).add(U.night.mul(5.0))).mul(headOn);
  flatMat = m;
  return m;
}

function richSolid(): MeshStandardNodeMaterial {
  if (richMat) return richMat;
  const maps = roadMaps();
  const m = new MeshStandardNodeMaterial();
  m.name = 'road-surface';
  m.side = FrontSide;
  bias(m, -1);
  const tile = float(6);

  const puddleAmt = () => {
    const wpos = positionWorld;
    const wet = U.wetness.mul(step(kindAttr(), 0.5));
    const n = mx_noise_float(vec3(wpos.x.mul(0.07), wpos.z.mul(0.07), float(9)));
    return smoothstep(0.2, 0.55, n).mul(wet);
  };

  m.colorNode = Fn(() => {
    const k = kindAttr();
    const wpos = positionWorld;
    const wu = wpos.x.div(tile);
    const wv = wpos.z.div(tile);
    const isWalk = step(0.5, k).mul(step(k, 1.5));
    const isConcrete = step(1.5, k).mul(step(k, 2.5));
    const asphalt = T.texture(maps.trim, vec2(fract(wu).mul(0.48).add(0.01), fract(wv).mul(0.48).add(0.51)));
    const walk = T.texture(maps.trim, vec2(fract(wu).mul(0.48).add(0.51), fract(wv).mul(0.48).add(0.51)));
    const concrete = T.texture(maps.trim, vec2(fract(wu.mul(0.65)).mul(0.48).add(0.01), fract(wv.mul(0.65)).mul(0.48).add(0.01)));
    const patch = T.texture(maps.trim, vec2(
      fract(wu.add(2.7)).mul(0.48).add(0.51),
      fract(wv.add(1.9)).mul(0.48).add(0.01),
    ));
    const wobble = smoothstep(-0.15, 0.55, mx_noise_float(vec3(wpos.x.mul(0.13), wpos.z.mul(0.13), float(2))));
    const asphaltMix = mix(asphalt.rgb, patch.rgb, wobble.mul(roadFancy));
    const surfaced = mix(asphaltMix, mix(walk.rgb, concrete.rgb, isConcrete), isWalk.add(isConcrete).min(1));
    const head = vec3(0.16, 0.09, 0.04);
    const pole = vec3(0.07, 0.07, 0.075);
    let base = mix(surfaced, mix(head, pole, step(3.5, k)), step(2.5, k));
    const wet = U.wetness.mul(step(k, 2.5));
    base = base.mul(mix(float(1), float(0.58), wet.mul(0.85).add(puddleAmt().mul(0.35))));
    const snow = U.snow.mul(smoothstep(0.55, 0.92, normalWorld.y));
    return mix(base, vec3(0.74, 0.76, 0.8), clamp(snow, 0, 0.9));
  })();

  m.roughnessNode = Fn(() => {
    const wet = U.wetness.mul(step(kindAttr(), 2.5));
    return mix(mix(float(0.86), float(0.34), wet), float(0.05), puddleAmt());
  })();
  m.metalnessNode = mix(float(0.02), float(0.72), step(3.5, kindAttr()));

  m.normalNode = Fn(() => {
    const wpos = positionWorld;
    const s = T.texture(maps.normal, vec2(
      fract(wpos.x.div(tile)).mul(0.48).add(0.01),
      fract(wpos.z.div(tile)).mul(0.48).add(0.51),
    ));
    const ts = s.rgb.mul(2).sub(1);
    const puddle = puddleAmt();
    const rip = sin(wpos.x.mul(1.8).add(U.time.mul(2.4))).mul(sin(wpos.z.mul(1.35).sub(U.time.mul(1.7))));
    const amp = roadFancy.mul(mix(float(0.45), float(0.08), puddle));
    const nx = ts.x.mul(amp).add(rip.mul(puddle).mul(U.rain).mul(roadFancy).mul(0.35));
    const nz = ts.y.mul(amp).add(rip.mul(0.65).mul(puddle).mul(U.rain).mul(roadFancy).mul(0.35));
    const n = normalize(vec3(normalWorld.x.add(nx), normalWorld.y, normalWorld.z.add(nz)));
    return normalize(T.transformNormalToView(n));
  })();

  m.emissiveNode = Fn(() => {
    const k = kindAttr();
    const wpos = positionWorld;
    const head = step(2.5, k).mul(step(k, 3.5));
    const lamp = vec3(1.0, 0.62, 0.28).mul(float(0.6).add(U.night.mul(5.0))).mul(head);
    const view = normalize(cameraPosition.sub(wpos));
    const ndv = max(dot(normalize(vec3(0, 1, 0)), view), float(0));
    const fres = pow(float(1).sub(ndv), float(3));
    const sodium = smoothstep(0.15, 0.85, U.sheen);
    const neon = mix(vec3(0.9, 0.1, 0.42), vec3(1.0, 0.5, 0.16), sodium);
    const wet = U.wetness.mul(step(k, 0.5));
    const altFade = smoothstep(80, 18, U.camAlt);
    const glow = neon.mul(fres).mul(puddleAmt().mul(0.85).add(wet.mul(0.22))).mul(U.night).mul(U.neonWet)
      .mul(U.signPower).mul(mix(float(1), float(0.28), U.reflMix)).mul(altFade).mul(step(k, 0.5));
    return lamp.add(glow);
  })();
  richMat = m;
  return m;
}

function atlasUv(cols: number, rows: number): { u: unknown; v: unknown } {
  const cell = attribute('iCell', 'float');
  const col = cell.mod(cols);
  const row = T.floor(cell.div(cols));
  const puv = uv();
  return {
    u: col.add(puv.x).div(cols),
    v: float(rows - 1).sub(row).add(puv.y).div(rows),
  };
}

function markingMaterial(): MeshBasicNodeMaterial {
  if (markMat) return markMat;
  const maps = roadMaps();
  const m = new MeshBasicNodeMaterial();
  m.name = 'road-mark';
  m.side = DoubleSide;
  m.transparent = true;
  m.alphaTest = 0.2;
  m.depthWrite = true;
  bias(m, -3);
  const at = atlasUv(4, 4);
  m.colorNode = Fn(() => {
    const s = T.texture(maps.mark, vec2(at.u, at.v));
    return vec4(s.rgb.mul(mix(float(0.7), float(1.15), U.night)), s.a);
  })();
  markMat = m;
  return m;
}

function signMaterial(): MeshBasicNodeMaterial {
  if (signMat) return signMat;
  const maps = roadMaps();
  const m = new MeshBasicNodeMaterial();
  m.name = 'road-sign';
  m.side = DoubleSide;
  m.transparent = true;
  m.alphaTest = 0.15;
  m.depthWrite = true;
  bias(m, -2);
  const at = atlasUv(4, 2);
  m.colorNode = Fn(() => {
    const s = T.texture(maps.sign, vec2(at.u, at.v));
    return vec4(s.rgb.mul(mix(float(0.45), float(1.35), U.night)).mul(U.signPower), s.a);
  })();
  signMat = m;
  return m;
}

export function roadPuddleMaterial(): MeshStandardNodeMaterial {
  if (puddleMat) return puddleMat;
  const m = new MeshStandardNodeMaterial();
  m.name = 'road-puddle';
  m.side = DoubleSide;
  m.transparent = true;
  m.depthWrite = false;
  bias(m, -2);
  m.roughnessNode = float(0.04);
  m.metalnessNode = float(0);
  m.colorNode = Fn(() => {
    const a = smoothstep(0.5, 0.12, T.max(abs(uv().x.sub(0.5)), abs(uv().y.sub(0.5))).mul(1.4)).mul(U.wetness);
    return vec4(vec3(0.015, 0.016, 0.02), a);
  })();
  m.emissiveNode = Fn(() => {
    const wpos = positionWorld;
    const view = normalize(cameraPosition.sub(wpos));
    const ndv = max(dot(normalize(vec3(0, 1, 0)), view), float(0));
    const fres = pow(float(1).sub(ndv), float(3));
    const sodium = smoothstep(0.15, 0.85, U.sheen);
    const neon = mix(vec3(0.85, 0.12, 0.4), vec3(1.0, 0.52, 0.16), sodium);
    const a = smoothstep(0.5, 0.12, T.max(abs(uv().x.sub(0.5)), abs(uv().y.sub(0.5))).mul(1.4)).mul(U.wetness);
    return neon.mul(fres).mul(a).mul(U.night).mul(U.neonWet).mul(U.signPower).mul(mix(float(1), float(0.3), U.reflMix));
  })();
  puddleMat = m;
  return m;
}

export function roadSurfaceMaterial(tier: Tier): MeshStandardNodeMaterial {
  roadFancy.value = tier === 'high' || tier === 'ultra' ? 1 : 0;
  const ready = roadTextureMode() === 'data' || roadTextureMode() === 'ktx2';
  if (tier === 'low' || !ready) return flatSolid();
  return richSolid();
}

export function roadMarkMaterial(tier: Tier): MeshBasicNodeMaterial | null {
  if (tier === 'low') return null;
  if (roadTextureMode() !== 'data' && roadTextureMode() !== 'ktx2') return null;
  return markingMaterial();
}

export function roadSignMaterial(tier: Tier): MeshBasicNodeMaterial | null {
  if (tier === 'low') return null;
  if (roadTextureMode() !== 'data' && roadTextureMode() !== 'ktx2') return null;
  return signMaterial();
}
