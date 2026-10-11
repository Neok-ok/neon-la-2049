// Window tier policy. Lives beside the quality table and does not change crowd, traffic or rain counts.
// Low compiles the flat facade. Medium and up compile the living shader; `on` is a uniform so a
// debug toggle does not rebuild, except low → on, which has to compile the living graph first.
import { uniform } from 'three/tsl';
import { Vector3 } from 'three/webgpu';
import type { Tier } from '../../core/quality';

export interface WindowTierSpec {
  /** Compile the parallax graph. Low stays on today's flat panes. */
  detail: boolean;
  /** 0 flat, 1 parallax + rain, 2 parallax + rain + silhouettes. */
  mode: number;
  /** Parallax fades out by this distance (m). 0 disables it. */
  range: number;
  /** Rain streaks on glass, metres. 0 disables them. */
  rainRange: number;
  /** Silhouettes, metres. 0 disables them. */
  silRange: number;
}

export const WINDOW_TIER: Record<Tier, WindowTierSpec> = {
  low: { detail: false, mode: 0, range: 0, rainRange: 0, silRange: 0 },
  medium: { detail: true, mode: 1, range: 52, rainRange: 38, silRange: 0 },
  high: { detail: true, mode: 2, range: 420, rainRange: 160, silRange: 100 },
  ultra: { detail: true, mode: 2, range: 640, rainRange: 220, silRange: 160 },
};

const FAR = 1e9;

export const W = {
  on: uniform(0),
  mode: uniform(0),
  range: uniform(0),
  rainRange: uniform(0),
  silRange: uniform(0),
  /** World-space radius that picks up a hero room. About one or two cells. */
  radius: uniform(3.8),
  hero0: uniform(new Vector3(FAR, FAR, FAR)),
  hero1: uniform(new Vector3(FAR, FAR, FAR)),
  hero2: uniform(new Vector3(FAR, FAR, FAR)),
};

let lastTier: Tier = 'low';
let compiledLiving = false;

export function markWindowDetail(living: boolean): void {
  compiledLiving = living;
}

export function windowDetailCompiled(): boolean {
  return compiledLiving;
}

export function applyWindowTier(tier: Tier): WindowTierSpec {
  const spec = WINDOW_TIER[tier];
  lastTier = tier;
  W.mode.value = spec.mode;
  W.range.value = spec.range;
  W.rainRange.value = spec.rainRange;
  W.silRange.value = spec.silRange;
  W.on.value = spec.detail ? 1 : 0;
  return spec;
}

export function setWindowCutoff(metres: number): number {
  const m = Math.max(0, metres);
  W.range.value = m;
  return m;
}

export function windowState(): {
  on: boolean;
  detail: boolean;
  tier: Tier;
  mode: number;
  range: number;
  rainRange: number;
  silRange: number;
  radius: number;
} {
  return {
    on: Number(W.on.value) > 0.5,
    detail: compiledLiving,
    tier: lastTier,
    mode: Number(W.mode.value),
    range: Number(W.range.value),
    rainRange: Number(W.rainRange.value),
    silRange: Number(W.silRange.value),
    radius: Number(W.radius.value),
  };
}
