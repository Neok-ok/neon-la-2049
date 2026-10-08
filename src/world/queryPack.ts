// Pure packing of fabric into collision + block records. Shared by the query worker and the
// main-thread fallback so both paths collide with the same boxes.
import type { Box, FabricOutput } from './fabric/types';

export const COLLIDER_STRIDE = 8;
export const QUERY_BLOCK_STRIDE = 10;

/** Thin walls and counters count; clutter (detail 2) and tiny props do not. */
export function acceptsCollider(w: number, d: number, detail: number): boolean {
  if (detail > 1) return false;
  const mn = w < d ? w : d;
  const mx = w > d ? w : d;
  return mn >= 0.38 && mx >= 0.9;
}

export interface PackedQuery {
  colliders: Float32Array;
  blocks: Float32Array;
}

export function packQuery(fab: FabricOutput): PackedQuery {
  let n = 0;
  for (const b of fab.boxes) if (acceptsCollider(b.w, b.d, b.detail)) n++;
  const colliders = new Float32Array(n * COLLIDER_STRIDE);
  let k = 0;
  for (const b of fab.boxes) {
    if (!acceptsCollider(b.w, b.d, b.detail)) continue;
    writeCollider(colliders, k, b);
    k++;
  }
  const blocks = new Float32Array(fab.blocks.length * QUERY_BLOCK_STRIDE);
  for (let i = 0; i < fab.blocks.length; i++) {
    const b = fab.blocks[i];
    const o = i * QUERY_BLOCK_STRIDE;
    blocks[o] = b.cx;
    blocks[o + 1] = b.cz;
    blocks[o + 2] = b.ax;
    blocks[o + 3] = b.az;
    blocks[o + 4] = b.la;
    blocks[o + 5] = b.lb;
    blocks[o + 6] = b.street;
    blocks[o + 7] = b.district.index;
    blocks[o + 8] = b.seed;
    blocks[o + 9] = b.ground;
  }
  return { colliders, blocks };
}

function writeCollider(out: Float32Array, i: number, b: Box): void {
  const o = i * COLLIDER_STRIDE;
  out[o] = b.x;
  out[o + 1] = b.z;
  out[o + 2] = b.w / 2;
  out[o + 3] = b.d / 2;
  out[o + 4] = Math.cos(b.yaw);
  out[o + 5] = Math.sin(b.yaw);
  out[o + 6] = b.y0;
  out[o + 7] = b.y0 + b.h;
}
