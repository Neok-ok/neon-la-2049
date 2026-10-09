// Shared hologram placements. Pure data: safe to build from landmarks, district code, or a chunk upload.
// A panel is a vertical quad. Yaw matches neon signs: local +Z becomes the normal (sin yaw, 0, cos yaw).

export const HOLO_DESIGNS = [
  'ash-crane',
  'coil-vendor',
  'ribbon-column',
  'glyph-loop',
  'lease-loop',
  'lantern-loop',
] as const;

export type HoloDesignId = (typeof HOLO_DESIGNS)[number];

/** 0 is kept first when a tier cap binds. 3 is the first to drop. */
export type HoloRank = 0 | 1 | 2 | 3;

/**
 * `street` — culled with the LOD0 radius (market figures, stall ads).
 * `tower` — culled with the near-streaming radius (megatower faces, canyon giants).
 */
export type HoloBand = 'street' | 'tower';

export interface HologramSpec {
  /** Stable id. Registering the same id again replaces the placement. */
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Panel width and height in metres. */
  w: number;
  h: number;
  design: HoloDesignId;
  /** SignColor index (src/world/fabric/types.ts). */
  color: number;
  /** 0..1 animation phase. */
  seed: number;
  rank: HoloRank;
  band: HoloBand;
  /**
   * Coloured wash radius in metres on nearby fabric and kit surfaces.
   * 0 disables spill and the ground card. The tier may still drop spill globally.
   */
  spill: number;
}

export function holoIndex(id: HoloDesignId): number {
  const i = HOLO_DESIGNS.indexOf(id);
  return i < 0 ? 0 : i;
}
