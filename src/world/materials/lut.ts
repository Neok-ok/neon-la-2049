// Small constant lookup tables for node materials. Implemented as a select() chain instead of
// uniformArray(): float uniform arrays index incorrectly on the WebGL2 fallback backend.
import * as TSL from 'three/tsl';
import type { Color } from 'three/webgpu';

const T = TSL as any;
const { float, vec3, select } = T;

/** Lookup `values[round(index)]` where `index` is a float node in [0, values.length). */
export function lut(values: readonly number[], index: any): any {
  let out = float(values[values.length - 1]);
  for (let i = values.length - 2; i >= 0; i--) out = select(index.lessThan(i + 0.5), float(values[i]), out);
  return out;
}

export function lutColor(values: readonly Color[], index: any): any {
  let out = vec3(values[values.length - 1].r, values[values.length - 1].g, values[values.length - 1].b);
  for (let i = values.length - 2; i >= 0; i--) out = select(index.lessThan(i + 0.5), vec3(values[i].r, values[i].g, values[i].b), out);
  return out;
}
