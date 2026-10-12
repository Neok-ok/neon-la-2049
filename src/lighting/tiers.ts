import type { Tier } from '../core/quality';

export interface LightTier {
  /** Lights kept per depth slice. The shader has four slots; extras stay at 0 cd. */
  perSlice: number;
  /** Cull distance for the CPU assign, metres. */
  range: number;
  /** Flat sodium nits on the ground when there is no clustered loop worth running. */
  bakedNits: number;
  contact: boolean;
  probes: boolean;
  volumetric: boolean;
  /** One camera-following sun shadow. Night practicals use analytic contact discs. */
  sunShadow: boolean;
  bloom: boolean;
}

export const LIGHT_TIERS: Record<Tier, LightTier> = {
  // Baked sodium on the ground. Signs and windows stay emissive, in nits, without a light loop.
  low: { perSlice: 0, range: 0, bakedNits: 0.9, contact: false, probes: false, volumetric: false, sunShadow: false, bloom: false },
  medium: { perSlice: 2, range: 36, bakedNits: 0, contact: true, probes: false, volumetric: true, sunShadow: false, bloom: false },
  high: { perSlice: 4, range: 52, bakedNits: 0, contact: true, probes: true, volumetric: true, sunShadow: false, bloom: true },
  ultra: { perSlice: 4, range: 68, bakedNits: 0, contact: true, probes: true, volumetric: true, sunShadow: true, bloom: true },
};
