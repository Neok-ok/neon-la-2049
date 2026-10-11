// Keep a camera point out of solid landmarks and out of fabric that is already in the cache.
// Unloaded fabric is left alone: treating a missing cell as solid would throw the tour into the sky.

import { CityQuery } from '../world/CityQuery';

/** Roof of any landmark whose footprint contains this column, else 0. */
export function roofAt(query: CityQuery, x: number, z: number, pad = 8): number {
  return query.landmarkTopAt(x, z, pad);
}

/**
 * Lowest safe eye height at this column. Street shots that are already above the ground
 * and outside every footprint keep their height.
 */
export function raiseClear(query: CityQuery, x: number, y: number, z: number, pad = 2): number {
  const ground = query.groundHeight(x, z);
  let out = Math.max(y, ground + 1.8);
  const land = query.landmarkTopAt(x, z, pad);
  if (land > 0 && out < land + 8) out = land + 8;
  if (out < CityQuery.FABRIC_CEILING + 4) {
    for (let i = 0; i < 16; i++) {
      const inside = query.insideSolid(x, out, z, pad, false) || query.insideLandmark(x, out, z, pad);
      if (!inside) break;
      out += 12;
    }
  }
  return out;
}
