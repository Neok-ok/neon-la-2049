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
  fogColor: uniform(new Color(0.1, 0.08, 0.07)),
  skyZenith: uniform(new Color(0.02, 0.025, 0.035)),
  skyHorizon: uniform(new Color(0.12, 0.09, 0.07)),
  sunDir: uniform(new Vector3(0, 1, 0)),
  sunColor: uniform(new Color(1, 0.9, 0.8)),
  /** multiplier on lit-window probability (time of day) */
  windowLit: uniform(1),
  /** multiplier on neon sign brightness */
  signPower: uniform(1),
  /** 0..1 flash */
  lightning: uniform(0),
  /** 0..1 how strongly street-level rain should pick up neon (set from the district under the camera). */
  neonWet: uniform(0.35),
  /** Extra ground-fog in a dressed market, 0..1. */
  streetFog: uniform(0),
  /** 1 when the planar wet reflector is drawing, so the fake neon streaks step back. */
  reflMix: uniform(0),
};
