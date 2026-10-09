// Nearest hologram projectors, written every frame. Fabric and kit shaders add a wrapped
// falloff so the colour lands on real geometry. Four slots: a fixed loop, no uniform array
// (float uniform arrays mis-index on the WebGL2 fallback).
import { uniform } from 'three/tsl';
import { Color, Vector4 } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';

const T = TSL as any;
const { vec3, length, max, exp, normalize, step, dot, positionWorld, normalWorld } = T;

export const HOLO_SPILL_SLOTS = 4;

const pos = [0, 1, 2, 3].map(() => uniform(new Vector4(0, 0, 0, 0)));
const col = [0, 1, 2, 3].map(() => uniform(new Color(0, 0, 0)));

export function setHoloSpill(i: number, x: number, y: number, z: number, radius: number, r: number, g: number, b: number): void {
  const p = pos[i];
  const c = col[i];
  if (!p || !c) return;
  p.value.set(x, y, z, radius);
  c.value.setRGB(r, g, b);
}

export function clearHoloSpill(): void {
  for (let i = 0; i < HOLO_SPILL_SLOTS; i++) {
    const p = pos[i];
    if (p) p.value.w = 0;
  }
}

/** Emissive addition for a lit surface. Cheap enough to live on the shared city and kit materials. */
export function hologramSpill(): any {
  const n = normalWorld;
  const wpos = positionWorld;
  let acc = vec3(0, 0, 0);
  for (let i = 0; i < HOLO_SPILL_SLOTS; i++) {
    const p = pos[i];
    const center = p.xyz;
    const radius = p.w;
    const delta = center.sub(wpos);
    const dist = length(delta);
    const ldir = normalize(delta);
    const wrap = max(dot(n, ldir), 0).mul(0.82).add(0.18);
    const fall = exp(dist.div(max(radius, 1)).mul(-1.55));
    const gate = step(0.5, radius);
    acc = acc.add(col[i].mul(fall).mul(wrap).mul(gate).mul(0.55));
  }
  return acc.mul(U.holoSpill).mul(U.signPower).mul(U.night.mul(0.72).add(0.28));
}
