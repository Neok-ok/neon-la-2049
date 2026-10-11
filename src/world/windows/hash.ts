// Window keys. The box seed is already hash2i(block, seq) / 2^32. The cell index is
// floor(facade / cell), which the mesher writes and the shader already hashes.
// This PCG is the same mix as three.js TSL hash(), so the census matches the GPU.

/** Mirrors `hash()` in three/src/nodes/math/Hash.js (PCG, uint32). */
export function pcgHash(seed: number): number {
  let state = Math.trunc(seed);
  if (!Number.isFinite(state)) state = 0;
  state = state >>> 0;
  state = (Math.imul(state, 747796405) + 2891336453) >>> 0;
  const sh = ((state >>> 28) + 4) >>> 0;
  let word = ((state >>> sh) ^ state) >>> 0;
  word = Math.imul(word, 277803737) >>> 0;
  const result = ((word >>> 22) ^ word) >>> 0;
  return result / 4294967296;
}

export function seedQuant(seed: number): number {
  const seedF = Math.fround(seed);
  return Math.floor(Math.fround(seedF * 4096));
}

/** The hashes the facade shader already uses for lit / warm / blinds. */
export function facadeHashes(cellX: number, cellY: number, seed: number): { seedQ: number; h1: number; h2: number; h3: number } {
  const seedQ = seedQuant(seed);
  const k1 = pcgHash(cellX + seedQ * 512);
  const h1 = pcgHash(cellY + k1 * 65536);
  const h2 = pcgHash(h1 * 9137 + cellX);
  const h3 = pcgHash(h1 * 4513 + cellY);
  return { seedQ, h1, h2, h3 };
}

/**
 * Slow per-window flip. Edge windows (h1 within SCHED_BAND of the threshold) re-roll
 * on their own 3–7 minute period. The band is symmetric, so flips off match flips on.
 */
export function scheduledLit(
  h1: number,
  litFrac: number,
  cellX: number,
  cellY: number,
  seedQ: number,
  timeSec: number,
  band: number,
): boolean {
  const base = h1 <= litFrac;
  if (litFrac < band || litFrac > 1 - band) return base;
  if (Math.abs(h1 - litFrac) > band) return base;
  const phaseU = pcgHash(cellX * 3 + cellY * 5 + seedQ);
  const period = Math.floor(phaseU * 5) + 3;
  const phase = pcgHash(cellY * 9 + seedQ * 2) * period;
  const bucket = Math.floor((timeSec / 60 + phase) / period);
  const flip = pcgHash(bucket + cellX * 13 + cellY + seedQ) <= 0.5;
  return flip ? !base : base;
}
