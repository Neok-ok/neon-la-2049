// The only way to add a practical. Chunks retain lamps; signs and interiors are replaced every frame.
import { checkPunctual } from './validate.ts';
import type { CheckedLight, PunctualInput } from './validate.ts';

export interface LiveLight extends CheckedLight {
  id: number;
}

let seq = 1;
const chunks = new Map<string, LiveLight[]>();
let ephemeral: LiveLight[] = [];

function adopt(input: PunctualInput): LiveLight {
  return { id: seq++, ...checkPunctual(input) };
}

/**
 * Replace the lights owned by one LOD0 chunk. The returned function drops them.
 * A later retain of the same key wins: the previous release becomes a no-op.
 */
export function retainChunk(key: string, inputs: PunctualInput[]): () => void {
  releaseChunk(key);
  const lights = inputs.map(adopt);
  chunks.set(key, lights);
  let live = true;
  return () => {
    if (!live) return;
    live = false;
    if (chunks.get(key) === lights) chunks.delete(key);
  };
}

export function releaseChunk(key: string): void {
  chunks.delete(key);
}

/** Signs, holograms and the interior the walker is in. Replaced every frame. */
export function setEphemeral(inputs: PunctualInput[]): void {
  ephemeral = inputs.map(adopt);
}

export function allLights(): LiveLight[] {
  const out: LiveLight[] = [];
  for (const list of chunks.values()) out.push(...list);
  out.push(...ephemeral);
  return out;
}

export function lightCensus(): { retained: number; ephemeral: number; chunks: number } {
  let retained = 0;
  for (const list of chunks.values()) retained += list.length;
  return { retained, ephemeral: ephemeral.length, chunks: chunks.size };
}

/** Test hook. Production frames do not call this. */
export function resetRegistry(): void {
  chunks.clear();
  ephemeral = [];
  seq = 1;
}
