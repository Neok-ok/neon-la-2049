// City-wide placement list. Landmarks and district stages call registerHologram() at startup
// (or when a building is created). The field reads this every frame, so a later register
// shows up without rebuilding the mesh.
import type { HologramSpec } from './types';

const items = new Map<string, HologramSpec>();
let list: HologramSpec[] = [];
let dirty = true;

function touch(): void {
  dirty = true;
}

export function registerHologram(spec: HologramSpec): void {
  items.set(spec.id, spec);
  touch();
}

export function unregisterHologram(id: string): void {
  if (!items.delete(id)) return;
  touch();
}

export function hologramById(id: string): HologramSpec | undefined {
  return items.get(id);
}

/** Cached snapshot. Rebuilt when a hologram is registered, not every frame. */
export function allHolograms(): HologramSpec[] {
  if (dirty) {
    list = [...items.values()];
    dirty = false;
  }
  return list;
}
