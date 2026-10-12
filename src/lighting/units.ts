// Scene-linear photometry. Distances are metres. One nit is one candela per square metre.
// Formulas follow the published exposure derivation in Filament and the Frostbite windowed
// inverse-square, written out here so a light cannot ship as an arbitrary brightness.

export const PI = Math.PI;

/** sRGB transfer → linear. Chroma and authored textures enter the lighting math through this. */
export function srgbToLinear(channel: number): number {
  const c = Math.min(1, Math.max(0, channel));
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear → sRGB transfer, for checks and the comparison chart. */
export function linearToSrgb(channel: number): number {
  const c = Math.max(0, channel);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

export function linearToSrgbByte(channel: number): number {
  return Math.round(Math.min(1, Math.max(0, linearToSrgb(channel))) * 255);
}

/**
 * Round-trip a byte through the display transfer. A broken linear workflow
 * (treating sRGB bytes as linear, or encoding twice) misses by more than a step.
 */
export function srgbByteRoundTrip(byte: number): number {
  const encoded = linearToSrgbByte(srgbToLinear(byte / 255));
  return Math.abs(encoded - byte);
}

/** Lumens into candela for a uniform sphere. Spotlights use their own beam instead. */
export function lumensToCandela(lumens: number): number {
  return lumens / (4 * PI);
}

/** Lambertian exitance (lm/m²) from luminance (cd/m²). */
export function nitsToExitance(nits: number): number {
  return nits * PI;
}

/** Luminance of a Lambertian surface under illuminance E (lux) and albedo rho. */
export function reflectedNits(lux: number, albedo: number): number {
  return (lux * albedo) / PI;
}

/**
 * EV100 from a camera. N aperture f-number, t shutter seconds, S ISO.
 * EV100 = log2((N² / t) * (100 / S)). Filament documents the same identity.
 */
export function ev100(aperture: number, shutterSeconds: number, iso: number): number {
  return Math.log2((aperture * aperture) / shutterSeconds * (100 / iso));
}

/**
 * Exposure multiplier that maps luminance (cd/m²) onto the tone mapper.
 * Lmax = 1.2 * 2^EV100, so a pixel stores L / Lmax. The 1.2 comes from
 * a saturation-based ISO speed with lens factor q = 0.65.
 */
export function exposureFromEv(ev: number): number {
  return 1 / (1.2 * 2 ** ev);
}

export function exposureFromCamera(aperture: number, shutterSeconds: number, iso: number): number {
  return exposureFromEv(ev100(aperture, shutterSeconds, iso));
}

/**
 * Frostbite's windowed inverse-square. The window is zero at `range` and
 * one near the source, so a finite radius does not leave a hard disc.
 * `sourceRadius` keeps a real fixture from a 1/0 singularity (a 1 cm point,
 * or the glass radius of a tube).
 */
export function frostbiteAttenuation(distance: number, range: number, sourceRadius = 0.01): number {
  const r = Math.max(range, sourceRadius);
  const d = Math.max(distance, sourceRadius);
  const x = Math.min(1, Math.max(0, 1 - (d / r) ** 4));
  return (x * x) / (d * d);
}

/** Same window, with the source treated as a small sphere so a tube does not explode at d = 0. */
export function areaAttenuation(distance: number, range: number, sourceRadius: number): number {
  const r0 = Math.max(sourceRadius, 0.05);
  const r = Math.max(range, r0);
  const d = Math.max(0, distance);
  const x = Math.min(1, Math.max(0, 1 - (d / r) ** 4));
  return (x * x) / (d * d + r0 * r0);
}

/** Illuminance (lux) from a point of `candela` at `distance` metres, before the cosine. */
export function pointLux(candela: number, distance: number, range: number): number {
  return candela * frostbiteAttenuation(distance, range);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** CIE xyY (Y = 1) → peak-normalised linear sRGB. Out-of-gamut neon is pulled in, not clipped to a primary. */
export function xyToLinear(x: number, y: number): [number, number, number] {
  const Y = 1;
  const X = (x * Y) / y;
  const Z = ((1 - x - y) * Y) / y;
  let r = 3.2406 * X + -1.5372 * Y + -0.4986 * Z;
  let g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  let b = 0.0557 * X + -0.204 * Y + 1.057 * Z;
  const lo = Math.min(r, g, b);
  if (lo < 0) {
    r -= lo;
    g -= lo;
    b -= lo;
  }
  const peak = Math.max(r, g, b, 1e-6);
  return [r / peak, g / peak, b / peak];
}

/**
 * Blackbody approximation (Tanner Helland), then the sRGB transfer.
 * Returns a peak-1 linear chromaticity. Intensity is carried separately as candela or nits.
 */
export function kelvinToLinear(kelvin: number): [number, number, number] {
  const temp = Math.min(40000, Math.max(1000, kelvin)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
  } else {
    r = 329.698727446 * (temp - 60) ** -0.1332047592;
    g = 288.1221695283 * (temp - 60) ** -0.0755148492;
  }
  if (temp >= 66) b = 255;
  else if (temp <= 19) b = 0;
  else b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  const lin = [r, g, b].map((channel) => srgbToLinear(Math.min(255, Math.max(0, channel)) / 255));
  const peak = Math.max(lin[0]!, lin[1]!, lin[2]!, 1e-6);
  return [lin[0]! / peak, lin[1]! / peak, lin[2]! / peak];
}

/** Low-pressure sodium is the 589 nm doublet, not a 2000 K blackbody. High-pressure sodium is the blackbody preset. */
export function sodiumLineLinear(): [number, number, number] {
  // Spectral locus near 589 nm.
  return xyToLinear(0.575, 0.424);
}

export type RGB = [number, number, number];

/** Narkowicz fitted ACES. Published rational polynomial, used for the CPU comparison chart. */
export function acesFitted(rgb: RGB): RGB {
  const f = (x: number) => {
    const a = 2.51;
    const b = 0.03;
    const c = 2.43;
    const d = 0.59;
    const e = 0.14;
    return Math.min(1, Math.max(0, (x * (a * x + b)) / (x * (c * x + d) + e)));
  };
  return [f(rgb[0]), f(rgb[1]), f(rgb[2])];
}

/**
 * Khronos PBR Neutral, from the published specification (startCompression = 0.76,
 * desaturation = 0.15, Fresnel offset 0.04). Hue stays in the plane of the input and white.
 */
export function neutralTonemap(rgb: RGB): RGB {
  const startCompression = 0.8 - 0.04;
  const desaturation = 0.15;
  let r = rgb[0];
  let g = rgb[1];
  let b = rgb[2];
  const x = Math.min(r, g, b);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  r -= offset;
  g -= offset;
  b -= offset;
  const peak = Math.max(r, g, b);
  if (peak < startCompression) return [r, g, b];
  const d = 1 - startCompression;
  const newPeak = 1 - (d * d) / (peak + d - startCompression);
  r = (r * newPeak) / peak;
  g = (g * newPeak) / peak;
  b = (b * newPeak) / peak;
  const mix = 1 - 1 / (desaturation * (peak - newPeak) + 1);
  return [
    r + (newPeak - r) * mix,
    g + (newPeak - g) * mix,
    b + (newPeak - b) * mix,
  ];
}

/** Hue angle around white, degrees. Used to show ACES moving neon and Neutral holding it. */
export function hueDegrees(rgb: RGB): number {
  const max = Math.max(rgb[0], rgb[1], rgb[2]);
  const min = Math.min(rgb[0], rgb[1], rgb[2]);
  const d = max - min;
  if (d < 1e-6) return 0;
  let h: number;
  if (max === rgb[0]) h = ((rgb[1] - rgb[2]) / d) % 6;
  else if (max === rgb[1]) h = (rgb[2] - rgb[0]) / d + 2;
  else h = (rgb[0] - rgb[1]) / d + 4;
  return ((h * 60) + 360) % 360;
}
