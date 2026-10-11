// Fixed light and shaft slots. A float uniform array mis-indexes on the WebGL2 fallback,
// so each slot is its own uniform, same as hologram spill. Rain reads them; the halo mesh does too.
import { uniform } from 'three/tsl';
import { Color, Vector4 } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from './uniforms';

const T = TSL as any;
const { float, vec3, length, max, exp, clamp, dot, step, smoothstep, mix } = T;

export const AIR_LIGHT_SLOTS = 4;
export const AIR_SHAFT_SLOTS = 4;

const lightP = [0, 1, 2, 3].map(() => uniform(new Vector4(0, 0, 0, 0)));
const lightC = [0, 1, 2, 3].map(() => uniform(new Color(0, 0, 0)));
const shaftP = [0, 1, 2, 3].map(() => uniform(new Vector4(0, 0, 0, 0)));
const shaftD = [0, 1, 2, 3].map(() => uniform(new Vector4(0, -1, 0, 0)));

export function clearAirLights(): void {
  for (let i = 0; i < AIR_LIGHT_SLOTS; i++) {
    const p = lightP[i];
    if (p) p.value.w = 0;
  }
  for (let i = 0; i < AIR_SHAFT_SLOTS; i++) {
    const d = shaftD[i];
    if (d) d.value.w = 0;
  }
}

/** Fill slots the halo pass left empty. Does not overwrite a sign that already owns one. */
export function fillEmptyAirLights(
  pts: { x: number; y: number; z: number; radius: number; r: number; g: number; b: number }[],
): number {
  let slot = 0;
  let filled = 0;
  for (const pt of pts) {
    while (slot < AIR_LIGHT_SLOTS && (lightP[slot]?.value.w ?? 0) > 0.5) slot++;
    if (slot >= AIR_LIGHT_SLOTS) break;
    setAirLight(slot, pt.x, pt.y, pt.z, pt.radius, pt.r, pt.g, pt.b);
    slot++;
    filled++;
  }
  return filled;
}

export function setAirLight(
  i: number, x: number, y: number, z: number, radius: number, r: number, g: number, b: number,
): void {
  const p = lightP[i];
  const c = lightC[i];
  if (!p || !c) return;
  p.value.set(x, y, z, radius);
  c.value.setRGB(r, g, b);
}

/** Direction must be a unit vector. `length` is the shaft in metres. w = 0 hides the slot. */
export function setAirShaft(
  i: number, x: number, y: number, z: number, dx: number, dy: number, dz: number, beam: number,
): void {
  const p = shaftP[i];
  const d = shaftD[i];
  if (!p || !d) return;
  p.value.set(x, y, z, 1);
  d.value.set(dx, dy, dz, beam);
}

function slotOn(i: number, slots: any, live: any): any {
  // `float(i) + 0.5` stringifies the node. step() then stores a string and dies in getInputType.
  return step(float(i).add(0.5), slots).mul(step(0.5, live));
}

/** 0..1, how far a point sits inside a halo or a shaft. */
export function lightGain(center: any): any {
  let gain = float(0);
  for (let i = 0; i < AIR_LIGHT_SLOTS; i++) {
    const p = lightP[i]!;
    const dist = length(center.sub(p.xyz));
    const fall = exp(dist.div(max(p.w, 1.0)).mul(-1.35));
    gain = max(gain, fall.mul(slotOn(i, U.rainSlots, p.w)));
  }
  for (let i = 0; i < AIR_SHAFT_SLOTS; i++) {
    const o = shaftP[i]!.xyz;
    const dir = shaftD[i]!.xyz;
    const len = shaftD[i]!.w;
    const rel = center.sub(o);
    const along = clamp(dot(rel, dir), 0.0, max(len, 0.001));
    const radial = length(rel.sub(dir.mul(along)));
    const beamR = mix(float(1.15), float(6.2), along.div(max(len, 1.0)));
    const fall = exp(radial.div(beamR).mul(-1.4));
    const end = smoothstep(float(0.0), len.mul(0.1), along).mul(smoothstep(len, len.mul(0.68), along));
    gain = max(gain, fall.mul(end).mul(slotOn(i, U.shaftSlots, len)));
  }
  return gain;
}

/** Coloured addition for a streak that is inside a halo. Shafts add white in the caller. */
export function lightTint(center: any): any {
  let col = vec3(0, 0, 0);
  for (let i = 0; i < AIR_LIGHT_SLOTS; i++) {
    const p = lightP[i]!;
    const dist = length(center.sub(p.xyz));
    const fall = exp(dist.div(max(p.w, 1.0)).mul(-1.35));
    col = col.add(lightC[i].mul(fall).mul(slotOn(i, U.rainSlots, p.w)));
  }
  let shaft = float(0);
  for (let i = 0; i < AIR_SHAFT_SLOTS; i++) {
    const o = shaftP[i]!.xyz;
    const dir = shaftD[i]!.xyz;
    const len = shaftD[i]!.w;
    const rel = center.sub(o);
    const along = clamp(dot(rel, dir), 0.0, max(len, 0.001));
    const radial = length(rel.sub(dir.mul(along)));
    const beamR = mix(float(1.15), float(6.2), along.div(max(len, 1.0)));
    const fall = exp(radial.div(beamR).mul(-1.4));
    const end = smoothstep(float(0.0), len.mul(0.1), along).mul(smoothstep(len, len.mul(0.68), along));
    shaft = max(shaft, fall.mul(end).mul(slotOn(i, U.shaftSlots, len)));
  }
  return col.add(vec3(0.85, 0.9, 1.0).mul(shaft));
}
