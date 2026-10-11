// Pure listening model for the living city. No AudioNodes and no decoded buffers.
// The graph in living.ts is a straight reading of these numbers.
//
// Sources (methods, not copied code):
// - Street flutter delay is 2 * width / c. Kang, Urban Sound Environment (Taylor & Francis, 2007).
// - Damped feedback combs: Schroeder, Natural Sounding Artificial Reverberation, JAES 1962;
//   Moorer, About This Reverberation Business, CMJ 1979. Delays follow the street, not Freeverb's hall table.
// - Rain as filtered noise plus impacts that ring a material resonance: Farnell, Designing Sound (MIT Press, 2010).
// - Doppler ratio f = f0 * c / (c - v), the same shape the old Web Audio PannerNode used before velocity was removed.
// - Occlusion is a gain cut plus a low-pass, the usual game-audio obstruction (Stevens & Raybould, The Game Audio Tutorial, 2011).

import type { Tier } from '../core/quality';
import { hash2i, hashString } from '../core/rng';

export type SurfaceId = 'metal' | 'glass' | 'concrete' | 'puddle' | 'fabric' | 'umbrella';
export type SpaceKind = 'alley' | 'boulevard' | 'freeway' | 'interior' | 'open';
export type OcclusionMode = 'off' | 'gain' | 'lowpass';

export const SURFACES: readonly SurfaceId[] = ['metal', 'glass', 'concrete', 'puddle', 'fabric', 'umbrella'];

/** Resonance a drop excites. Written as biquad type, Hz and Q so the graph does not invent a second recipe. */
export const SURFACE_TONE: Record<SurfaceId, { type: BiquadFilterType; freq: number; q: number; impact: number; body: number }> = {
  metal: { type: 'bandpass', freq: 4200, q: 6.5, impact: 1.45, body: 0.32 },
  glass: { type: 'bandpass', freq: 7400, q: 4.4, impact: 0.82, body: 0.85 },
  concrete: { type: 'bandpass', freq: 920, q: 0.48, impact: 0.42, body: 1 },
  puddle: { type: 'lowpass', freq: 340, q: 0.7, impact: 0.78, body: 1 },
  fabric: { type: 'lowpass', freq: 1100, q: 0.6, impact: 0.42, body: 1 },
  umbrella: { type: 'bandpass', freq: 2700, q: 1.45, impact: 0.62, body: 0.9 },
};

export interface HearInput {
  x: number;
  z: number;
  y: number;
  alt: number;
  rain: number;
  interior: number;
  /** District grid street width, metres. */
  streetWidth: number;
  /** Metres from the nearest driving line. Large when the graph has no edge. */
  laneDist: number;
  edgeKind: 'street' | 'canyon' | 'freeway' | 'none';
  /** Added to terrain. Negative in a sunken freeway. */
  deck: number;
  freewayDist: number;
  freewayWidth: number;
  freewayDepth: number;
  canyon: number;
  industrial: number;
  neon: number;
  /** 0..1, 1 under a kit awning. */
  awningNear: number;
  /** 0..1 cloth canopies close to the listener (crowd umbrellas, or the walker's own). */
  umbrella: number;
  /** 0..1 sea-wall wash. The storm bed is elsewhere; this only ducks the city rain. */
  storm: number;
  surf: number;
  /** 0..1 proximity of the nearest street sign. */
  signNear: number;
  signX: number;
  signY: number;
  signZ: number;
  district: string;
  /** Seconds on the audio clock. Sirens read this. */
  time: number;
}

export interface SurfaceWeights {
  metal: number;
  glass: number;
  concrete: number;
  puddle: number;
  fabric: number;
  umbrella: number;
}

export interface SpaceEar {
  kind: SpaceKind;
  /** First slap, seconds. */
  early: number;
  /** Scales the later combs. */
  scale: number;
  feedback: number;
  dampHz: number;
  wet: number;
  /** 0..1 extra low emphasis under a lid. */
  lid: number;
  /** Direct-path low-pass. A deck or a room darkens the rain itself, not only the tail. */
  airHz: number;
}

export interface Occlusion {
  gain: number;
  hz: number;
  hits: number;
}

export interface SirenEar {
  on: boolean;
  x: number;
  y: number;
  z: number;
  gain: number;
  freq: number;
  closing: number;
  ratio: number;
}

export interface AudioTierPlan {
  surfaces: number;
  combs: number;
  allpasses: number;
  siren: boolean;
  hum: boolean;
  /** Impact-envelope voices. One voice; dripInterval sets the rate. */
  drips: number;
  hrtf: boolean;
  occlusion: OcclusionMode;
  occSteps: number;
}

export const TIER_PLAN: Record<Tier, AudioTierPlan> = {
  low: { surfaces: 1, combs: 0, allpasses: 0, siren: false, hum: false, drips: 0, hrtf: false, occlusion: 'off', occSteps: 0 },
  medium: { surfaces: 3, combs: 1, allpasses: 0, siren: true, hum: true, drips: 1, hrtf: false, occlusion: 'gain', occSteps: 4 },
  high: { surfaces: 6, combs: 4, allpasses: 1, siren: true, hum: true, drips: 1, hrtf: true, occlusion: 'lowpass', occSteps: 8 },
  ultra: { surfaces: 6, combs: 4, allpasses: 2, siren: true, hum: true, drips: 1, hrtf: true, occlusion: 'lowpass', occSteps: 12 },
};

/**
 * Decoded AudioBuffer sizes the beds already allocate, in seconds.
 * The living layer is not in this list. Float32, so bytes = seconds * channels * 4 * sampleRate.
 * Storm rows are the D6 wash, breaker and thunder. They stay.
 */
export const DECODED_PLAN: readonly { name: string; seconds: number; channels: number; owner: 'bed' | 'storm' | 'city' }[] = [
  { name: 'rain-hiss', seconds: 4, channels: 2, owner: 'bed' },
  { name: 'patter', seconds: 3, channels: 2, owner: 'bed' },
  { name: 'city-rumble', seconds: 6, channels: 2, owner: 'bed' },
  { name: 'machinery', seconds: 8, channels: 2, owner: 'bed' },
  { name: 'wind', seconds: 5, channels: 2, owner: 'bed' },
  { name: 'tyre', seconds: 3, channels: 2, owner: 'bed' },
  { name: 'traffic-rumble', seconds: 5, channels: 2, owner: 'bed' },
  { name: 'room', seconds: 4, channels: 2, owner: 'bed' },
  { name: 'surf-wash', seconds: 6, channels: 2, owner: 'storm' },
  { name: 'surf-impact', seconds: 2, channels: 2, owner: 'storm' },
  { name: 'thunder', seconds: 3, channels: 2, owner: 'storm' },
  { name: 'white-shared', seconds: 2, channels: 1, owner: 'city' },
  { name: 'brown-shared', seconds: 4, channels: 2, owner: 'city' },
  { name: 'tongue-0', seconds: 4, channels: 1, owner: 'city' },
  { name: 'tongue-1', seconds: 4, channels: 1, owner: 'city' },
  { name: 'tongue-2', seconds: 4, channels: 1, owner: 'city' },
  { name: 'tongue-3', seconds: 4, channels: 1, owner: 'city' },
];

export interface MemoryTier {
  tier: Tier;
  decodedBytes: number;
  livingDecodedBytes: number;
  stormDecodedBytes: number;
  bedDecodedBytes: number;
  cityDecodedBytes: number;
  /** Second BufferSource on the shared white buffer. Not a new decode. */
  extraSources: number;
  plan: AudioTierPlan;
}

const ZERO_WEIGHTS: SurfaceWeights = { metal: 0, glass: 0, concrete: 0, puddle: 0, fabric: 0, umbrella: 0 };

export function hearDefaults(over: Partial<HearInput> = {}): HearInput {
  return {
    x: 0, z: 0, y: 2, alt: 1.7, rain: 0.8, interior: 0,
    streetWidth: 18, laneDist: 3, edgeKind: 'street', deck: 0,
    freewayDist: 500, freewayWidth: 70, freewayDepth: 0,
    canyon: 0.2, industrial: 0.1, neon: 0.3,
    awningNear: 0, umbrella: 0, storm: 0, surf: 0,
    signNear: 0, signX: 0, signY: 3, signZ: 0,
    district: 'basin-sprawl', time: 0,
    ...over,
  };
}

export function dopplerRatio(closing: number, c = 340): number {
  if (!Number.isFinite(closing)) return 1;
  const v = Math.max(-90, Math.min(90, closing));
  const ratio = c / Math.max(40, c - v);
  return Math.max(0.75, Math.min(1.35, ratio));
}

/** Full below 30 m, gone by 520 m. Matches the rain bed's altitude close. */
export function altitudeClose(alt: number): number {
  if (!Number.isFinite(alt)) return 0;
  const linear = alt < 30 ? 1 : alt < 520 ? (520 - alt) / 490 : 0;
  return linear ** 1.25;
}

export function underFreeway(p: HearInput): boolean {
  const eyeAboveDeck = p.alt - p.deck;
  const inTrench = p.edgeKind === 'freeway' && p.deck < -3 && eyeAboveDeck < 6;
  const inCut = p.freewayDepth > 3 && p.freewayDist < p.freewayWidth * 0.5 && p.alt < 1;
  return inTrench || inCut;
}

export function surfaceWeights(p: HearInput): SurfaceWeights {
  const rain = clamp01(p.rain);
  if (rain < 0.02) return { ...ZERO_WEIGHTS };
  const open = 1 - 0.85 * clamp01(p.interior);
  const storm = clamp01(Math.max(p.storm, p.surf));
  const freeway = underFreeway(p) ? 1 : p.freewayDist < 28 && p.freewayDepth > 3 ? 0.35 : 0;
  const onStreet = p.laneDist < Math.max(4, p.streetWidth * 0.55) ? 1 : 0.4;
  let metal = freeway * 0.9 + clamp01(p.industrial) * 0.5 + clamp01(p.signNear) * 0.28;
  let glass = clamp01(p.neon) * 0.75 * (1 - freeway * 0.55);
  let fabric = clamp01(p.awningNear);
  let umbrella = clamp01(p.umbrella) * (1 - fabric * 0.85);
  let puddle = onStreet * (0.4 + 0.6 * rain) * (1 - fabric) * (1 - freeway * 0.5);
  let concrete = 0.62 + (1 - onStreet) * 0.2 + freeway * 0.45;
  if (storm > 0.15) {
    puddle *= 1 - 0.8 * storm;
    metal *= 1 - 0.35 * storm;
    fabric *= 1 - 0.45 * storm;
    umbrella *= 1 - 0.3 * storm;
    concrete = concrete * (1 - 0.25 * storm) + 0.35 * storm;
  }
  const scale = open * rain;
  return normalizeWeights({
    metal: metal * scale,
    glass: glass * scale,
    concrete: concrete * scale,
    puddle: puddle * scale,
    fabric: fabric * scale,
    umbrella: umbrella * scale,
  });
}

export function dominantSurface(w: SurfaceWeights): SurfaceId {
  let best: SurfaceId = 'concrete';
  let n = -1;
  for (const id of SURFACES) {
    const v = w[id];
    if (v > n) {
      n = v;
      best = id;
    }
  }
  return best;
}

export function spaceEar(p: HearInput): SpaceEar {
  const interior = clamp01(p.interior);
  if (interior > 0.55) {
    return {
      kind: 'interior',
      early: 0.016 + (1 - interior) * 0.012,
      scale: 0.45,
      feedback: 0.22,
      dampHz: 640,
      wet: 0.16 * (1 - 0.25 * interior),
      lid: 0.8,
      airHz: 880,
    };
  }
  if (underFreeway(p)) {
    return { kind: 'freeway', early: 0.009, scale: 0.35, feedback: 0.5, dampHz: 380, wet: 0.55, lid: 1, airHz: 460 };
  }
  if (p.alt > 70 || p.laneDist > 36) {
    return { kind: 'open', early: 0.045, scale: 1, feedback: 0.16, dampHz: 4200, wet: 0.05, lid: 0, airHz: 16000 };
  }
  const width = Math.max(6, p.streetWidth || 16);
  const canyon = clamp01(p.canyon);
  const narrow = width < 14 || (canyon > 0.72 && width <= 20);
  const gap = narrow ? Math.max(5, Math.min(width, 12)) : Math.max(16, Math.min(width, 48));
  if (narrow) {
    return {
      kind: 'alley',
      // 2W/c for a 7 m street is 41 ms. This graph drops a delay that short,
      // so the alley slap is held at 50 ms, the round trip of an 8.5 m gap.
      early: Math.max(0.05, (2 * gap) / 340),
      scale: 0.68,
      feedback: 0.7,
      dampHz: 2800,
      wet: 0.85,
      lid: 0.2,
      airHz: 5000,
    };
  }
  return {
    kind: 'boulevard',
    early: (2 * gap) / 340,
    scale: 1.15 + Math.min(0.4, width / 120),
    feedback: 0.28,
    dampHz: 4200,
    wet: 0.22,
    lid: 0,
    airHz: 12500,
  };
}

export function occlusionOf(hits: number, dist: number, mode: OcclusionMode): Occlusion {
  if (mode === 'off' || !Number.isFinite(dist) || dist < 4 || hits <= 0) {
    return { gain: 1, hz: 18000, hits: 0 };
  }
  const n = Math.max(0, Math.min(4, hits));
  return {
    gain: 1 / (1 + 0.9 * n),
    hz: mode === 'lowpass' ? Math.max(380, 5200 / (1 + 2.2 * n)) : 18000,
    hits: n,
  };
}

/**
 * How many solid runs the segment crosses. `blocked` is a lot or a landmark footprint.
 * Endpoints are skipped so the source's own building does not count.
 */
export function occlusionHits(
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  steps: number,
  blocked: (x: number, y: number, z: number) => boolean,
): number {
  if (steps <= 0) return 0;
  if (y0 > 70 && y1 > 70) return 0;
  const dist = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  if (dist < 4) return 0;
  let hits = 0;
  let run = 0;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const solid = blocked(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t);
    if (solid) {
      if (run === 0) hits++;
      run++;
    } else run = 0;
  }
  return hits;
}

/** True when (x, z) sits in the block interior, off the street grid lines. */
export function gridLotSolid(
  x: number, z: number,
  ax: number, az: number, bx: number, bz: number,
  blockA: number, blockB: number, street: number,
): boolean {
  if (blockA < 4 || blockB < 4) return false;
  const s = (x * ax + z * az) / blockA;
  const t = (x * bx + z * bz) / blockB;
  const fs = Math.abs(s - Math.round(s)) * blockA;
  const ft = Math.abs(t - Math.round(t)) * blockB;
  return fs >= street * 0.5 && ft >= street * 0.5;
}

export interface Column {
  x: number;
  z: number;
  hw: number;
  hd: number;
  c: number;
  s: number;
  top: number;
}

export function columnSolid(col: Column, x: number, y: number, z: number): boolean {
  if (y > col.top) return false;
  const dx = x - col.x;
  const dz = z - col.z;
  const lx = dx * col.c - dz * col.s;
  const lz = dx * col.s + dz * col.c;
  return Math.abs(lx) <= col.hw && Math.abs(lz) <= col.hd;
}

/** District fill, raised when people are standing within the close ring. Never above 1, never below `presence`. */
export function crowdDensity(presence: number, nearby: number): number {
  const p = clamp01(presence);
  const local = Math.min(1, Math.max(0, nearby) / 6);
  return Math.min(1, Math.max(p, p * 0.5 + local * 0.85));
}

export function nearbyPeople(
  life: readonly { x: number; z: number; n: number }[],
  x: number, z: number, radius = 18,
): number {
  let n = 0;
  const r2 = radius * radius;
  for (const s of life) {
    const dx = s.x - x;
    const dz = s.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r2) continue;
    n += s.n * (1 - Math.sqrt(d2) / radius);
  }
  return n;
}

export function surfaceLevel(p: HearInput, tier: Tier): number {
  const sky = altitudeClose(p.alt);
  const storm = clamp01(Math.max(p.storm, p.surf));
  const base = tier === 'low' ? 0.032 : tier === 'medium' ? 0.048 : 0.058;
  return clamp01(p.rain) * (1 - 0.8 * clamp01(p.interior)) * (1 - 0.62 * storm) * sky * base;
}

export function dripInterval(w: SurfaceWeights, rain: number): number {
  const hard = w.metal + w.glass;
  const soft = w.fabric + w.umbrella;
  const wet = w.puddle + w.concrete * 0.35;
  const rate = clamp01(rain) * (hard * 8 + wet * 4.5 + soft * 1.6);
  if (rate < 0.35) return 1.4;
  return Math.max(0.07, Math.min(0.8, 1 / rate));
}

export function sirenEar(p: HearInput, enabled: boolean): SirenEar {
  const off: SirenEar = { on: false, x: p.x, y: p.y, z: p.z, gain: 0, freq: 680, closing: 0, ratio: 1 };
  if (!enabled || !Number.isFinite(p.time)) return off;
  const period = 52;
  const local = ((p.time % period) + period) % period;
  if (local > 8) return off;
  const cycle = Math.floor(p.time / period);
  const h = hash2i(hashString(p.district || 'city'), cycle, 2049);
  const angle = (h % 6283) / 1000;
  const speed = 34;
  const along = (local - 4) * speed;
  const px = p.x + Math.cos(angle) * 240 + Math.sin(angle) * along;
  const pz = p.z + Math.sin(angle) * 240 - Math.cos(angle) * along;
  const vx = Math.sin(angle) * speed;
  const vz = -Math.cos(angle) * speed;
  const dx = p.x - px;
  const dz = p.z - pz;
  const mag = Math.hypot(dx, dz) || 1;
  const closing = (vx * dx + vz * dz) / mag;
  const ratio = dopplerRatio(closing);
  const wail = 620 + 160 * (0.5 + 0.5 * Math.sin(local * Math.PI * 2 * 0.35));
  const fall = 1 / (1 + (mag / 170) ** 2);
  const env = local < 0.35 ? local / 0.35 : local > 7.3 ? Math.max(0, (8 - local) / 0.7) : 1;
  return {
    on: env > 0.02,
    x: px,
    y: p.y + 6,
    z: pz,
    gain: 0.2 * fall * env,
    freq: wail * ratio,
    closing,
    ratio,
  };
}

export interface LivingFrame {
  weights: SurfaceWeights;
  space: SpaceEar;
  level: number;
  impact: number;
  interval: number;
  dominant: SurfaceId;
  siren: SirenEar;
  hum: number;
  signX: number;
  signY: number;
  signZ: number;
  wet: number;
}

export function evaluateLiving(p: HearInput, tier: Tier): LivingFrame {
  const plan = TIER_PLAN[tier];
  const weights = surfaceWeights(p);
  const space = spaceEar(p);
  const level = surfaceLevel(p, tier);
  const dominant = dominantSurface(weights);
  const tone = SURFACE_TONE[dominant];
  const impact = plan.drips > 0 ? level * 5.2 * tone.impact : 0;
  const siren = sirenEar(p, plan.siren && p.interior < 0.75 && p.alt < 180);
  const hum = plan.hum ? clamp01(p.signNear) * clamp01(p.neon) * 0.045 * (1 - 0.7 * clamp01(p.interior)) * altitudeClose(p.alt) : 0;
  return {
    weights,
    space,
    level,
    impact,
    interval: dripInterval(weights, p.rain),
    dominant,
    siren,
    hum,
    signX: p.signX,
    signY: p.signY,
    signZ: p.signZ,
    wet: space.wet * (level > 0.004 ? 1 : 0),
  };
}

/** Grouped tones for the 1- and 3-filter tiers. Six filters use SURFACE_TONE directly. */
export function surfaceVoices(w: SurfaceWeights, count: number): Array<{ gain: number; type: BiquadFilterType; freq: number; q: number; body: number }> {
  if (count >= 6) {
    return SURFACES.map((id) => ({ gain: w[id], ...SURFACE_TONE[id] }));
  }
  if (count >= 3) {
    return [
      mixVoice(w, ['metal', 'glass']),
      mixVoice(w, ['concrete', 'puddle']),
      mixVoice(w, ['fabric', 'umbrella']),
    ];
  }
  const id = dominantSurface(w);
  const sum = SURFACES.reduce((s, k) => s + w[k], 0);
  return [{ gain: sum, ...SURFACE_TONE[id] }];
}

export function decodedBytes(sampleRate: number): MemoryTier['decodedBytes'] {
  return memoryFor('medium', sampleRate).decodedBytes;
}

export function memoryFor(tier: Tier, sampleRate: number): MemoryTier {
  const sr = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 44100;
  let bed = 0;
  let storm = 0;
  let city = 0;
  for (const row of DECODED_PLAN) {
    const bytes = row.seconds * row.channels * 4 * sr;
    if (row.owner === 'storm') storm += bytes;
    else if (row.owner === 'city') city += bytes;
    else bed += bytes;
  }
  return {
    tier,
    decodedBytes: bed + storm + city,
    livingDecodedBytes: 0,
    stormDecodedBytes: storm,
    bedDecodedBytes: bed,
    cityDecodedBytes: city,
    extraSources: 1,
    plan: TIER_PLAN[tier],
  };
}

export function bufferBytes(buffers: readonly AudioBuffer[]): number {
  const seen = new Set<AudioBuffer>();
  let n = 0;
  for (const b of buffers) {
    if (!b || seen.has(b)) continue;
    seen.add(b);
    n += b.length * b.numberOfChannels * 4;
  }
  return n;
}

/** Failures, empty when the model holds. No audio context. */
export function livingSelfCheck(): string[] {
  const fail: string[] = [];
  const expect = (cond: boolean, msg: string) => {
    if (!cond) fail.push(msg);
  };
  const rain = surfaceWeights(hearDefaults({ rain: 1, streetWidth: 34, neon: 0.2, industrial: 0 }));
  const sum = SURFACES.reduce((s, id) => s + rain[id], 0);
  expect(Math.abs(sum - 1) < 1e-3, `weights sum ${sum}`);
  expect(surfaceWeights(hearDefaults({ rain: 0 })).concrete === 0, 'dry is silent');
  const metal = surfaceWeights(hearDefaults({
    rain: 1, edgeKind: 'freeway', deck: -8, alt: -4, freewayDepth: 8, freewayDist: 10, industrial: 0.9, neon: 0,
  }));
  const glass = surfaceWeights(hearDefaults({ rain: 1, neon: 1, industrial: 0, streetWidth: 34, signNear: 0.2 }));
  expect(metal.metal > glass.metal, 'freeway metal louder than a glass street');
  expect(glass.glass > metal.glass, 'neon street is glassier');
  const awning = surfaceWeights(hearDefaults({ rain: 1, awningNear: 1, streetWidth: 7 }));
  expect(awning.fabric > 0.45, 'awning is fabric');
  const umb = surfaceWeights(hearDefaults({ rain: 1, umbrella: 1, awningNear: 0, streetWidth: 18 }));
  expect(umb.umbrella > 0.3, 'umbrellas weigh the cloth');
  const dryPuddle = surfaceWeights(hearDefaults({ rain: 1, streetWidth: 20, laneDist: 2 }));
  const stormPuddle = surfaceWeights(hearDefaults({ rain: 1, streetWidth: 20, laneDist: 2, storm: 1, surf: 1 }));
  expect(stormPuddle.puddle < dryPuddle.puddle, 'storm ducks puddle splash');
  const alley = spaceEar(hearDefaults({ streetWidth: 7, canyon: 0.3, laneDist: 2, alt: 1.7 }));
  const wide = spaceEar(hearDefaults({ streetWidth: 38, canyon: 0.4, laneDist: 4, alt: 1.7 }));
  const lid = spaceEar(hearDefaults({ edgeKind: 'freeway', deck: -8.6, alt: -5, freewayDepth: 8.6, freewayDist: 8 }));
  const room = spaceEar(hearDefaults({ interior: 0.9 }));
  expect(alley.kind === 'alley' && wide.kind === 'boulevard', 'street kinds');
  expect(alley.early < wide.early, 'alley slap is shorter than a boulevard');
  expect(lid.kind === 'freeway' && lid.dampHz < wide.dampHz, 'freeway lid is darker');
  expect(lid.airHz < room.airHz && room.airHz < alley.airHz && alley.airHz < wide.airHz, 'direct path darkens under a lid');
  expect(room.kind === 'interior' && room.wet < alley.wet, 'interior wet is quieter');
  expect(TIER_PLAN.high.drips === 1 && TIER_PLAN.ultra.drips === 1, 'one impact voice on the full tiers');
  expect(occlusionOf(2, 20, 'off').gain === 1, 'low tier ignores occlusion');
  expect(occlusionOf(2, 20, 'gain').gain < 0.7, 'occlusion cuts gain');
  expect(occlusionOf(2, 20, 'lowpass').hz < 2000, 'occlusion low-passes');
  expect(occlusionOf(0, 10, 'lowpass').gain === 1, 'clear line stays open');
  const blocked = (x: number) => x > 2 && x < 8;
  const hits = occlusionHits(0, 1, 0, 12, 1, 0, 8, (x) => blocked(x));
  expect(hits === 1, `one building, one hit (${hits})`);
  expect(dopplerRatio(40) > 1.1 && dopplerRatio(-40) < 0.92 && dopplerRatio(0) === 1, 'doppler sides');
  expect(crowdDensity(1, 0) === 1, 'full district stays full');
  expect(crowdDensity(0.15, 8) > crowdDensity(0.15, 0), 'a close crowd raises a thin district');
  expect(crowdDensity(0.2, 0) >= 0.2, 'density does not fall through the district fill');
  const approach = sirenEar(hearDefaults({ time: 3.2, district: 'dtla' }), true);
  const leave = sirenEar(hearDefaults({ time: 5.2, district: 'dtla' }), true);
  expect(approach.on && approach.ratio > 1 && leave.ratio < 1, 'siren approaches then leaves');
  expect(!sirenEar(hearDefaults({ time: 3 }), false).on, 'low tier has no siren');
  for (const tier of ['low', 'medium', 'high', 'ultra'] as const) {
    const mem = memoryFor(tier, 44100);
    expect(mem.livingDecodedBytes === 0, `${tier} living decode is 0`);
    expect(mem.stormDecodedBytes > 0, `${tier} keeps the storm buffers`);
  }
  expect(TIER_PLAN.low.surfaces < TIER_PLAN.high.surfaces, 'low uses fewer surface filters');
  expect(TIER_PLAN.low.combs === 0 && TIER_PLAN.ultra.combs === 4, 'reverb scales with tier');
  expect(TIER_PLAN.medium.occlusion === 'gain' && TIER_PLAN.ultra.hrtf, 'medium skips HRTF');
  const bytes = memoryFor('high', 44100).decodedBytes;
  expect(bytes > 8_000_000 && bytes < 40_000_000, `decoded bytes ${bytes}`);
  return fail;
}

function mixVoice(w: SurfaceWeights, ids: SurfaceId[]): { gain: number; type: BiquadFilterType; freq: number; q: number; body: number } {
  let gain = 0;
  let freq = 0;
  let q = 0;
  let body = 0;
  for (const id of ids) gain += w[id];
  if (gain < 1e-5) {
    const tone = SURFACE_TONE[ids[0]!];
    return { gain: 0, type: tone.type, freq: tone.freq, q: tone.q, body: tone.body };
  }
  for (const id of ids) {
    const tone = SURFACE_TONE[id];
    const share = w[id] / gain;
    freq += tone.freq * share;
    q += tone.q * share;
    body += tone.body * share;
  }
  const lead = w[ids[0]!] >= w[ids[1]!] ? ids[0]! : ids[1]!;
  return { gain, type: SURFACE_TONE[lead].type, freq, q, body };
}

function normalizeWeights(w: SurfaceWeights): SurfaceWeights {
  let sum = 0;
  for (const id of SURFACES) sum += w[id];
  if (sum < 1e-6) return { ...ZERO_WEIGHTS };
  const out = { ...w };
  for (const id of SURFACES) out[id] = w[id] / sum;
  return out;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
