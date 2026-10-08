/// <reference lib="webworker" />
// Builds chunk geometry off the main thread. Protocol: see ChunkWorkerRequest / ChunkWorkerResponse.
import { getLayout } from '../layout';
import { generateFabric } from './generator';
import { buildChunkArrays } from './mesher';

export interface ChunkWorkerRequest {
  id: number;
  x0: number;
  z0: number;
  size: number;
  lod: number;
}

export interface ChunkWorkerResponse {
  id: number;
  position: Float32Array;
  normal: Float32Array;
  facade: Float32Array;
  bdata: Float32Array;
  index: Uint32Array;
  signs: Float32Array;
  blocks: Float32Array;
  maxY: number;
  boxCount: number;
  ms: number;
}

const layout = getLayout();

self.onmessage = (e: MessageEvent<ChunkWorkerRequest>) => {
  const t0 = performance.now();
  const { id, x0, z0, size, lod } = e.data;
  const fab = generateFabric(layout, x0, z0, size);
  const a = buildChunkArrays(layout, fab, x0, z0, size, lod);
  const res: ChunkWorkerResponse = { id, ...a, ms: performance.now() - t0 };
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(res, [
    a.position.buffer,
    a.normal.buffer,
    a.facade.buffer,
    a.bdata.buffer,
    a.index.buffer,
    a.signs.buffer,
    a.blocks.buffer,
  ]);
};
