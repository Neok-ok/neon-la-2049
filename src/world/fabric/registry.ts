// Pure module (worker-safe). Archetype registry used by the fabric generator.
import type { ArchetypeFn } from './types';

const archetypes = new Map<string, ArchetypeFn>();

export function registerArchetype(id: string, fn: ArchetypeFn): void {
  archetypes.set(id, fn);
}

export function getArchetype(id: string): ArchetypeFn {
  const fn = archetypes.get(id) ?? archetypes.get('basin-sprawl');
  if (!fn) throw new Error(`Archetype "${id}" not registered (and no basin-sprawl fallback)`);
  return fn;
}

export function listArchetypes(): string[] {
  return [...archetypes.keys()];
}
