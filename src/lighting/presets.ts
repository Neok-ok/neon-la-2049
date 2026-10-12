// Every practical the city can spawn. Candela and nits are the values a later pass must use.
// Bands are wide enough for a dim fixture and a hero sign, and tight enough that a
// 1e9 "just make it bright" light fails the guard.
import { kelvinToLinear, sodiumLineLinear } from './units.ts';
import type { RGB } from './units.ts';

export type PresetId =
  | 'street-sodium'
  | 'street-led'
  | 'neon-sign'
  | 'window-warm'
  | 'window-cool'
  | 'hologram'
  | 'beacon-red'
  | 'beacon-white'
  | 'beacon-amber'
  | 'flare'
  | 'interior-fluorescent'
  | 'interior-tungsten'
  | 'interior-sodium'
  | 'spinner-headlight'
  | 'spinner-lightbar'
  | 'harbor-mast';

export interface Preset {
  id: PresetId;
  /** Peak-1 linear chromaticity. */
  rgb: RGB;
  kelvin: number | null;
  /** Typical luminous intensity. Callers may override inside the band. */
  candela: number;
  cdMin: number;
  cdMax: number;
  /** Typical surface luminance of the glowing shell, in nits. */
  nits: number;
  range: number;
  /** Outer half-angle, radians. >= pi means a point (no cone). */
  cone: number;
  inner: number;
  contact: boolean;
  volumetric: boolean;
}

const deg = (d: number) => (d * Math.PI) / 180;

function blackbody(id: PresetId, kelvin: number, rest: Omit<Preset, 'id' | 'rgb' | 'kelvin'>): Preset {
  return { id, kelvin, rgb: kelvinToLinear(kelvin), ...rest };
}

function discharge(id: PresetId, rgb: RGB, rest: Omit<Preset, 'id' | 'rgb' | 'kelvin'>): Preset {
  return { id, kelvin: null, rgb, ...rest };
}

/**
 * Street: a cutoff luminaire, not a bare bulb.
 * 7 500 cd at 8 m is about 90 lux on axis before the cosine, which lands near
 * 2 cd/m² on dark asphalt — a lit downtown lane, not a car park at noon.
 * Sodium is 2000 K (high-pressure). LED is 4000 K. LPS 589 nm is `sodiumLineLinear()`
 * and is not the street default; the film's orange is the high-pressure lamp.
 */
export const PRESETS: Record<PresetId, Preset> = {
  'street-sodium': blackbody('street-sodium', 2000, {
    candela: 7500, cdMin: 400, cdMax: 25000, nits: 28, range: 28,
    // 56° from a 7 m head still met across the carriageway. 48° is about 8 m of pool,
    // so a 32 m spacing goes dark between poles.
    cone: deg(48), inner: deg(28), contact: true, volumetric: true,
  }),
  'street-led': blackbody('street-led', 4000, {
    candela: 5200, cdMin: 400, cdMax: 25000, nits: 80, range: 26,
    cone: deg(52), inner: deg(30), contact: true, volumetric: true,
  }),
  // Neon and argon tubes are discharges. The sign shader scales a full glyph by about 1.65,
  // which just clears the bloom threshold. A painted wall (a few nits) does not.
  'neon-sign': discharge('neon-sign', [1, 0.25, 0.55], {
    candela: 400, cdMin: 15, cdMax: 8000, nits: 20, range: 18,
    cone: Math.PI, inner: Math.PI, contact: false, volumetric: true,
  }),
  'window-warm': blackbody('window-warm', 2700, {
    candela: 30, cdMin: 1, cdMax: 400, nits: 18, range: 6,
    cone: Math.PI, inner: Math.PI, contact: false, volumetric: false,
  }),
  'window-cool': blackbody('window-cool', 5000, {
    candela: 40, cdMin: 1, cdMax: 400, nits: 22, range: 6,
    cone: Math.PI, inner: Math.PI, contact: false, volumetric: false,
  }),
  'hologram': discharge('hologram', [0.35, 0.85, 1], {
    candela: 280, cdMin: 10, cdMax: 4000, nits: 14, range: 14,
    cone: Math.PI, inner: Math.PI, contact: false, volumetric: true,
  }),
  // Low-intensity aviation red is on the order of tens of candela. The strobe is the bright one.
  'beacon-red': discharge('beacon-red', [1, 0.08, 0.03], {
    candela: 40, cdMin: 2, cdMax: 2000, nits: 90, range: 22,
    cone: Math.PI, inner: Math.PI, contact: false, volumetric: false,
  }),
  'beacon-white': blackbody('beacon-white', 6500, {
    candela: 1800, cdMin: 50, cdMax: 80000, nits: 200, range: 40,
    cone: Math.PI, inner: Math.PI, contact: false, volumetric: false,
  }),
  'beacon-amber': blackbody('beacon-amber', 2200, {
    candela: 80, cdMin: 5, cdMax: 4000, nits: 70, range: 18,
    cone: Math.PI, inner: Math.PI, contact: false, volumetric: false,
  }),
  'flare': blackbody('flare', 1800, {
    candela: 6000, cdMin: 200, cdMax: 80000, nits: 400, range: 32,
    cone: Math.PI, inner: Math.PI, contact: false, volumetric: true,
  }),
  // A corridor tube is a few thousand lumens. Downward intensity is a couple of hundred candela.
  'interior-fluorescent': blackbody('interior-fluorescent', 4100, {
    candela: 220, cdMin: 20, cdMax: 2500, nits: 55, range: 8,
    cone: Math.PI, inner: Math.PI, contact: false, volumetric: false,
  }),
  'interior-tungsten': blackbody('interior-tungsten', 2700, {
    candela: 90, cdMin: 8, cdMax: 1500, nits: 28, range: 6,
    cone: Math.PI, inner: Math.PI, contact: false, volumetric: false,
  }),
  'interior-sodium': blackbody('interior-sodium', 2000, {
    candela: 160, cdMin: 10, cdMax: 2000, nits: 40, range: 7,
    cone: Math.PI, inner: Math.PI, contact: false, volumetric: false,
  }),
  // Headlights stay on the vehicle pass. These are the values that pass must use.
  'spinner-headlight': blackbody('spinner-headlight', 5200, {
    candela: 28000, cdMin: 2000, cdMax: 200000, nits: 200, range: 90,
    cone: deg(16), inner: deg(7), contact: false, volumetric: true,
  }),
  'spinner-lightbar': discharge('spinner-lightbar', [0.25, 0.45, 1], {
    candela: 3500, cdMin: 200, cdMax: 40000, nits: 120, range: 28,
    cone: deg(38), inner: deg(16), contact: false, volumetric: true,
  }),
  // Harbor masts stay on the sea-wall pass. Same registry, so a later edit cannot invent a white point light.
  'harbor-mast': blackbody('harbor-mast', 2000, {
    candela: 4200, cdMin: 200, cdMax: 30000, nits: 60, range: 34,
    cone: deg(58), inner: deg(30), contact: true, volumetric: true,
  }),
};

export function preset(id: PresetId): Preset {
  return PRESETS[id];
}

export const WINDOW_WARM = PRESETS['window-warm'].rgb;
export const WINDOW_COOL = PRESETS['window-cool'].rgb;
export const SODIUM_RGB = PRESETS['street-sodium'].rgb;
export const LED_RGB = PRESETS['street-led'].rgb;
export const SODIUM_LINE = sodiumLineLinear();

/** Authored emissive shells, in nits, so bloom can tell a sign from a wall. */
export const NITS = {
  window: PRESETS['window-warm'].nits,
  windowGlow: 96,
  sign: PRESETS['neon-sign'].nits,
  hologram: PRESETS.hologram.nits,
  // Spill and the ground card are additive. A tall column at the old values painted the lane.
  holoSpill: 4,
  holoCard: 6,
  groundCarpet: 2,
  neonReflection: 2,
  kit: 26,
  // 18 nits each averaged a lane to a pale floor. 4 nits left no streak. 7 is a colored mark.
  pool: 7,
  // Below the preset shell. At 28 nits the head clipped to a white bar and lost the sodium hue.
  lampHead: 16,
  interiorSurface: 22,
  interiorFixture: 48,
  beaconGlare: 3.4,
  flareGlare: 3.0,
} as const;

/**
 * Bloom starts above a painted wall and a dim window, and below a neon face.
 * Applied to scene-linear nits, before the tone mapper.
 */
export const BLOOM_THRESHOLD_NITS = 32;
