// How much city the streaming radii would keep, and the smaller radii that fit a
// geometry budget. The near street (lod0) is the last thing we shrink: Ultra at
// a normal viewing distance should still be the detailed mesh.

const LOD0_BYTES = 1_600_000;
const LOD1_BYTES = 900_000;
const FAR_BYTES = 1_200_000;
const SUPER = 2000;
const CHUNK = 500;

export interface Radii {
  far: number;
  near: number;
  lod0: number;
}

export function estimateStreamingBytes(far: number, near: number, lod0: number): number {
  const rFar = Math.max(0, far);
  const rNear = Math.max(0, Math.min(near, rFar));
  const rLod0 = Math.max(0, Math.min(lod0, rNear));
  const superArea = Math.PI * (rFar / SUPER) ** 2;
  const nearSupers = Math.PI * (rNear / SUPER) ** 2;
  const farSupers = Math.max(0, superArea - nearSupers);
  const nearChunks = Math.PI * (rNear / CHUNK) ** 2;
  const lod0Chunks = Math.min(nearChunks, Math.PI * (rLod0 / CHUNK) ** 2);
  const lod1Chunks = Math.max(0, nearChunks - lod0Chunks);
  return farSupers * FAR_BYTES + lod1Chunks * LOD1_BYTES + lod0Chunks * LOD0_BYTES;
}

/**
 * Shrink the horizon first, then the mid ring, and only then the street radius,
 * stopping at `floorLod0`. A budget that cannot hold the floor keeps the floor
 * anyway: eviction of distant cells is safer than a blurry street under the camera.
 */
export function fitRadii(want: Radii, geometryBudget: number, floorLod0: number): Radii {
  let far = Math.max(0, want.far);
  let near = Math.max(0, Math.min(want.near, far));
  let lod0 = Math.max(0, Math.min(want.lod0, near));
  if (!(geometryBudget > 0) || !Number.isFinite(geometryBudget)) return { far, near, lod0 };
  const minLod0 = Math.min(lod0, Math.max(0, floorLod0));
  for (let i = 0; i < 48; i++) {
    if (estimateStreamingBytes(far, near, lod0) <= geometryBudget) break;
    if (far > Math.max(near * 1.25, 2800)) far *= 0.9;
    else if (near > Math.max(lod0 * 1.35, 700)) near *= 0.9;
    else if (lod0 > minLod0) lod0 = Math.max(minLod0, lod0 * 0.9);
    else break;
    near = Math.min(near, far);
    lod0 = Math.min(lod0, near);
  }
  return { far, near, lod0 };
}
