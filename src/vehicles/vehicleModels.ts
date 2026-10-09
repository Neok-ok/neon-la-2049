// Original ground vehicles. Forward is −Z, origin on the tyre contact, same as the spinner.
// One material: wet body plus emissive lamps, so each class is a single instanced draw.
// No badges, no film vehicles. The canyon rickshaw is the compact mesh scaled, not a second model.
import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, MeshStandardNodeMaterial } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TSL from 'three/tsl';
import { U } from '../atmosphere/uniforms';

const T = TSL as any;

export type MeshId = 'car' | 'van' | 'box' | 'hauler';

export const MESH_LEN: Record<MeshId, number> = {
  car: 4.35,
  van: 5.55,
  box: 7.9,
  hauler: 11.7,
};

const BODY = {
  car: new Color(0.11, 0.12, 0.13),
  van: new Color(0.15, 0.13, 0.11),
  box: new Color(0.17, 0.16, 0.14),
  hauler: new Color(0.1, 0.11, 0.12),
};
const CABIN = {
  car: new Color(0.07, 0.075, 0.08),
  van: new Color(0.09, 0.085, 0.08),
  box: new Color(0.08, 0.08, 0.085),
  hauler: new Color(0.06, 0.065, 0.07),
};
const WHITE = new Color(1.75, 1.55, 1.2);
const RED = new Color(1.85, 0.07, 0.04);
const AMBER = new Color(1.45, 0.48, 0.06);

function tag(g: BufferGeometry, color: Color, emit: number): BufferGeometry {
  const g2 = g.index ? g.toNonIndexed() : g;
  const n = g2.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    c.set([color.r, color.g, color.b], i * 3);
    e[i] = emit;
  }
  g2.setAttribute('color', new Float32BufferAttribute(c, 3));
  g2.setAttribute('emit', new Float32BufferAttribute(e, 1));
  g2.deleteAttribute('uv');
  return g2;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: Color, emit: number): BufferGeometry {
  return tag(new BoxGeometry(w, h, d).translate(x, y, z), color, emit);
}

let geos: Record<MeshId, BufferGeometry> | null = null;

function build(): Record<MeshId, BufferGeometry> {
  const car = mergeGeometries([
    box(1.82, 0.46, 4.2, 0, 0.38, 0.05, BODY.car, 0),
    box(1.62, 0.46, 1.85, 0, 0.8, -0.22, CABIN.car, 0),
    box(1.32, 0.07, 0.06, 0, 0.5, -2.08, WHITE, 1),
    box(1.38, 0.06, 0.05, 0, 0.48, 2.12, RED, 1),
  ])!;
  const van = mergeGeometries([
    box(2.02, 1.42, 3.85, 0, 1.02, 0.55, BODY.van, 0),
    box(1.9, 0.7, 1.5, 0, 0.58, -1.82, CABIN.van, 0),
    box(1.55, 0.08, 0.06, 0, 0.55, -2.6, WHITE, 1),
    box(1.7, 0.07, 0.05, 0, 0.7, 2.5, RED, 1),
  ])!;
  const truck = mergeGeometries([
    box(2.15, 1.55, 2.2, 0, 1.05, -2.55, CABIN.box, 0),
    box(2.42, 2.15, 5.15, 0, 1.5, 1.15, BODY.box, 0),
    box(1.7, 0.08, 0.06, 0, 0.62, -3.68, WHITE, 1),
    box(2.1, 0.08, 0.06, 0, 0.85, 3.75, RED, 1),
    box(0.12, 0.1, 0.1, -1.05, 2.55, 3.55, AMBER, 1),
    box(0.12, 0.1, 0.1, 1.05, 2.55, 3.55, AMBER, 1),
  ])!;
  const hauler = mergeGeometries([
    box(2.35, 1.95, 2.4, 0, 1.25, -4.4, CABIN.hauler, 0),
    box(2.55, 2.2, 8.2, 0, 1.75, 1.05, BODY.hauler, 0),
    box(1.9, 0.09, 0.07, 0, 0.7, -5.62, WHITE, 1),
    box(2.2, 0.09, 0.07, 0, 0.95, 5.18, RED, 1),
    box(0.14, 0.12, 0.12, -1.15, 2.9, 4.9, AMBER, 1),
    box(0.14, 0.12, 0.12, 1.15, 2.9, 4.9, AMBER, 1),
    box(0.14, 0.12, 0.12, -1.15, 2.9, -2.6, AMBER, 1),
    box(0.14, 0.12, 0.12, 1.15, 2.9, -2.6, AMBER, 1),
  ])!;
  return { car, van, box: truck, hauler };
}

export function vehicleGeometry(id: MeshId): BufferGeometry {
  if (!geos) geos = build();
  return geos[id];
}

let mat: MeshStandardNodeMaterial | null = null;

/** Wet metal for the body, emissive where `emit` is 1. Shared by every class. */
export function vehicleMaterial(): MeshStandardNodeMaterial {
  if (mat) return mat;
  const m = new MeshStandardNodeMaterial();
  const col = T.attribute('color', 'vec3');
  const emit = T.attribute('emit', 'float');
  const lamp = T.step(T.float(0.5), emit);
  m.colorNode = col.mul(T.mix(T.float(1), T.float(0.58), U.wetness.mul(T.float(1).sub(lamp))));
  m.emissiveNode = col.mul(lamp).mul(T.mix(T.float(0.42), T.float(1.7), U.night));
  m.roughnessNode = T.mix(T.mix(T.float(0.4), T.float(0.15), U.wetness), T.float(0.48), lamp);
  m.metalnessNode = T.mix(T.float(0.64), T.float(0.02), lamp);
  mat = m;
  return m;
}
