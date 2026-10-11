// Depth-clustered forward. The CPU bins every retained practical into two view-depth
// slices and keeps the brightest few per slice. The shader only loops those slots.
// A 3D index texture mis-samples on the WebGL2 fallback the same way a uniform array does
// (see airLights.ts), so the slots are individual uniforms written from this list.
import type { LiveLight } from './registry.ts';

export const SLICES = 2;
export const PER_SLICE = 4;
export const SLOT_COUNT = SLICES * PER_SLICE;
const NEAR = 1.6;
const FAR = 56;

export interface SlotLight {
  x: number;
  y: number;
  z: number;
  range: number;
  r: number;
  g: number;
  b: number;
  candela: number;
  dx: number;
  dy: number;
  dz: number;
  cosOuter: number;
  cosInner: number;
  contact: number;
}

export const EMPTY_SLOT: SlotLight = {
  x: 0, y: 0, z: 0, range: 0, r: 0, g: 0, b: 0, candela: 0,
  dx: 0, dy: -1, dz: 0, cosOuter: -1, cosInner: -1, contact: 0,
};

export function sliceOf(distance: number): number {
  const u = Math.log(Math.max(distance, NEAR) / NEAR) / Math.log(FAR / NEAR);
  return Math.max(0, Math.min(SLICES - 1, Math.floor(u * SLICES)));
}

function toSlot(L: LiveLight): SlotLight {
  return {
    x: L.x, y: L.y, z: L.z, range: L.range,
    r: L.rgb[0], g: L.rgb[1], b: L.rgb[2],
    candela: L.candela,
    dx: L.dx, dy: L.dy, dz: L.dz,
    cosOuter: L.cosOuter, cosInner: L.cosInner,
    contact: L.contact ? 1 : 0,
  };
}

/**
 * Lights whose range crosses a slice boundary are submitted to both slices,
 * so a walk along a lane does not pop when the camera's slice index changes.
 */
export function clusterAssign(
  camX: number, camY: number, camZ: number,
  lights: LiveLight[],
  perSlice: number,
  maxRange: number,
): SlotLight[] {
  const buckets: LiveLight[][] = [[], []];
  for (const L of lights) {
    const dx = L.x - camX;
    const dy = L.y - camY;
    const dz = L.z - camZ;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > maxRange && dist > L.range + 4) continue;
    const s0 = sliceOf(Math.max(0.4, dist - L.range * 0.45));
    const s1 = sliceOf(dist + L.range * 0.25);
    for (let s = s0; s <= s1; s++) buckets[s]!.push(L);
  }
  const out: SlotLight[] = [];
  for (let s = 0; s < SLICES; s++) {
    const ranked = buckets[s]!.map((L) => {
      const d = Math.max(0.5, Math.hypot(L.x - camX, L.y - camY, L.z - camZ));
      return { L, w: L.candela / (d * d) };
    }).sort((a, b) => b.w - a.w);
    const keep = Math.max(0, Math.min(PER_SLICE, perSlice));
    // A close sign outranks a lantern on candela/d² and was taking every slot, so the
    // pole in frame never reached the asphalt. Half the kept slots stay with contact lights.
    const contactBudget = Math.floor(keep / 2);
    const picked: LiveLight[] = [];
    if (contactBudget > 0) {
      for (const e of ranked) {
        if (picked.length >= contactBudget) break;
        if (e.L.contact) picked.push(e.L);
      }
    }
    for (const e of ranked) {
      if (picked.length >= keep) break;
      if (!picked.includes(e.L)) picked.push(e.L);
    }
    for (let i = 0; i < PER_SLICE; i++) {
      const L = i < keep ? picked[i] : undefined;
      out.push(L ? toSlot(L) : EMPTY_SLOT);
    }
  }
  return out;
}

/** Brightest volumetric lights, for the fog in-scatter loop (four slots). */
export function volumetricPicks(camX: number, camY: number, camZ: number, lights: LiveLight[], maxRange: number): SlotLight[] {
  const ranked = lights.filter((L) => L.volumetric).map((L) => {
    const d = Math.max(0.5, Math.hypot(L.x - camX, L.y - camY, L.z - camZ));
    return { L, w: d > maxRange + L.range ? 0 : L.candela / (d * d) };
  }).filter((e) => e.w > 0).sort((a, b) => b.w - a.w);
  const picked: LiveLight[] = [];
  const contact = ranked.find((e) => e.L.contact);
  if (contact) picked.push(contact.L);
  for (const e of ranked) {
    if (picked.length >= 4) break;
    if (!picked.includes(e.L)) picked.push(e.L);
  }
  const out: SlotLight[] = [];
  for (let i = 0; i < 4; i++) out.push(picked[i] ? toSlot(picked[i]!) : EMPTY_SLOT);
  return out;
}
