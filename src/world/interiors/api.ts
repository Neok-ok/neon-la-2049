import type { InteriorSpec } from './types';

const list: InteriorSpec[] = [];

/**
 * Register or replace an interior. Call once at startup from a district module
 * (see `src/districts/interior-index.ts`). Do not call it from a chunk worker.
 */
export function registerInterior(spec: InteriorSpec): void {
  const i = list.findIndex((s) => s.id === spec.id);
  if (i >= 0) list[i] = spec;
  else list.push(spec);
}

export function allInteriors(): readonly InteriorSpec[] {
  return list;
}
