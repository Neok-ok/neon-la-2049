// Interior vertices stay unlit. The bake is inverse-square with a tube radius so the
// ceiling does not go to infinity, and a cap so a vertex inside the glass does not firefly.
// The material then scales the bake into nits (see NITS.interiorSurface).
import { areaAttenuation } from './units.ts';
import type { RGB } from './units.ts';

export interface BakeLight {
  x: number;
  y: number;
  z: number;
  color: RGB;
  intensity: number;
  range: number;
}

const TUBE_RADIUS = 0.42;
/** Matches the old linear bake near 2 m. Closer than that, inverse-square is allowed to run hotter until the cap. */
const MATCH = 1.9;
const CAP = 6.5;

export function bakeInteriorVertex(
  nx: number, ny: number, nz: number,
  wx: number, wy: number, wz: number,
  lights: BakeLight[],
  ambient: RGB,
): RGB {
  let r = ambient[0];
  let g = ambient[1];
  let b = ambient[2];
  for (const L of lights) {
    const dx = L.x - wx;
    const dy = L.y - wy;
    const dz = L.z - wz;
    const dist = Math.hypot(dx, dy, dz);
    if (dist >= L.range) continue;
    const ndl = Math.max(0, (nx * dx + ny * dy + nz * dz) / Math.max(dist, 1e-3));
    // A high wrap floor lit the back of every box, so a sconce and a far wall read as one tone.
    const wrap = ndl * 0.94 + 0.06;
    const att = areaAttenuation(dist, L.range, TUBE_RADIUS);
    const k = Math.min(CAP, wrap * att * L.intensity * MATCH);
    r += L.color[0] * k;
    g += L.color[1] * k;
    b += L.color[2] * k;
  }
  return [r, g, b];
}
