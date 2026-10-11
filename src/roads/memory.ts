// What the road layer keeps in memory. Textures are shared for the whole session.
// Chunk meshes are unique and die with the LOD0 group. Counts come from a built chunk.
import type { Tier } from '../core/quality';
import { settingsFor } from '../core/quality';
import type { RoadChunk } from './buildChunk';
import { chunkDraws } from './buildChunk';

/** Uncompressed atlas bytes. KTX2 replaces these on a real GPU; the files are smaller. */
export const ROAD_ATLAS_BYTES = {
  trim: 256 * 256 * 4,
  normal: 256 * 256 * 4,
  mark: 256 * 256 * 4,
  sign: 512 * 128 * 4,
} as const;

export function sharedTextureBytes(tier: Tier, compressed: boolean, ktxBytes = 0): number {
  if (tier === 'low') return 0;
  if (compressed && ktxBytes > 0) return ktxBytes;
  return ROAD_ATLAS_BYTES.trim + ROAD_ATLAS_BYTES.normal + ROAD_ATLAS_BYTES.mark + ROAD_ATLAS_BYTES.sign;
}

/** LOD0 chunks whose box can sit inside the tier radius, camera near a corner. */
export function loadedChunkEstimate(tier: Tier): number {
  const r = settingsFor(tier).lod0Radius;
  const reach = Math.ceil((r + 500) / 500);
  return Math.max(1, reach * reach);
}

export interface RoadMemoryRow {
  tier: Tier;
  drawsPerChunk: number;
  trisPerChunk: number;
  uniqueBytesPerChunk: number;
  sharedTextureBytes: number;
  loadedChunks: number;
  residentBytes: number;
}

export function memoryRow(tier: Tier, chunk: RoadChunk, compressed: boolean, ktxBytes = 0): RoadMemoryRow {
  const draws = chunkDraws(tier, chunk);
  const unique = chunk.bytes + chunk.stamps.length * 64 + chunk.signs.length * 64 + chunk.puddles.length * 64;
  const shared = sharedTextureBytes(tier, compressed, ktxBytes);
  const loaded = loadedChunkEstimate(tier);
  return {
    tier,
    drawsPerChunk: draws,
    trisPerChunk: chunk.tris,
    uniqueBytesPerChunk: unique,
    sharedTextureBytes: shared,
    loadedChunks: loaded,
    residentBytes: shared + unique * loaded,
  };
}
