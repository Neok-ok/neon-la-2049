// LOD0 prop modules for far districts. The streamer holds those uploads until this flips,
// so a chunk is not baked without its street kit.
import { FAR_DISTRICTS } from './farIds';

let ready = false;

export function farDetailsReady(): boolean {
  return ready;
}

export function markFarDetailsReady(): void {
  ready = true;
}

export function chunkNeedsFarDetail(blocks: ArrayLike<number>, stride: number, districtIdAt: (index: number) => string): boolean {
  if (ready) return false;
  for (let i = 7; i < blocks.length; i += stride) {
    const id = districtIdAt(blocks[i] ?? 0);
    if (FAR_DISTRICTS.has(id)) return true;
  }
  return false;
}
