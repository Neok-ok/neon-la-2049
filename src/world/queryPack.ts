// Pure packing of fabric into collision + block records. Shared by the query worker and the
// main-thread fallback so both paths collide with the same boxes.
import type { Box, FabricOutput } from './fabric/types';

export const COLLIDER_STRIDE = 8;
export const QUERY_BLOCK_STRIDE = 15;
/** x, z, w, d, h, yaw, y0, style, seed, detail, lit, tint. Signs stay out; fabricAt callers do not read them. */
export const BOX_STRIDE = 12;

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
  boxes: Float32Array;
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
    blocks[o + 10] = b.i;
    blocks[o + 11] = b.j;
    blocks[o + 12] = b.bx;
    blocks[o + 13] = b.bz;
    blocks[o + 14] = b.yaw;
  }
  const boxes = new Float32Array(fab.boxes.length * BOX_STRIDE);
  for (let i = 0; i < fab.boxes.length; i++) {
    const b = fab.boxes[i];
    const o = i * BOX_STRIDE;
    boxes[o] = b.x;
    boxes[o + 1] = b.z;
    boxes[o + 2] = b.w;
    boxes[o + 3] = b.d;
    boxes[o + 4] = b.h;
    boxes[o + 5] = b.yaw;
    boxes[o + 6] = b.y0;
    boxes[o + 7] = b.style;
    boxes[o + 8] = b.seed;
    boxes[o + 9] = b.detail;
    boxes[o + 10] = b.lit;
    boxes[o + 11] = b.tint;
  }
  return { colliders, blocks, boxes };
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
