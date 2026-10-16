// Live plumes. One instanced quad, one 64² noise texture, no extra target.
//
// Density is a soft mask times noise, never a hard stamp: a threshold is what
// turned earlier cards into torn paper. Launch curtains stay vertical and
// hollow so the flame ribbon remains the core. Street steam is a short column
// on the mouth, leaned by a clamped fraction of the weather wind. Output is
// nits, premultiplied, under an 18-nit window. No new light, no authored lift.
import {
  CustomBlending, DataTexture, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute,
  InstancedMesh, LinearFilter, Matrix4, MeshBasicNodeMaterial, NoColorSpace,
  OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry, RepeatWrapping, RGBAFormat,
  UnsignedByteType, Vector2,
} from 'three/webgpu';
import { uniform } from 'three/tsl';
import * as TSL from 'three/tsl';
import { fogDepth } from '../../atmosphere/SkyFog';
import { U } from '../../atmosphere/uniforms';
import type { Tier } from '../../core/quality';
import { resources } from '../../core/memory';
import { PRESETS } from '../../lighting/presets.ts';
import { practicalInscatter } from '../../lighting/shade.ts';
import { LIVE_DETAIL, LIVE_LAYERS, LIVE_TAILS } from './tiers';
import { KIND, type Emitter, type Tailpipe } from './types';
import type { LaunchDrive } from './launchDrive';

const T = TSL as any;
const {
  Fn, abs, attribute, cameraFar, cameraNear, cameraPosition, clamp, cross, exp, float,
  length, max, min, mix, normalize, perspectiveDepthToViewZ, positionView,
  screenUV, smoothstep, step, texture, uv, vec2, vec3, vec4, viewportDepthTexture,
} = T;

const LIVE_MAX = 280;
const FLAME = PRESETS.flare.rgb;

export const liveDetail = uniform(1);
export const liveRain = uniform(0);
export const liveWind = uniform(new Vector2(1, 0));

interface Card {
  x: number;
  y: number;
  z: number;
  halfW: number;
  halfH: number;
  seed: number;
  /** 0 steam puff, 1 launch sheath, 2 manhole sheet, 3 soot column, 4 soot puff. */
  mode: number;
  heat: number;
  peak: number;
  soft: number;
  freq: number;
}

let mesh: InstancedMesh | null = null;
let a0: InstancedBufferAttribute | null = null;
let a1: InstancedBufferAttribute | null = null;
let a2: InstancedBufferAttribute | null = null;
let shown = 0;
const cards: Card[] = [];
const identity = new Matrix4();

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function bakeNoise(): Uint8Array {
  const cells = 8;
  const size = 64;
  const grid = new Float32Array((cells + 1) * (cells + 1));
  const fine = new Float32Array((cells * 2 + 1) * (cells * 2 + 1));
  let s = 0x51ed270b;
  const rnd = () => {
    s = Math.imul(s ^ (s >>> 15), 0x6d2b79f5);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
  const paint = (g: Float32Array, n: number) => {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) g[y * (n + 1) + x] = rnd();
    }
    for (let i = 0; i < n; i++) {
      g[n * (n + 1) + i] = g[i]!;
      g[i * (n + 1) + n] = g[i * (n + 1)]!;
    }
    g[n * (n + 1) + n] = g[0]!;
  };
  paint(grid, cells);
  paint(fine, cells * 2);
  const sample = (g: Float32Array, n: number, u: number, v: number) => {
    const x = u * n;
    const y = v * n;
    const x0 = Math.floor(x) % n;
    const y0 = Math.floor(y) % n;
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const at = (ix: number, iy: number) => g[iy * (n + 1) + ix]!;
    return at(x0, y0) * (1 - sx) * (1 - sy)
      + at((x0 + 1) % n, y0) * sx * (1 - sy)
      + at(x0, (y0 + 1) % n) * (1 - sx) * sy
      + at((x0 + 1) % n, (y0 + 1) % n) * sx * sy;
  };
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;
      data[i] = Math.round(sample(grid, cells, u, v) * 255);
      data[i + 1] = Math.round(sample(fine, cells * 2, u, v) * 255);
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  return data;
}

function liveMaterial(): MeshBasicNodeMaterial {
  const noise = resources.texture(() => new DataTexture(bakeNoise(), 64, 64, RGBAFormat, UnsignedByteType), {
    label: 'smoke-noise',
    owner: 'smoke',
  });
  noise.colorSpace = NoColorSpace;
  noise.wrapS = RepeatWrapping;
  noise.wrapT = RepeatWrapping;
  noise.magFilter = LinearFilter;
  noise.minFilter = LinearFilter;
  noise.generateMipmaps = false;
  noise.flipY = false;
  noise.needsUpdate = true;
  noise.name = 'smoke-noise';

  const m = new MeshBasicNodeMaterial();
  m.transparent = true;
  m.depthWrite = false;
  m.depthTest = true;
  m.side = DoubleSide;
  m.fog = false;
  m.blending = CustomBlending;
  m.blendSrc = OneFactor;
  m.blendDst = OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = OneFactor;
  m.blendDstAlpha = OneMinusSrcAlphaFactor;
  m.premultipliedAlpha = true;
  m.forceSinglePass = true;

  m.positionNode = Fn(() => {
    const sh0 = attribute('sh0', 'vec4');
    const sh1 = attribute('sh1', 'vec4');
    const center = sh0.xyz;
    const halfW = max(sh0.w, 0.05);
    const halfH = max(sh1.x, 0.05);
    const mode = sh1.z;
    const vertical = max(
      step(abs(mode.sub(1.0)), float(0.25)),
      step(abs(mode.sub(3.0)), float(0.25)),
    );
    const corner = uv().mul(2.0).sub(1.0);
    const toCam = normalize(cameraPosition.sub(center));
    const sideCyl = normalize(cross(vec3(0.0, 1.0, 0.0), toCam).add(vec3(0.001, 0.0, 0.001)));
    const upCyl = vec3(0.0, 1.0, 0.0);
    const ref = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), step(0.92, abs(toCam.y)));
    const sideFull = normalize(cross(ref, toCam));
    const upFull = normalize(cross(toCam, sideFull));
    const side = mix(sideFull, sideCyl, vertical);
    const up = mix(upFull, upCyl, vertical);
    return center.add(side.mul(corner.x.mul(halfW))).add(up.mul(corner.y.mul(halfH)));
  })();

  m.colorNode = Fn(() => {
    const sh0 = attribute('sh0', 'vec4');
    const sh1 = attribute('sh1', 'vec4');
    const sh2 = attribute('sh2', 'vec4');
    const center = sh0.xyz;
    const seed = sh1.y;
    const mode = sh1.z;
    const heat = sh2.x;
    const peak = sh2.y;
    const softDist = max(sh2.z, 0.15);
    const freq = max(sh2.w, 1.2);
    const halfW = sh0.w;
    const big = step(float(8.0), halfW);
    const launch = max(step(abs(mode.sub(1.0)), float(0.25)), big);
    const sheet = step(abs(mode.sub(2.0)), float(0.25));
    const soot = max(
      step(abs(mode.sub(3.0)), float(0.25)),
      step(abs(mode.sub(4.0)), float(0.25)),
    );
    const corner = uv().mul(2.0).sub(1.0);
    const flow = vec2(
      corner.x.mul(freq).add(seed.mul(4.1)).add(liveWind.x.mul(U.time).mul(0.07)),
      corner.y.mul(freq.mul(0.85)).sub(U.time.mul(0.11)).add(seed.mul(2.4)).add(liveWind.y.mul(U.time).mul(0.05)),
    );
    const tex = texture(noise, flow.mul(0.22));
    const body = mix(tex.r, tex.r.mul(0.58).add(tex.g.mul(0.42)), liveDetail);

    const radial = length(corner.mul(vec2(0.92, 1.0)));
    const puff = smoothstep(float(1.02), float(0.18), radial);
    const wide = smoothstep(float(1.0), float(0.22), abs(corner.y))
      .mul(smoothstep(float(1.05), float(0.35), abs(corner.x)));
    const absX = abs(corner.x);
    const edge = smoothstep(float(0.06), float(0.32), absX).mul(smoothstep(float(1.02), float(0.4), absX));
    const core = smoothstep(float(0.48), float(0.0), absX).mul(0.16);
    const vert = smoothstep(float(-1.02), float(-0.38), corner.y).mul(smoothstep(float(1.02), float(0.46), corner.y));
    const sheath = edge.add(core).mul(vert);
    const column = smoothstep(float(0.98), float(0.2), absX)
      .mul(smoothstep(float(-1.02), float(-0.2), corner.y))
      .mul(smoothstep(float(1.02), float(0.28), corner.y));
    const columnMode = step(abs(mode.sub(3.0)), float(0.25));
    const sheathOn = step(abs(mode.sub(1.0)), float(0.25));
    const shaped = mix(mix(puff, wide, sheet), sheath, sheathOn);
    const mask = mix(shaped, column, columnMode);
    const shade = mix(float(0.46), float(1.0), body);
    const dens = mask.mul(mix(mix(float(0.72), float(1.0), body), mix(float(0.42), float(1.0), body), big))
      .mul(mix(float(1.0), smoothstep(float(0.0), float(0.55), absX).mul(0.35).add(0.55), big));

    const steamCol = vec3(0.58, 0.60, 0.63).mul(13.0);
    const sootCol = vec3(0.42, 0.41, 0.39).mul(14.0);
    const launchCol = vec3(0.62, 0.64, 0.67).mul(18.0);
    const ash = mix(mix(steamCol, sootCol, soot), launchCol, launch);
    const bottom = smoothstep(float(0.25), float(-0.85), corner.y);
    const warm = vec3(FLAME[0], FLAME[1], FLAME[2]).mul(heat).mul(bottom).mul(dens).mul(5.0);
    const scatter = practicalInscatter(center).mul(0.015);
    const lit = ash.mul(shade).add(warm).add(scatter);

    const dist = length(center.sub(cameraPosition));
    const sceneZ = perspectiveDepthToViewZ(viewportDepthTexture(screenUV), cameraNear, cameraFar);
    const gap = positionView.z.sub(sceneZ);
    const soft = smoothstep(0.0, softDist, gap);
    const depthAlive = float(1.0).sub(smoothstep(float(-4.0), float(-0.4), sceneZ));
    const softFade = mix(float(1.0), soft, depthAlive);
    const fogA = clamp(exp(fogDepth(cameraPosition, center).mul(-1.0)), float(0.15), float(1.0));
    const near = smoothstep(float(2.6), float(4.6), dist);
    const farStreet = smoothstep(float(52.0), float(16.0), dist);
    const farStack = smoothstep(float(1600.0), float(240.0), dist);
    const farLaunch = smoothstep(float(7000.0), float(1600.0), dist);
    const streetFade = near.mul(farStreet);
    const fade = mix(streetFade, farLaunch, launch);
    const fade2 = mix(fade, farStack, columnMode);
    const rain = mix(float(1.0), float(1.18), liveRain.mul(float(1.0).sub(soot).mul(launch.oneMinus())));
    const a = min(dens.mul(peak), float(0.62)).mul(softFade).mul(fogA).mul(fade2).mul(rain);
    return vec4(lit.mul(a), a);
  })();
  return m;
}

export function liveMesh(): InstancedMesh {
  if (mesh && a0 && a1 && a2) return mesh;
  const geo = resources.geometry(() => new PlaneGeometry(1, 1), {
    label: 'smoke-live',
    owner: 'smoke',
    evictable: true,
  });
  a0 = new InstancedBufferAttribute(new Float32Array(LIVE_MAX * 4), 4);
  a1 = new InstancedBufferAttribute(new Float32Array(LIVE_MAX * 4), 4);
  a2 = new InstancedBufferAttribute(new Float32Array(LIVE_MAX * 4), 4);
  a0.setUsage(DynamicDrawUsage);
  a1.setUsage(DynamicDrawUsage);
  a2.setUsage(DynamicDrawUsage);
  geo.setAttribute('sh0', a0);
  geo.setAttribute('sh1', a1);
  geo.setAttribute('sh2', a2);
  const mat = resources.material('smoke-live', () => liveMaterial());
  mesh = new InstancedMesh(geo, mat, LIVE_MAX);
  mesh.name = 'smoke-live';
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.count = 0;
  mesh.visible = false;
  for (let i = 0; i < LIVE_MAX; i++) mesh.setMatrixAt(i, identity);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

export function liveCount(): number {
  return shown;
}

export function concealLive(): void {
  if (mesh) mesh.visible = false;
}

function push(c: Card): void {
  if (cards.length >= LIVE_MAX) return;
  cards.push(c);
}

function windLean(dir: number, metres: number): { x: number; z: number } {
  return { x: Math.cos(dir) * metres, z: Math.sin(dir) * metres };
}

function placeColumn(
  e: Emitter,
  layers: number,
  rise0: number,
  rise1: number,
  w0: number,
  w1: number,
  aspect: number,
  mode: number,
  peak: number,
  soft: number,
  freq: number,
  leanPer: number,
  maxLean: number,
  heat0: number,
  wind: number,
  windDir: number,
  rain: number,
  time: number,
): void {
  const n = Math.max(1, layers);
  const rainCut = 1 - rain * 0.28;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const rise = (rise0 + (rise1 - rise0) * t) * rainCut;
    const lean = Math.min(maxLean, rise * leanPer * Math.min(wind, 9) / 5);
    const side = Math.sin(time * 0.35 + e.x * 0.17 + i * 1.3) * (0.08 + 0.12 * t);
    const w = windLean(windDir, lean);
    const px = -Math.sin(windDir) * side;
    const pz = Math.cos(windDir) * side;
    const halfW = (w0 + (w1 - w0) * t) * 0.5;
    push({
      x: e.x + w.x + px,
      y: e.y + rise,
      z: e.z + w.z + pz,
      halfW,
      halfH: halfW * aspect,
      seed: hash(e.x * 0.13 + e.z * 0.07 + i * 0.19),
      mode,
      heat: heat0 * (1 - t),
      peak,
      soft,
      freq,
    });
  }
}

function placeLaunch(
  drive: LaunchDrive, tier: Tier, time: number, camX: number, camY: number, camZ: number,
): void {
  if (!drive.burning || drive.id <= 0) return;
  const len = Math.max(40, drive.headY - drive.y);
  const high = camY > drive.y + 200;
  const camH = Math.max(0, camY - drive.y);
  const n = LIVE_LAYERS.launch![tier];
  const mag = 10 + Math.min(12, Math.max(0, drive.wind)) * 1.4;
  const dx = camX - drive.x;
  const dz = camZ - drive.z;
  const dist = Math.hypot(dx, dz) || 1;
  const toCamX = dx / dist;
  const toCamZ = dz / dist;
  const bot = high ? Math.max(40, camH - 180) : 28;
  const top = high ? Math.min(len * 0.85, camH + 200) : Math.min(len * 0.62, 880);
  const span = Math.max(40, top - bot);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const h = bot + span * t;
    const f = Math.max(0, Math.min(1, h / len));
    const lift = Math.max(0, Math.min(1, (f - 0.18) / 0.55));
    const lean = mag * lift;
    const wob = Math.sin(i * 1.3) * 2.5;
    const ax = drive.x + Math.cos(drive.windDir) * lean - toCamZ * wob;
    const ay = drive.y + h;
    const az = drive.z + Math.sin(drive.windDir) * lean + toCamX * wob;
    const vx = camX - ax;
    const vy = camY - ay;
    const vz = camZ - az;
    const vd = Math.hypot(vx, vy, vz) || 1;
    const step = span / Math.max(1, n - 1);
    push({
      x: ax + (vx / vd) * 6,
      y: ay + (vy / vd) * 6,
      z: az + (vz / vd) * 6,
      halfW: tier === 'low' ? 16 + t * 6 : tier === 'medium' ? 18 + t * 10 : 20 + t * 12,
      halfH: Math.min(step * 0.78, tier === 'low' ? 34 : tier === 'medium' ? 42 : 52),
      seed: hash(i * 0.37 + h * 0.01),
      mode: 0,
      heat: Math.exp(-h / 140) * 0.3,
      peak: tier === 'low' ? 0.46 : tier === 'medium' ? 0.42 : 0.44,
      soft: 5,
      freq: tier === 'low' || tier === 'medium' ? 1.7 : 2.6,
    });
  }
  if (high || dist > 400) return;
  const g = LIVE_LAYERS.ground![tier];
  for (let i = 0; i < g; i++) {
    const ang = (i / g) * Math.PI * 2 + 0.6;
    const ring = 2 + (i % 3) * 2;
    push({
      x: drive.x + Math.cos(ang) * ring + toCamX * 4,
      y: drive.y + 6 + (i % 3) * 4,
      z: drive.z + Math.sin(ang) * ring + toCamZ * 4,
      halfW: 11 + (i % 2) * 3,
      halfH: 8 + (i % 2) * 2,
      seed: hash(ang + 2.2),
      mode: 0,
      heat: i < 2 ? 0.2 : 0,
      peak: 0.24,
      soft: 5,
      freq: 1.8,
    });
  }
}

function placeEmitters(
  emitters: readonly Emitter[],
  tier: Tier,
  wind: number,
  windDir: number,
  rain: number,
  time: number,
): void {
  for (const e of emitters) {
    if (e.kind === KIND.vent) {
      placeColumn(e, LIVE_LAYERS.vent![tier], 0.2, 4.4, 1.15, 2.3, 1.45, 0, 0.58, 0.55, 1.6, 0.38, 2.2, 0, wind, windDir, rain, time);
    } else if (e.kind === KIND.manhole) {
      placeColumn(e, LIVE_LAYERS.manhole![tier], 0.1, 1.05, 1.8, 2.8, 0.4, 2, 0.5, 0.45, 1.6, 0.55, 1.8, 0, wind, windDir, rain, time);
    } else if (e.kind === KIND.roof) {
      placeColumn(e, LIVE_LAYERS.roof![tier], 0.4, 4.2, 1.1, 2.2, 1.55, 0, 0.44, 0.7, 2.4, 0.32, 2.8, 0, wind, windDir, rain, time);
    } else if (e.kind === KIND.stall) {
      placeColumn(e, LIVE_LAYERS.stall![tier], 0.15, 1.6, 0.42, 0.75, 2.1, 0, 0.42, 0.35, 1.7, 0.3, 0.8, 0.12, wind, windDir, rain, time);
    } else if (e.kind === KIND.barrel) {
      placeColumn(e, LIVE_LAYERS.barrel![tier], 0.25, 2.4, 0.55, 1.15, 1.45, 4, 0.48, 0.45, 2.5, 0.22, 1.2, 0.9, wind, windDir, rain, time);
    } else if (e.kind === KIND.stack) {
      placeColumn(e, LIVE_LAYERS.stack![tier], 0, 110, 14, 28, 1.35, 3, 0.42, 8, 1.4, 0.14, 22, 0, wind, windDir, rain, time);
    }
  }
}

function placeTails(
  tails: readonly Tailpipe[],
  tier: Tier,
  camX: number,
  camZ: number,
  time: number,
): void {
  const cap = LIVE_TAILS[tier];
  const ranked = tails
    .map((t) => ({ t, d: (t.x - camX) ** 2 + (t.z - camZ) ** 2 }))
    .filter((r) => r.d > 5 * 5 && r.d < 70 * 70 && r.t.heavy !== 2)
    .sort((a, b) => a.d - b.d)
    .slice(0, cap);
  const n = LIVE_LAYERS.exhaust![tier];
  for (const { t } of ranked) {
    const fx = t.wx ?? 0;
    const fz = t.wz ?? 0;
    const sp = Math.hypot(fx, fz) || 1;
    const bx = -fx / sp;
    const bz = -fz / sp;
    const truck = t.heavy === 1;
    for (let i = 0; i < n; i++) {
      const back = 0.45 + i * (truck ? 0.85 : 0.6);
      const halfW = (truck ? 0.38 : 0.22) + i * 0.08;
      push({
        x: t.x + bx * back,
        y: t.y + 0.05 + i * 0.06,
        z: t.z + bz * back,
        halfW,
        halfH: halfW * 0.7,
        seed: hash(t.x * 0.11 + t.z * 0.19 + i),
        mode: 4,
        heat: i === 0 ? 0.08 : 0,
        peak: 0.55,
        soft: 0.45,
        freq: 2.4,
      });
    }
  }
}

export interface LiveFrame {
  tier: Tier;
  time: number;
  wind: number;
  windDir: number;
  rain: number;
  camX: number;
  camY: number;
  camZ: number;
  emitters: readonly Emitter[];
  drive: LaunchDrive;
  tails: readonly Tailpipe[];
}

export function syncLive(frame: LiveFrame): number {
  if (!mesh && frame.emitters.length === 0 && !frame.drive.burning) return 0;
  liveMesh();
  liveDetail.value = LIVE_DETAIL[frame.tier];
  liveRain.value = frame.rain;
  liveWind.value.set(Math.cos(frame.windDir), Math.sin(frame.windDir));
  cards.length = 0;
  placeLaunch(frame.drive, frame.tier, frame.time, frame.camX, frame.camY, frame.camZ);
  placeEmitters(frame.emitters, frame.tier, frame.wind, frame.windDir, frame.rain, frame.time);
  placeTails(frame.tails, frame.tier, frame.camX, frame.camZ, frame.time);
  const draw = mesh!;
  if (!a0 || !a1 || !a2) return 0;
  const n = Math.min(cards.length, LIVE_MAX);
  shown = n;
  draw.visible = n > 0;
  draw.count = n;
  for (let i = 0; i < n; i++) {
    const s = cards[i]!;
    a0.setXYZW(i, s.x, s.y, s.z, s.halfW);
    a1.setXYZW(i, s.halfH, s.seed, s.mode, 0);
    a2.setXYZW(i, s.heat, s.peak, s.soft, s.freq);
  }
  if (n > 0) {
    a0.needsUpdate = true;
    a1.needsUpdate = true;
    a2.needsUpdate = true;
  }
  return n;
}
