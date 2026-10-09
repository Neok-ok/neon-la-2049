// Promote the blockout's large kind-2 billboards into hologram candidates.
// The cheap sign panel stays in the chunk (it is the "screen"). The figure floats just in front of it.
// Small market headers stay signs: only panels of at least 140 m² qualify, which is the far-LOD billboard cut.
import { SIGN_STRIDE } from '../fabric/mesher';
import type { HoloDesignId, HologramSpec } from './types';

const FIGURES: HoloDesignId[] = ['ash-crane', 'ribbon-column', 'coil-vendor'];
const MIN_AREA = 140;

export function hologramsFromSignBuffer(key: string, x0: number, z0: number, signs: Float32Array, n: number): HologramSpec[] {
  const out: HologramSpec[] = [];
  for (let i = 0; i < n; i++) {
    const o = i * SIGN_STRIDE;
    if (signs[o + 8] < 1.5) continue;
    const w = signs[o + 4];
    const h = signs[o + 5];
    if (w * h < MIN_AREA) continue;
    const yaw = signs[o + 3];
    const nx = Math.sin(yaw);
    const nz = Math.cos(yaw);
    const gap = Math.max(1.6, Math.min(3.5, h * 0.05));
    const seed = signs[o + 7];
    const design = FIGURES[Math.min(FIGURES.length - 1, Math.floor(Math.abs(seed) * FIGURES.length))] ?? 'ash-crane';
    out.push({
      id: `bb:${key}:${i}`,
      x: signs[o] + x0 + nx * gap,
      y: signs[o + 1],
      z: signs[o + 2] + z0 + nz * gap,
      yaw,
      w: w * 0.72,
      h: h * 0.8,
      design,
      color: Math.max(0, Math.round(signs[o + 6])),
      seed: seed - Math.floor(seed),
      rank: 2,
      band: h >= 18 || w * h >= 320 ? 'tower' : 'street',
      spill: Math.min(26, Math.max(8, h * 0.32)),
    });
  }
  return out;
}
