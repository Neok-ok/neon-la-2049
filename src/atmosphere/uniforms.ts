// Global shader uniforms shared by every material. Written by the atmosphere systems each frame.
import { uniform } from 'three/tsl';
import { Color, Vector3 } from 'three/webgpu';

export const U = {
  /** seconds since start (wraps every hour to keep float precision) */
  time: uniform(0),
  /** 0 = full day, 1 = full night */
  night: uniform(1),
  /** 0..1 sun strength after smog */
  daylight: uniform(0),
  /** 0..1 how wet surfaces are */
  wetness: uniform(0.8),
  /** 0..1 snow cover on up-facing surfaces */
  snow: uniform(0),
  /** fog density at y = 0 (per meter) */
  fogDensity: uniform(0.0012),
  /** exponential falloff of fog with height (1/m) */
  fogFalloff: uniform(1 / 320),
  /** altitude-independent haze (per meter) */
  haze: uniform(0.00004),
  /** smog inversion layer: peak density (1/m), centre height and gaussian half-width (m) */
  layerDensity: uniform(0.0008),
  layerY: uniform(260),
  layerW: uniform(115),
  /**
   * Analytic street band and high deck (D5). Densities are 0 on the low tier, so that
   * tier keeps today's exponential fog. Not a second pass.
   */
  groundBand: uniform(0),
  groundY: uniform(12),
  groundW: uniform(15),
  deckDensity: uniform(0),
  deckY: uniform(1320),
  deckW: uniform(240),
  /** Hue multiply on the low fog. Luminance stays near 1 so night streets stay dark. */
  airTint: uniform(new Color(1, 1, 1)),
  airTintMix: uniform(0),
  deckColor: uniform(new Color(0.06, 0.04, 0.03)),
  deckTint: uniform(0),
  /** 0 low, ~0.6 medium, 1 high/ultra. Rain streaks ignore lights when this is 0. */
  rainReact: uniform(0),
  /** How many of the fixed light / shaft slots the rain shader reads. */
  rainSlots: uniform(0),
  shaftSlots: uniform(0),
  fogColor: uniform(new Color(0.1, 0.08, 0.07)),
  skyZenith: uniform(new Color(0.02, 0.025, 0.035)),
  skyHorizon: uniform(new Color(0.12, 0.09, 0.07)),
  sunDir: uniform(new Vector3(0, 1, 0)),
  sunColor: uniform(new Color(1, 0.9, 0.8)),
  /** multiplier on lit-window probability (time of day) */
  windowLit: uniform(1),
  /** 0..1 rain intensity. Window glass reads this; it does not drive the weather. */
  rain: uniform(0),
  /** multiplier on neon sign brightness */
  signPower: uniform(1),
  /** 0..1 flash */
  lightning: uniform(0),
  /**
   * Coastal storm cloud shelf. 0 leaves the sky node unchanged (the mix weight is zero).
   * Written only while the Sea Wall Storm is on and the camera is near the coast.
   */
  stormSky: uniform(0),
  /** 0..1 how strongly street-level rain should pick up neon (set from the district under the camera). */
  neonWet: uniform(0.35),
  /** 0 = magenta/cyan rain tint, 1 = sodium. Follows the district under the camera. */
  sheen: uniform(1),
  /** Camera metres above the ground. Ground neon fades out as this rises. */
  camAlt: uniform(2),
  /** Extra ground-fog in a dressed market, 0..1. */
  streetFog: uniform(0),
  /** 1 when the planar wet reflector is drawing, so the fake neon streaks step back. */
  reflMix: uniform(0),
  /** 0 on the low tier (no hologram spill), 1 otherwise. The field writes this every frame. */
  holoSpill: uniform(1),
};
