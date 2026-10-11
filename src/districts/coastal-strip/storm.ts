// Sea-wall storm switches. The weather preset and `__nla.storm` both write `stormCtl`.
// The frame loop publishes `stormSnap`. Nothing here allocates a mesh.
import { hash2i } from '../../core/rng';
import type { CityLayout } from '../../world/layout';
import { frameAt, framePoint, nearestWall, wallPieces, type WallProfile } from './profile';

export interface StormCtl {
  /** null follows the Sea Wall Storm preset. */
  force: boolean | null;
  /** null derives 0..1 from rain and wind. */
  intensity: number | null;
  /** null is on when the storm is on and intensity is past the sheet threshold. */
  overtop: boolean | null;
  /** Reduced flash. Default on. */
  gentle: boolean;
}

export const stormCtl: StormCtl = {
  force: null,
  intensity: null,
  overtop: null,
  gentle: true,
};

export interface StormSnap {
  on: boolean;
  intensity: number;
  phase: number;
  period: number;
  impact: number;
  spray: number;
  overtop: boolean;
  gentle: boolean;
  flash: number;
  paused: boolean;
  near: number;
  /** Swell, spray, sheets. 0 when the coast is quiet or the tier is low. */
  draws: number;
  tris: number;
}

export const stormSnap: StormSnap = {
  on: false,
  intensity: 0,
  phase: 0,
  period: 9.2,
  impact: 0,
  spray: 0,
  overtop: false,
  gentle: true,
  flash: 0,
  paused: false,
  near: 0,
  draws: 0,
  tris: 0,
};

export interface StormDrive {
  on: boolean;
  intensity: number;
  overtop: boolean;
  windDir: number;
  paused: boolean;
}

/** Dark blue-grey hue multiply. Luminance stays under 1 so the streets stay black. */
export const STORM_TINT = { r: 0.78, g: 0.9, b: 1.16 };

export function resolveStorm(preset: boolean, rain: number, wind: number): Pick<StormDrive, 'on' | 'intensity' | 'overtop'> {
  const on = stormCtl.force ?? preset;
  const derived = Math.max(0, Math.min(1, rain * 0.55 + Math.min(wind, 16) / 22));
  const intensity = stormCtl.intensity ?? (on ? Math.max(0.82, derived) : derived);
  const overtop = stormCtl.overtop ?? (on && intensity > 0.45);
  return { on, intensity: Math.max(0, Math.min(1, intensity)), overtop: overtop && on };
}

export function applyStormTint<T extends { tintR: number; tintG: number; tintB: number; tintMix: number }>(
  sample: T, near: number, on: boolean, intensity: number,
): T {
  if (!on || near <= 0) return sample;
  const k = Math.min(1, near) * Math.min(1, intensity) * 0.7;
  return {
    ...sample,
    tintR: sample.tintR * (1 - k + STORM_TINT.r * k),
    tintG: sample.tintG * (1 - k + STORM_TINT.g * k),
    tintB: sample.tintB * (1 - k + STORM_TINT.b * k),
    tintMix: sample.tintMix + (0.28 - sample.tintMix) * k * 0.55,
  };
}

const GENTLE_PERIOD = 28;
const FULL_PERIOD = 15;

let flashWasOn = false;

/**
 * One short flash per period, from the shared clock. `strike` is the rising edge,
 * so thunder is cued once. Gentle is the default: lower cap, longer gap.
 */
export function sampleCoastalFlash(time: number, gentle: boolean, enabled: boolean): { flash: number; strike: boolean } {
  if (!enabled) {
    flashWasOn = false;
    return { flash: 0, strike: false };
  }
  const period = gentle ? GENTLE_PERIOD : FULL_PERIOD;
  const half = gentle ? 0.16 : 0.22;
  const u = ((time % period) + period) % period;
  const center = period * 0.73;
  const d = Math.abs(u - center);
  const on = d < half;
  const env = on ? Math.cos((d / half) * Math.PI * 0.5) ** 2 : 0;
  const cap = gentle ? 0.18 : 0.4;
  const strike = on && !flashWasOn;
  flashWasOn = on;
  return { flash: env * cap, strike };
}

/** Seconds after the flash. Distant, so the picture leads the sound. */
export function thunderDelay(time: number, gentle: boolean): number {
  const period = gentle ? GENTLE_PERIOD : FULL_PERIOD;
  const n = Math.floor(Math.max(0, time) / period);
  const h = hash2i(n, 6, 11) % 1000;
  return 0.55 + (h / 1000) * 0.95;
}

/**
 * Across-coordinate on the seaward face at height y.
 * The landward batter also crosses these heights; the last seaward hit is the face.
 */
export function seawardAcross(profile: WallProfile, y: number): number {
  const pts = profile.pts;
  const minA = profile.crest / 2 - 0.5;
  let last = profile.crest / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const a0 = pts[i]![0];
    const y0 = pts[i]![1];
    const a1 = pts[i + 1]![0];
    const y1 = pts[i + 1]![1];
    if (a0 < minA && a1 < minA) continue;
    if (Math.abs(y1 - y0) < 0.08) {
      if (Math.abs(y - y0) < 0.4) last = Math.max(a0, a1);
      continue;
    }
    const hi = Math.max(y0, y1);
    const lo = Math.min(y0, y1);
    if (y > hi + 0.02 || y < lo - 0.02) continue;
    const t = Math.max(0, Math.min(1, (y - y0) / (y1 - y0)));
    const a = a0 + (a1 - a0) * t;
    if (a >= minA - 1) last = a;
  }
  return last;
}

export interface CoastLamp {
  x: number;
  y: number;
  z: number;
}

/** Crest work lamps already in the wall mesh. Nearest first. No new lights. */
export function coastWorkLights(layout: CityLayout, x: number, z: number, max: number): CoastLamp[] {
  if (max <= 0) return [];
  const hit = nearestWall(layout, x, z);
  if (hit.dist > 380) return [];
  const out: { x: number; y: number; z: number; d2: number }[] = [];
  const step = hit.piece.harbor ? 64 : 28;
  for (const piece of wallPieces(layout)) {
    if (piece.wallId !== hit.piece.wallId || piece.harbor) continue;
    if (Math.hypot(piece.frame.x - x, piece.frame.z - z) > 160) continue;
    const start = Math.ceil((piece.chain0 + 6) / step) * step;
    for (let c = start; c < piece.chain0 + piece.len - 4; c += step) {
      const fr = frameAt(piece, (c - piece.chain0) / piece.len);
      const p = framePoint(fr, piece.profile.crest / 2 - 6, 0);
      const y = piece.profile.H + 4.25;
      out.push({ x: p.x, y, z: p.z, d2: (p.x - x) ** 2 + (p.z - z) ** 2 });
    }
  }
  out.sort((a, b) => a.d2 - b.d2);
  return out.slice(0, max).map(({ x: lx, y, z: lz }) => ({ x: lx, y, z: lz }));
}
