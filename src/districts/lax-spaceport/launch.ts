// Off-world departure. One additive mesh, not a scene light and not a chunk detail,
// so the head still reads from downtown after the apron has dropped to far LOD.
// The rumble is Ambience.setMachinery. This file does not open an audio node.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, MeshBasicNodeMaterial,
  type Object3D,
} from 'three/webgpu';
import { uniform } from 'three/tsl';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';
import { fogDepth } from '../../atmosphere/SkyFog';
import type { Tier } from '../../core/quality';
import type { CityLayout } from '../../world/layout';
import { PAD_BLOCKS, STACK_H, blockCenter } from './spec';

const T = TSL as any;
const {
  Fn, attribute, vec3, vec4, normalize, cross, cameraPosition, sin, smoothstep, length, float, max, clamp, exp,
} = T;

const DUR = 36;
const PERIOD = 180;
const FIRST = 48;
const QUADS = 4;
const CS = [-1, -1, 1, -1, 1, 1, -1, 1];

const GAIN: Record<Tier, number> = { low: 0.72, medium: 1, high: 1.22, ultra: 1.4 };

const launchGain = uniform(0);
const launchTier = uniform(1);
const launchWindX = uniform(0);
const launchWindZ = uniform(0);

let mesh: Mesh | null = null;
let ctr: BufferAttribute | null = null;
let crn: BufferAttribute | null = null;
let pads: Array<{ x: number; y: number; z: number }> = [];
let start = -1e9;
let pad = 0;
let armed = FIRST;
let pending: { phase: number; pad: number | null } | null = null;
let phaseNow = -1;
let envNow = 0;

function material(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial();
  m.transparent = true;
  m.depthWrite = false;
  m.blending = AdditiveBlending;
  m.fog = false;
  const c = attribute('lctr', 'vec4');
  const k = attribute('lcrn', 'vec4');
  m.positionNode = Fn(() => {
    const center = c.xyz;
    const toCam = normalize(cameraPosition.sub(center));
    const side = normalize(cross(vec3(0, 1, 0), toCam));
    const up = normalize(cross(toCam, side));
    const dist = length(center.sub(cameraPosition));
    const head = smoothstep(1.5, 1.7, k.w);
    const column = smoothstep(0.5, 0.7, k.w).mul(head.oneMinus());
    const minA = float(0.0012).add(column.mul(0.0008)).add(head.mul(0.0052));
    const s = max(c.w, dist.mul(minA));
    const lift = k.y.mul(0.5).add(0.5);
    return center
      .add(side.mul(k.x.mul(s)))
      .add(up.mul(k.y.mul(s).mul(k.z)))
      .add(vec3(launchWindX, 0, launchWindZ).mul(lift).mul(column));
  })();
  m.colorNode = Fn(() => {
    const head = smoothstep(1.5, 1.7, k.w);
    const column = smoothstep(0.5, 0.7, k.w).mul(head.oneMinus());
    const r = length(k.xy);
    const core = smoothstep(0.15, 0.85, r).oneMinus();
    const hot = vec3(0.9, 0.96, 1);
    const ice = vec3(0.42, 0.7, 1);
    const burn = vec3(1, 0.84, 0.58);
    const body = ice.mul(column).add(hot.mul(head)).add(burn.mul(column.oneMinus().mul(head.oneMinus())));
    const col = body.mul(core.mul(0.65).add(0.45)).add(hot.mul(core).mul(head.add(0.35)));
    const dist = length(c.xyz.sub(cameraPosition));
    const minA = float(0.0012).add(column.mul(0.0008)).add(head.mul(0.0052));
    const world = max(c.w, dist.mul(minA));
    const spread = clamp(c.w.div(world), 0.28, 1);
    const fogK = float(0.16).sub(column.mul(0.03)).sub(head.mul(0.09));
    const att = exp(fogDepth(cameraPosition, c.xyz).mul(fogK.negate()));
    const day = U.night.mul(0.55).add(0.45);
    const flick = sin(U.time.mul(13.0).add(k.z)).mul(0.05).add(1);
    const a = col.mul(spread).mul(att).mul(day).mul(flick).mul(launchGain).mul(launchTier).mul(3.1);
    return vec4(a, float(1));
  })();
  return m;
}

function writeQuad(i: number, x: number, y: number, z: number, size: number, aspect: number, kind: number): void {
  if (!ctr || !crn) return;
  const ca = ctr.array as Float32Array;
  const na = crn.array as Float32Array;
  for (let k = 0; k < 4; k++) {
    const v = i * 4 + k;
    ca.set([x, y, z, Math.max(0.01, size)], v * 4);
    na.set([CS[k * 2]!, CS[k * 2 + 1]!, aspect, kind], v * 4);
  }
}

export function mountLaunch(parent: Object3D, layout: CityLayout): void {
  pads = PAD_BLOCKS.map(([i, j]) => {
    const c = blockCenter(i, j);
    return { x: c.x + 6, y: layout.heightAt(c.x, c.z), z: c.z };
  });
  const n = QUADS;
  const pos = new Float32Array(n * 4 * 3);
  const cArr = new Float32Array(n * 4 * 4);
  const nArr = new Float32Array(n * 4 * 4);
  const idx = new Uint32Array(n * 6);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      cArr.set([0, 0, 0, 1], v * 4);
      nArr.set([CS[k * 2]!, CS[k * 2 + 1]!, 1, 0], v * 4);
      pos.set([0, 0, 0], v * 3);
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const g = new BufferGeometry();
  ctr = new BufferAttribute(cArr, 4);
  crn = new BufferAttribute(nArr, 4);
  ctr.setUsage(DynamicDrawUsage);
  crn.setUsage(DynamicDrawUsage);
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('lctr', ctr);
  g.setAttribute('lcrn', crn);
  g.setIndex(new BufferAttribute(idx, 1));
  mesh = new Mesh(g, material());
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;
  mesh.name = 'lax-launch';
  mesh.visible = false;
  parent.add(mesh);
}

/** phase 0 is ignition. Pass a pad index to hold that gantry (screenshots). */
export function requestLaunch(phase = 0, padIndex?: number): void {
  pending = {
    phase: Math.max(0, Math.min(0.9, phase)),
    pad: padIndex === undefined ? null : padIndex,
  };
}

function envelope(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  if (u < 0.08) return u / 0.08;
  if (u < 0.78) return Math.min(1, 0.84 + 0.16 * Math.sin((u - 0.08) * 16));
  return Math.max(0, (1 - u) / 0.22);
}

function headHeight(u: number, ground: number): number {
  if (u < 0.08) return ground + 16 + (u / 0.08) * 30;
  const p = Math.max(0, Math.min(1, (Math.min(u, 0.78) - 0.08) / 0.7));
  const e = p * p * (3 - 2 * p);
  return ground + 28 + e * 2600;
}

export function updateLaunch(elapsed: number, tier: Tier, windRad: number, wind: number): void {
  if (!pads.length) return;
  if (pending) {
    pad = pending.pad === null
      ? (pad + 1) % pads.length
      : ((pending.pad % pads.length) + pads.length) % pads.length;
    start = elapsed - pending.phase * DUR;
    pending = null;
    armed = elapsed + PERIOD;
  } else if (elapsed >= armed && elapsed - start > DUR) {
    pad = (pad + 1) % pads.length;
    start = elapsed;
    armed = start + PERIOD;
  }
  const u = (elapsed - start) / DUR;
  const live = u >= 0 && u <= 1;
  phaseNow = live ? u : -1;
  envNow = live ? envelope(u) : 0;
  launchGain.value = envNow;
  launchTier.value = GAIN[tier];
  const lean = 10 + Math.min(12, Math.max(0, wind)) * 1.4;
  launchWindX.value = Math.cos(windRad) * lean;
  launchWindZ.value = Math.sin(windRad) * lean;
  if (mesh) mesh.visible = envNow > 0.02;
  if (!live || !mesh || envNow <= 0.02) return;
  const p = pads[pad]!;
  const head = headHeight(u, p.y);
  const base = p.y + 2;
  const len = Math.max(24, head - base);
  const halfW = 18 + Math.min(1, Math.max(0, (u - 0.08) / 0.7)) * 26;
  const ignite = u < 0.12 ? 0.45 + (u / 0.12) * 0.9 : Math.max(0.28, 0.7 - (u - 0.12) * 0.5);
  writeQuad(0, p.x, base + 6, p.z, 14 + ignite * 36, 0.72, 0);
  writeQuad(1, p.x, base + len * 0.5, p.z, halfW, len / Math.max(8, halfW * 2), 1);
  writeQuad(2, p.x, base + len * 0.42, p.z, halfW * 1.8, (len * 0.8) / Math.max(12, halfW * 3.6), 1);
  writeQuad(3, p.x, head, p.z, 32 + Math.min(1, u / 0.5) * 28, 1.15, 2);
  if (ctr) ctr.needsUpdate = true;
  if (crn) crn.needsUpdate = true;
}

/** 0..1 amount for the existing machinery bed. 0 when nothing is climbing. */
export function launchRumble(x: number, y: number, z: number): number {
  if (envNow <= 0 || !pads.length) return 0;
  const p = pads[pad]!;
  const d = Math.hypot(x - p.x, y - (p.y + 40), z - p.z);
  const atten = 0.34 + 0.66 * Math.exp(-d / 7000);
  return Math.min(1, envNow * atten);
}

export function launchPhase(): number {
  return phaseNow;
}

export function launchPad(): number {
  return pad;
}

/** Stack crown, for cameras that want the plume's foot. */
export function launchStackTop(index = 1): { x: number; y: number; z: number } {
  const pair = PAD_BLOCKS[index] ?? PAD_BLOCKS[1]!;
  const c = blockCenter(pair[0], pair[1]);
  return { x: c.x + 6, y: STACK_H, z: c.z };
}
