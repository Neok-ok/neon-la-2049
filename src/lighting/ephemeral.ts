// Signs, holograms and the room the walker is standing in. Rebuilt every frame.
import type { GlowMark } from '../atmosphere/AirField.ts';
import type { InteriorLight } from '../world/interiors/types.ts';
import { NITS, preset } from './presets.ts';
import type { PresetId } from './presets.ts';
import type { PunctualInput } from './validate.ts';
import type { RGB } from './units.ts';

function clampCd(id: PresetId, candela: number): number {
  const band = preset(id);
  if (!Number.isFinite(candela)) return band.candela;
  return Math.min(band.cdMax, Math.max(band.cdMin, candela));
}

function peak1(r: number, g: number, b: number): RGB | null {
  if (![r, g, b].every((v) => Number.isFinite(v) && v >= 0)) return null;
  const peak = Math.max(r, g, b);
  if (peak <= 0) return null;
  return [r / peak, g / peak, b / peak];
}

function interiorPreset(rgb: RGB): PresetId {
  const [r, g, b] = rgb;
  if (r > g + 0.15 && b < 0.28 && r > 0.55) return 'interior-sodium';
  if (r > b + 0.12 && g >= b) return 'interior-tungsten';
  return 'interior-fluorescent';
}

export function ephemeralLights(frame: {
  signs: readonly GlowMark[];
  holos: readonly GlowMark[];
  interior: readonly InteriorLight[];
}): PunctualInput[] {
  const out: PunctualInput[] = [];
  for (const s of frame.signs) {
    const rgb = peak1(s.r, s.g, s.b);
    if (!rgb) continue;
    const area = Math.max(0, s.area);
    out.push({
      preset: 'neon-sign',
      x: s.x, y: s.y, z: s.z,
      rgb,
      candela: clampCd('neon-sign', Math.min(2200, NITS.sign * area / 4)),
      range: Math.min(36, Math.max(8, 10 + Math.sqrt(area))),
    });
  }
  for (const h of frame.holos) {
    const rgb = peak1(h.r, h.g, h.b);
    if (!rgb) continue;
    const area = Math.max(0, h.area);
    out.push({
      preset: 'hologram',
      x: h.x, y: h.y, z: h.z,
      rgb,
      candela: clampCd('hologram', Math.min(1800, NITS.hologram * area / 4)),
      range: Math.min(18, Math.max(5, 6 + Math.sqrt(area))),
    });
  }
  for (const L of frame.interior) {
    const rgb = peak1(L.color[0], L.color[1], L.color[2]);
    if (!rgb) continue;
    const id = interiorPreset(L.color);
    out.push({
      preset: id,
      x: L.x, y: L.y, z: L.z,
      rgb,
      candela: clampCd(id, L.intensity * 70),
      range: Math.min(preset(id).range * 1.4, Math.max(2.5, L.range)),
    });
  }
  return out;
}
