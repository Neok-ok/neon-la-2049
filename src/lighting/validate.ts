// Runtime half of the lighting guard. The static half is scripts/check-lighting.mjs.
import { preset } from './presets.ts';
import type { Preset, PresetId } from './presets.ts';
import type { RGB } from './units.ts';

export class LightingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LightingError';
  }
}

export function assertChroma(rgb: RGB, where: string): void {
  if (rgb.length !== 3 || rgb.some((v) => !Number.isFinite(v) || v < 0 || v > 4)) {
    throw new LightingError(`${where}: chroma must be finite linear RGB in 0..4 (peak ~1), got [${rgb.join(', ')}]`);
  }
  const peak = Math.max(rgb[0], rgb[1], rgb[2]);
  if (peak <= 0) throw new LightingError(`${where}: chroma has no light`);
}

export function assertRange(range: number, where: string): void {
  if (!Number.isFinite(range) || range < 0.2 || range > 500) {
    throw new LightingError(`${where}: range ${range} m is outside 0.2..500`);
  }
}

export function assertCandela(candela: number, band: Preset, where: string): void {
  if (!Number.isFinite(candela) || candela < band.cdMin || candela > band.cdMax) {
    throw new LightingError(
      `${where}: ${candela} cd is outside ${band.id} ${band.cdMin}..${band.cdMax} cd`,
    );
  }
}

export function assertNits(nits: number, where: string): void {
  // The sun's disc is not an emissive mesh. A sign above 20 000 cd/m² is a mistake, not a practical.
  if (!Number.isFinite(nits) || nits < 0 || nits > 20000) {
    throw new LightingError(`${where}: ${nits} nits is outside 0..20000`);
  }
}

export function assertKelvin(kelvin: number, where: string): void {
  if (!Number.isFinite(kelvin) || kelvin < 1000 || kelvin > 20000) {
    throw new LightingError(`${where}: ${kelvin} K is outside 1000..20000`);
  }
}

export interface PunctualInput {
  preset: PresetId;
  x: number;
  y: number;
  z: number;
  candela?: number;
  range?: number;
  /** Peak-1 linear override for discharges (a pink sign, a police bar). */
  rgb?: RGB;
  dx?: number;
  dy?: number;
  dz?: number;
}

export interface CheckedLight {
  preset: PresetId;
  x: number;
  y: number;
  z: number;
  candela: number;
  range: number;
  rgb: RGB;
  dx: number;
  dy: number;
  dz: number;
  cosOuter: number;
  cosInner: number;
  contact: boolean;
  volumetric: boolean;
}

export function checkPunctual(input: PunctualInput): CheckedLight {
  const band = preset(input.preset);
  const where = `light:${input.preset}`;
  if (![input.x, input.y, input.z].every(Number.isFinite)) {
    throw new LightingError(`${where}: position is not finite`);
  }
  const candela = input.candela ?? band.candela;
  const range = input.range ?? band.range;
  assertCandela(candela, band, where);
  assertNits(band.nits, where);
  assertRange(range, where);
  const rgb = input.rgb ?? band.rgb;
  assertChroma(rgb, where);
  let dx = input.dx ?? 0;
  let dy = input.dy ?? -1;
  let dz = input.dz ?? 0;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-5) {
    dx = 0; dy = -1; dz = 0;
  } else {
    dx /= len; dy /= len; dz /= len;
  }
  const point = band.cone >= Math.PI - 0.01;
  const cosOuter = point ? -1 : Math.cos(band.cone);
  const cosInner = point ? -1 : Math.cos(Math.min(band.inner, band.cone - 0.02));
  return {
    preset: input.preset,
    x: input.x, y: input.y, z: input.z,
    candela, range, rgb: [rgb[0], rgb[1], rgb[2]],
    dx, dy, dz, cosOuter, cosInner,
    contact: band.contact, volumetric: band.volumetric,
  };
}
