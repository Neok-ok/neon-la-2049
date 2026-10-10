/// <reference lib="webworker" />
// Collision cells off the main thread. Same generator as the chunk worker, packed for CityQuery.
import { getLayout } from './layout';
import { generateFabric } from './fabric/generator';
import { packQuery } from './queryPack';

export interface QueryWorkerRequest {
  id: number;
  x0: number;
  z0: number;
  ix: number;
  iz: number;
}

export interface QueryWorkerResponse {
  id: number;
  ix: number;
  iz: number;
  colliders: Float32Array;
  blocks: Float32Array;
  boxes: Float32Array;
  ms: number;
}

const layout = getLayout();

self.onmessage = (e: MessageEvent<QueryWorkerRequest>) => {
  const t0 = performance.now();
  const { id, x0, z0, ix, iz } = e.data;
  const packed = packQuery(generateFabric(layout, x0, z0, 500));
  const res: QueryWorkerResponse = { id, ix, iz, ...packed, ms: performance.now() - t0 };
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(res, [packed.colliders.buffer, packed.blocks.buffer, packed.boxes.buffer]);
};
