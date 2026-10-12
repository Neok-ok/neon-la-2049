// GPU budget for lighting targets. No cluster texture, no per-light shadow map.
// The memory governor (docs/perf/MEMORY-RULES.md) shrinks the drawing buffer
// at pressure level 3 (resolution scale 0.75). These targets are a fraction of
// that buffer. setLightingResolutionScale is a further cut, 1 down to 0.25,
// and is not also multiplied into the pixel ratio.
import type { Tier } from '../core/quality';
import { LIGHT_TIERS } from './tiers.ts';

/** Half-float RGBA, the bloom chain and the scene color the chain reads. */
export const HALF_FLOAT_RGBA_BYTES = 8;
/** Depth attachment on the scene color target. Float or unsigned-int, 4 bytes. */
export const DEPTH_BYTES = 4;
/**
 * One sun shadow: a color target plus a float depth texture, matching the
 * WebGL shadow path. Night practicals do not allocate this.
 */
export const SHADOW_BYTES_PER_PIXEL = 8;
/** three.js bloom blur steps. Bright pass is extra, not one of these mips. */
export const BLOOM_MIPS = 5;
/** Bloom starts at half the drawing buffer, then the governor scale multiplies that. */
export const BLOOM_BASE_SCALE = 0.5;
export const SUN_SHADOW_BASE = 1024;
export const ENV_BASE_W = 256;
export const ENV_BASE_H = 128;
/** The atmosphere already uploads this equirect. A lighting probe replaces it. */
export const ATMOSPHERE_ENV_BYTES = ENV_BASE_W * ENV_BASE_H * 4;

const SCALE_MIN = 0.25;
const SCALE_MAX = 1;

let resolutionScale = 1;
const listeners = new Set<(scale: number) => void>();

export function lightingResolutionScale(): number {
  return resolutionScale;
}

/** Lower under memory pressure. Values outside 0.25..1 clamp. Non-finite values are ignored. */
export function setLightingResolutionScale(scale: number): void {
  if (!Number.isFinite(scale)) return;
  const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale));
  if (next === resolutionScale) return;
  resolutionScale = next;
  for (const fn of listeners) fn(next);
}

/** Fired after the scale actually changes. Returns an unsubscribe. */
export function watchLightingResolutionScale(fn: (scale: number) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Power-of-two edge for the one sun shadow. 1024 at scale 1, 256 at the floor. */
export function shadowEdge(scale: number): number {
  const px = SUN_SHADOW_BASE * Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale));
  const pot = 2 ** Math.round(Math.log2(Math.max(256, px)));
  return Math.min(SUN_SHADOW_BASE, Math.max(256, pot));
}

/** Procedural wet-street equirect. Replaces the atmosphere map; it does not stack on it. */
export function envExtent(scale: number): { w: number; h: number } {
  const s = Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale));
  return {
    w: Math.max(64, Math.round(ENV_BASE_W * s)),
    h: Math.max(32, Math.round(ENV_BASE_H * s)),
  };
}

export interface LightingMemory {
  tier: Tier;
  scale: number;
  width: number;
  height: number;
  /** Scene color target. Present only while bloom is on. */
  sceneTargets: number;
  sceneColorBytes: number;
  sceneDepthBytes: number;
  /** Bright pass plus five horizontal/vertical mip pairs. */
  bloomTargets: number;
  bloomBytes: number;
  shadowMaps: number;
  shadowBytes: number;
  /** 1 while this tier owns the environment image. */
  probes: number;
  probeBytes: number;
  /** Scene targets plus bloom targets. Shadows and the probe are counted on their own. */
  renderTargets: number;
  /**
   * Bytes this tier adds on top of the pre-lighting city.
   * The probe replaces the atmosphere equirect, so that swap is netted out.
   */
  bytes: number;
}

function bloomChainBytes(width: number, height: number, scale: number): { targets: number; bytes: number } {
  let resx = Math.floor(width * BLOOM_BASE_SCALE * scale);
  let resy = Math.floor(height * BLOOM_BASE_SCALE * scale);
  let bytes = Math.max(0, resx) * Math.max(0, resy) * HALF_FLOAT_RGBA_BYTES;
  for (let i = 0; i < BLOOM_MIPS; i++) {
    bytes += Math.max(0, resx) * Math.max(0, resy) * HALF_FLOAT_RGBA_BYTES * 2;
    resx = Math.floor(resx / 2);
    resy = Math.floor(resy / 2);
  }
  return { targets: 1 + BLOOM_MIPS * 2, bytes };
}

/**
 * GPU memory lighting adds for a drawing buffer of `width`×`height`.
 * `daylight` allocates the sun shadow on ultra. Night passes false: contact
 * shadows are analytic discs and do not own a map.
 */
export function lightingMemory(
  tier: Tier,
  width: number,
  height: number,
  scale = resolutionScale,
  daylight = false,
): LightingMemory {
  const cfg = LIGHT_TIERS[tier];
  const safeScale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Number.isFinite(scale) ? scale : 1));
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  let sceneTargets = 0;
  let sceneColorBytes = 0;
  let sceneDepthBytes = 0;
  let bloomTargets = 0;
  let bloomBytes = 0;
  if (cfg.bloom && w > 0 && h > 0) {
    const sw = Math.floor(w * safeScale);
    const sh = Math.floor(h * safeScale);
    sceneTargets = 1;
    sceneColorBytes = sw * sh * HALF_FLOAT_RGBA_BYTES;
    sceneDepthBytes = sw * sh * DEPTH_BYTES;
    const chain = bloomChainBytes(w, h, safeScale);
    bloomTargets = chain.targets;
    bloomBytes = chain.bytes;
  }
  const shadowOn = cfg.sunShadow && daylight;
  const edge = shadowOn ? shadowEdge(safeScale) : 0;
  const shadowMaps = shadowOn ? 1 : 0;
  const shadowBytes = edge * edge * SHADOW_BYTES_PER_PIXEL;
  const extent = envExtent(safeScale);
  const probes = cfg.probes ? 1 : 0;
  const probeBytes = probes ? extent.w * extent.h * 4 : 0;
  const probeAdded = probes ? Math.max(0, probeBytes - ATMOSPHERE_ENV_BYTES) : 0;
  return {
    tier,
    scale: safeScale,
    width: w,
    height: h,
    sceneTargets,
    sceneColorBytes,
    sceneDepthBytes,
    bloomTargets,
    bloomBytes,
    shadowMaps,
    shadowBytes,
    probes,
    probeBytes,
    renderTargets: sceneTargets + bloomTargets,
    bytes: sceneColorBytes + sceneDepthBytes + bloomBytes + shadowBytes + probeAdded,
  };
}
