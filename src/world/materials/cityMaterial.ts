// Single node material for all procedural fabric (ground + buildings). Windows, staining, wetness,
// puddles, snow cover and far-distance light averaging are all procedural so chunks need no textures.
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';
import { lut } from './lut';

// TSL typings are very loose in @types/three; shader modules use untyped TSL deliberately.
const T = TSL as any;
const {
  Fn, attribute, float, vec2, vec3, floor, fract, step, smoothstep, mix, hash, mx_noise_float, normalLocal,
  positionWorld, cameraPosition, fwidth, max, clamp, length, normalize, pow, abs,
} = T;

// Per-style tables, indexed by Style id (src/world/fabric/types.ts)
//                     ground  mega  office indus market coast resid civic sprawl neon  solid
const CELL_W = [1, 3.6, 2.2, 9.0, 3.2, 5.0, 3.2, 6.0, 3.4, 3.0, 4.0];
const CELL_H = [1, 3.6, 4.0, 7.0, 3.2, 3.4, 3.1, 5.5, 3.2, 3.4, 3.2];
const WIN_W = [0, 0.55, 0.7, 0.3, 0.6, 0.35, 0.5, 0.25, 0.45, 0.6, 0];
const WIN_H = [0, 0.45, 0.5, 0.25, 0.5, 0.35, 0.45, 0.2, 0.45, 0.5, 0];
const ALBEDO = [0.06, 0.2, 0.15, 0.2, 0.24, 0.3, 0.22, 0.3, 0.25, 0.17, 0.14];
const WARMTH = [0, 0.55, 0.25, 0.7, 0.9, 0.5, 0.75, 0.3, 0.8, 0.6, 0.45];

let shared: MeshStandardNodeMaterial | null = null;

export function getCityMaterial(): MeshStandardNodeMaterial {
  if (shared) return shared;
  const m = new MeshStandardNodeMaterial();
  m.name = 'CityFabric';

  const facade = attribute('facade', 'vec2');
  const bdata = attribute('bdata', 'vec4');
  const seed = bdata.x;
  const styleF = bdata.y;
  const lit = bdata.z;
  const tint = bdata.w;

  const cellW = lut(CELL_W, styleF);
  const cellH = lut(CELL_H, styleF);
  const winW = lut(WIN_W, styleF);
  const winH = lut(WIN_H, styleF);
  const albedo = lut(ALBEDO, styleF);
  const warmth = lut(WARMTH, styleF);

  const isRoof = step(0.5, normalLocal.y);
  const isGround = step(bdata.y, 0.5);
  const isWall = float(1).sub(isRoof).mul(float(1).sub(isGround));

  const wpos = positionWorld;
  const distCam = length(wpos.sub(cameraPosition));

  // ---- windows ----
  const g = facade.div(vec2(cellW, cellH));
  const cell = floor(g);
  const f = fract(g);
  const winMask = step(f.x, float(0.5).add(winW.mul(0.5)))
    .mul(step(float(0.5).sub(winW.mul(0.5)), f.x))
    .mul(step(f.y, float(0.55).add(winH.mul(0.5))))
    .mul(step(float(0.55).sub(winH.mul(0.5)), f.y));
  const k1 = hash(cell.x.add(floor(seed.mul(4096)).mul(512)));
  const h1 = hash(cell.y.add(k1.mul(65536)));
  const h2 = hash(h1.mul(9137.0).add(cell.x));
  // the film's towers read as dark masses with sparse lights: only ~half of the nominal lit fraction
  const litFrac = lit.mul(U.windowLit).mul(0.45);
  const litMask = step(h1, litFrac);
  const warmC = vec3(1.0, 0.58, 0.26);
  const coolC = vec3(0.55, 0.78, 1.0);
  const winColor = mix(coolC, warmC, step(h2, warmth)).mul(h2.mul(0.9).add(0.35));
  // window interior read: mullion + transom, brighter ceiling, some blinds half drawn
  const lx = f.x.sub(0.5).div(max(winW, 0.01)).add(0.5);
  const ly = f.y.sub(float(0.55).sub(winH.mul(0.5))).div(max(winH, 0.01));
  const mullion = step(0.035, abs(lx.sub(0.5))).mul(step(0.04, abs(ly.sub(0.72))));
  const h3 = hash(h1.mul(4513.0).add(cell.y));
  const blinds = mix(float(1), float(0.3), step(0.62, h3).mul(step(ly, h3.sub(0.62).mul(2.6).add(0.35)).oneMinus()));
  const interior = ly.mul(0.55).add(0.6).mul(blinds).mul(mullion.mul(0.85).add(0.15));
  const nearWindows = winColor.mul(litMask).mul(winMask).mul(interior);
  // average for distant / grazing views (prevents moire + keeps the city glowing far away)
  // perceptually a field of sub-pixel lights reads darker than its true mean: scale the average down
  const avgWindows = mix(coolC, warmC, warmth).mul(litFrac.mul(winW.mul(winH)).mul(0.45));
  const footprint = fwidth(g.x).add(fwidth(g.y));
  const farFade = max(smoothstep(0.7, 1.3, footprint), smoothstep(900.0, 2600.0, distCam));
  const windows = mix(nearWindows, avgWindows, farFade).mul(isWall).mul(1.1);

  // ---- ground sprawl lights (far LOD: low-rise city rendered as a carpet of lights) ----
  const gcell = floor(wpos.xz.add(100000).div(7.0));
  const gh = hash(gcell.x.add(hash(gcell.y).mul(65536)));
  const gLights = step(float(1).sub(lit.mul(0.16).mul(U.windowLit)), gh);
  const gFoot = fwidth(wpos.x).div(7.0);
  const gAvg = lit.mul(0.16).mul(U.windowLit).mul(0.8);
  const groundLights = mix(gLights, gAvg, smoothstep(0.3, 1.0, gFoot)).mul(warmC).mul(isGround).mul(step(0.001, lit)).mul(2.0);

  // ---- fake neon reflections on wet streets (near camera only) ----
  // ground bdata.w = 1 + district neon amount (see mesher emitGround)
  const neonAmt = clamp(tint.sub(1.0), 0, 1).mul(isGround);
  const viewDir = normalize(cameraPosition.sub(wpos));
  const fres = pow(float(1).sub(clamp(viewDir.y, 0, 1)), 2.5);
  const nA = mx_noise_float(vec3(wpos.x.mul(0.045), wpos.z.mul(0.045), 4.0));
  const nB = mx_noise_float(vec3(wpos.x.mul(0.11), wpos.z.mul(0.11), 9.0));
  const neonCol = mix(mix(vec3(1.0, 0.18, 0.55), vec3(0.15, 0.85, 1.0), smoothstep(-0.25, 0.25, nA)), vec3(1.0, 0.55, 0.15), smoothstep(0.15, 0.5, nB));
  const streaks = mx_noise_float(vec3(wpos.x.mul(0.9), wpos.z.mul(0.9), 1.0)).mul(0.5).add(0.5);

  // ---- albedo ----
  const stain = mx_noise_float(vec3(facade.x.mul(0.11), facade.y.mul(0.018), seed.mul(37.0))).mul(0.5).add(0.5);
  const slab = step(0.9, fract(facade.y.div(cellH))).mul(isWall);
  const wallC = vec3(albedo).mul(tint).mul(stain.mul(0.45).add(0.75)).mul(float(1).sub(slab.mul(0.35)));
  const tinted = wallC.mul(vec3(1.0, mix(0.97, 1.0, warmth), mix(0.92, 1.02, float(1).sub(warmth))));

  const gNoise = mx_noise_float(vec3(wpos.x.mul(0.05), wpos.z.mul(0.05), 3.0)).mul(0.5).add(0.5);
  const gFine = mx_noise_float(vec3(wpos.x.mul(0.6), wpos.z.mul(0.6), 7.0)).mul(0.5).add(0.5);
  const groundC = vec3(0.05, 0.05, 0.055).mul(gNoise.mul(0.6).add(0.7)).mul(gFine.mul(0.3).add(0.85));

  const unlitGlass = winMask.mul(isWall).mul(float(1).sub(litMask));
  let baseColor = mix(tinted, groundC, isGround);
  baseColor = baseColor.mul(float(1).sub(unlitGlass.mul(0.55)));

  // ---- wetness / puddles / snow ----
  const puddleN = mx_noise_float(vec3(wpos.x.mul(0.045), wpos.z.mul(0.045), 11.0));
  const puddle = smoothstep(0.15, 0.35, puddleN).mul(isGround).mul(U.wetness);
  const wet = U.wetness;
  const darken = mix(1.0, 0.55, wet.mul(isGround.add(isRoof).min(1)).add(wet.mul(isWall).mul(0.35)));
  baseColor = baseColor.mul(darken);
  const neonRefl = neonCol.mul(fres).mul(wet).mul(puddle.mul(0.75).add(0.25)).mul(streaks.mul(0.6).add(0.4))
    .mul(U.night.mul(0.8).add(0.2)).mul(U.signPower).mul(neonAmt).mul(smoothstep(140.0, 520.0, distCam).oneMinus())
    .mul(mix(float(1.15), float(0.4), U.reflMix));

  const upness = clamp(normalLocal.y, 0, 1);
  const snowAmt = U.snow.mul(smoothstep(0.55, 0.95, upness)).mul(
    mx_noise_float(vec3(wpos.x.mul(0.3), wpos.z.mul(0.3), 5.0)).mul(0.25).add(0.85),
  );
  baseColor = mix(baseColor, vec3(0.72, 0.74, 0.78), clamp(snowAmt, 0, 1));

  const dryRough = mix(0.88, 0.8, isGround);
  let rough = mix(dryRough, mix(0.42, 0.28, isGround), wet);
  rough = mix(rough, 0.04, puddle);
  rough = mix(rough, 0.12, unlitGlass);
  rough = mix(rough, 0.85, clamp(snowAmt, 0, 1));

  m.colorNode = baseColor;
  m.roughnessNode = rough;
  m.metalnessNode = mix(float(0), float(0.35), unlitGlass);
  const snowCover = float(1).sub(clamp(snowAmt, 0, 1));
  m.emissiveNode = Fn(() => windows.mul(snowCover.mul(0.6).add(0.4)).add(groundLights).add(neonRefl.mul(snowCover)))();

  shared = m;
  return m;
}
