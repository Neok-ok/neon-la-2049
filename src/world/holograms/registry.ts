// City-wide placement list. Landmarks and district stages call registerHologram() at startup
// (or when a building is created). The field reads this every frame, so a later register
// shows up without rebuilding the mesh.
import type { HologramSpec } from './types';

const items = new Map<string, HologramSpec>();

export function registerHologram(spec: HologramSpec): void {
  items.set(spec.id, spec);
}

export function unregisterHologram(id: string): void {
  items.delete(id);
}

export function hologramById(id: string): HologramSpec | undefined {
  return items.get(id);
}

export function allHolograms(): HologramSpec[] {
  return [...items.values()];
}
