// Divergence-free advection. Bridson, Hourihan, Nordenstam,
// "Curl-Noise for Procedural Fluid Flow", SIGGRAPH 2007.
// The potential is three value-noise fields. The curl of a gradient-free
// potential has no divergence, so puffs roll instead of pooling into sinks.

function hash3(ix: number, iy: number, iz: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Value noise in approximately -1..1. */
export function valueNoise(x: number, y: number, z: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const xf = fade(x - x0), yf = fade(y - y0), zf = fade(z - z0);
  const x1 = x0 + 1, y1 = y0 + 1, z1 = z0 + 1;
  const n000 = hash3(x0, y0, z0);
  const n100 = hash3(x1, y0, z0);
  const n010 = hash3(x0, y1, z0);
  const n110 = hash3(x1, y1, z0);
  const n001 = hash3(x0, y0, z1);
  const n101 = hash3(x1, y0, z1);
  const n011 = hash3(x0, y1, z1);
  const n111 = hash3(x1, y1, z1);
  const x00 = lerp(n000, n100, xf);
  const x10 = lerp(n010, n110, xf);
  const x01 = lerp(n001, n101, xf);
  const x11 = lerp(n011, n111, xf);
  const y0v = lerp(x00, x10, yf);
  const y1v = lerp(x01, x11, yf);
  return lerp(y0v, y1v, zf) * 2 - 1;
}

function noise3(x: number, y: number, z: number, salt: number): number {
  return valueNoise(x + salt * 19.1, y + salt * 7.3, z + salt * 3.7);
}

/**
 * Curl of a vector potential. `eps` is the finite-difference step in noise space.
 * Returns a vector whose typical magnitude is under 1.
 */
export function curl(x: number, y: number, z: number, eps = 0.12): [number, number, number] {
  const inv = 1 / (2 * eps);
  const dNzdy = (noise3(x, y + eps, z, 3) - noise3(x, y - eps, z, 3)) * inv;
  const dNydz = (noise3(x, y, z + eps, 2) - noise3(x, y, z - eps, 2)) * inv;
  const dNxdz = (noise3(x, y, z + eps, 1) - noise3(x, y, z - eps, 1)) * inv;
  const dNzdx = (noise3(x + eps, y, z, 3) - noise3(x - eps, y, z, 3)) * inv;
  const dNydx = (noise3(x + eps, y, z, 2) - noise3(x - eps, y, z, 2)) * inv;
  const dNxdy = (noise3(x, y + eps, z, 1) - noise3(x, y - eps, z, 1)) * inv;
  return [dNzdy - dNydz, dNxdz - dNzdx, dNydx - dNxdy];
}

/** Two octaves. Used by the flipbook baker and as a cheap turbulence sample. */
export function fbm(x: number, y: number, z: number): number {
  const a = valueNoise(x, y, z);
  const b = valueNoise(x * 2.13 + 4.2, y * 2.13, z * 2.13);
  return a * 0.65 + b * 0.35;
}
