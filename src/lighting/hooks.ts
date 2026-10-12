// Adoption hooks for passes this lighting change does not edit.
// D6 (sea wall, harbor, weather) and M2 (spinner, vehicles) should create practicals
// with these presets so the guard accepts them. Do not construct a three.js light.
import type { PunctualInput } from './validate.ts';

export function harborMast(x: number, y: number, z: number): PunctualInput {
  return { preset: 'harbor-mast', x, y, z, dx: 0, dy: -1, dz: 0 };
}

export function spinnerHeadlight(
  x: number, y: number, z: number, dx: number, dy: number, dz: number,
): PunctualInput {
  return { preset: 'spinner-headlight', x, y, z, dx, dy, dz };
}

export function spinnerLightbar(
  x: number, y: number, z: number, dx: number, dy: number, dz: number, red: boolean,
): PunctualInput {
  return {
    preset: 'spinner-lightbar', x, y, z, dx, dy, dz,
    rgb: red ? [1, 0.08, 0.06] : [0.2, 0.4, 1],
  };
}

/** Wet surfaces can read the probe the lighting frame already wrote. D6's reflector should sample this later. */
export { probeColor, probeStrength } from './shade.ts';
