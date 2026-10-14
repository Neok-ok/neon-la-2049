// Ground vehicles. Forward is −Z, origin on the tyre contact, same as the spinner.
// Car and hauler are Blender glTF (public/models/traffic). The game bakes them to one
// geometry on the shared wet material, so each class stays a single instanced draw.
// Van, box and tanker stay authored boxes. No badges, no film vehicles.
// The canyon rickshaw is the compact mesh scaled, not a second model.
import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, Mesh,
  MeshStandardNodeMaterial, type Material, type Object3D,
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as TSL from 'three/tsl';
import type { Tier } from '../core/quality';
import { resources } from '../core/memory/resources';
import { U } from '../atmosphere/uniforms';
import { authoredLiftU } from '../lighting/shade.ts';

const T = TSL as any;

export type MeshId = 'car' | 'van' | 'box' | 'hauler' | 'tanker';
export type VehicleLod = 'low' | 'medium' | 'high';

/** Measured high-LOD bounds. tools/scale-audit reads these and public/models/traffic/bounds.json. */
export const CAR_L = 5.06;
export const CAR_W = 1.78;
export const CAR_H = 1.466;
export const HAULER_L = 16.2;
export const HAULER_W = 2.316;
export const HAULER_H = 3.887;

export const MESH_LEN: Record<MeshId, number> = {
  car: CAR_L,
  van: 5.55,
  box: 7.9,
  hauler: HAULER_L,
  tanker: 10.8,
};

const BODY = {
  car: new Color(0.11, 0.12, 0.13),
  van: new Color(0.15, 0.13, 0.11),
  box: new Color(0.17, 0.16, 0.14),
  hauler: new Color(0.1, 0.11, 0.12),
  tanker: new Color(0.16, 0.17, 0.18),
};
const CABIN = {
  car: new Color(0.07, 0.075, 0.08),
  van: new Color(0.09, 0.085, 0.08),
  box: new Color(0.08, 0.08, 0.085),
  hauler: new Color(0.06, 0.065, 0.07),
  tanker: new Color(0.07, 0.075, 0.08),
};
const WHITE = new Color(1.75, 1.55, 1.2);
const RED = new Color(1.85, 0.07, 0.04);
const AMBER = new Color(1.45, 0.48, 0.06);

const TRIM = new Color(0.55, 0.56, 0.58);
const GLASS = new Color(0.045, 0.05, 0.055);
const RUBBER = new Color(0.015, 0.015, 0.016);
const RECESS = new Color(0.035, 0.037, 0.04);

function tag(g: BufferGeometry, color: Color, emit: number): BufferGeometry {
  const g2 = g.index ? g.toNonIndexed() : g;
  if (g2 !== g) g.dispose();
  g2.deleteAttribute('uv');
  g2.deleteAttribute('uv1');
  g2.deleteAttribute('tangent');
  if (!g2.getAttribute('normal')) g2.computeVertexNormals();
  const n = g2.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    c.set([color.r, color.g, color.b], i * 3);
    e[i] = emit;
  }
  g2.setAttribute('color', new Float32BufferAttribute(c, 3));
  g2.setAttribute('emit', new Float32BufferAttribute(e, 1));
  return g2;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: Color, emit: number): BufferGeometry {
  return tag(new BoxGeometry(w, h, d).translate(x, y, z), color, emit);
}

function merged(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!g) throw new Error('vehicle merge failed');
  g.computeBoundingSphere();
  return g;
}

function build(): Record<MeshId, BufferGeometry> {
  const cabinH = CAR_H * 0.42;
  const cabinBase = CAR_H - cabinH;
  const bodyH = cabinBase - 0.14;
  const car = merged([
    box(CAR_W, bodyH, CAR_L, 0, 0.14 + bodyH / 2, 0, BODY.car, 0),
    box(CAR_W * 0.72, cabinH, CAR_L * 0.46, 0, cabinBase + cabinH / 2, -0.12, CABIN.car, 0),
    box(0.55, 0.05, 0.04, 0, 0.46, -CAR_L / 2 + 0.06, WHITE, 1),
    box(0.6, 0.045, 0.04, 0, 0.44, CAR_L / 2 - 0.06, RED, 1),
  ]);
  const van = merged([
    box(2.02, 1.42, 3.85, 0, 1.02, 0.55, BODY.van, 0),
    box(1.9, 0.7, 1.5, 0, 0.58, -1.82, CABIN.van, 0),
    box(1.55, 0.08, 0.06, 0, 0.55, -2.6, WHITE, 1),
    box(1.7, 0.07, 0.05, 0, 0.7, 2.5, RED, 1),
  ]);
  const truck = merged([
    box(2.15, 1.55, 2.2, 0, 1.05, -2.55, CABIN.box, 0),
    box(2.42, 2.15, 5.15, 0, 1.5, 1.15, BODY.box, 0),
    box(1.7, 0.08, 0.06, 0, 0.62, -3.68, WHITE, 1),
    box(2.1, 0.08, 0.06, 0, 0.85, 3.75, RED, 1),
    box(0.12, 0.1, 0.1, -1.05, 2.55, 3.55, AMBER, 1),
    box(0.12, 0.1, 0.1, 1.05, 2.55, 3.55, AMBER, 1),
  ]);
  const trailerH = HAULER_H - 1.22;
  const hauler = merged([
    box(HAULER_W * 0.9, 2.2, 2.5, 0, 1.35, -HAULER_L / 2 + 1.55, CABIN.hauler, 0),
    box(HAULER_W, trailerH, HAULER_L - 3.3, 0, 1.22 + trailerH / 2, 0.55, BODY.hauler, 0),
    box(0.7, 0.06, 0.05, 0, 0.9, -HAULER_L / 2 + 0.08, WHITE, 1),
    box(1.6, 0.07, 0.05, 0, 1.5, HAULER_L / 2 - 0.08, RED, 1),
  ]);
  // Horizontal tank. The cylinder is original geometry, not a branded trailer.
  const shell = new CylinderGeometry(1.05, 1.05, 6.8, 10, 1, false);
  shell.rotateX(Math.PI / 2);
  shell.translate(0, 1.62, 0.7);
  const tanker = merged([
    box(2.15, 1.8, 2.15, 0, 1.12, -3.45, CABIN.tanker, 0),
    tag(shell, BODY.tanker, 0),
    box(2.2, 0.16, 6.6, 0, 2.7, 0.7, new Color(0.12, 0.13, 0.14), 0),
    box(1.7, 0.08, 0.06, 0, 0.62, -4.55, WHITE, 1),
    box(1.9, 0.08, 0.06, 0, 1.15, 4.15, RED, 1),
    box(0.12, 0.1, 0.1, -0.85, 2.85, 3.9, AMBER, 1),
    box(0.12, 0.1, 0.1, 0.85, 2.85, 3.9, AMBER, 1),
  ]);
  return { car, van, box: truck, hauler, tanker };
}

let solids: Record<MeshId, BufferGeometry> | null = null;

const SOLID_LABEL: Record<MeshId, string> = {
  car: 'traffic-car-fallback',
  van: 'traffic-van',
  box: 'traffic-box',
  hauler: 'traffic-hauler-fallback',
  tanker: 'traffic-tanker',
};

function fallback(id: MeshId): BufferGeometry {
  if (!solids) {
    const ids: MeshId[] = ['car', 'van', 'box', 'hauler', 'tanker'];
    const made = {} as Record<MeshId, BufferGeometry>;
    for (const key of ids) {
      made[key] = resources.geometry(() => {
        const all = build();
        for (const other of ids) if (other !== key) all[other].dispose();
        return all[key];
      }, { label: SOLID_LABEL[key], owner: 'traffic', evictable: false });
    }
    solids = made;
  }
  return solids[id];
}

/** Ultra and high share the full mesh. Medium is lighter. Low is the shell. */
export function vehicleLodForTier(tier: Tier): VehicleLod {
  if (tier === 'low') return 'low';
  if (tier === 'medium') return 'medium';
  return 'high';
}

const loader = new GLTFLoader();
let decoderReady: Promise<void> | null = null;
const baked = new Map<string, BufferGeometry>();
const pending = new Map<string, Promise<void>>();
let activeLod: VehicleLod = 'high';

function ensureDecoder(): Promise<void> {
  if (!decoderReady) {
    loader.setMeshoptDecoder(MeshoptDecoder);
    decoderReady = MeshoptDecoder.ready;
  }
  return decoderReady;
}

function kindOf(mesh: Mesh): string {
  const src = mesh.material;
  const mat = Array.isArray(src) ? src[0] : src;
  const n = `${mat?.name ?? ''} ${mesh.name}`.toLowerCase();
  if (n.includes('amber')) return 'amber';
  if (n.includes('white')) return 'white';
  if (n.includes('red')) return 'red';
  if (n.includes('glass')) return 'glass';
  if (n.includes('rubber')) return 'rubber';
  if (n.includes('recess')) return 'recess';
  if (n.includes('trim')) return 'trim';
  return 'body';
}

function paintOf(id: 'car' | 'hauler', kind: string): { color: Color; emit: number } {
  if (kind === 'white') return { color: WHITE, emit: 1 };
  if (kind === 'red') return { color: RED, emit: 1 };
  if (kind === 'amber') return { color: AMBER, emit: 1 };
  if (kind === 'glass') return { color: GLASS, emit: 0 };
  if (kind === 'rubber') return { color: RUBBER, emit: 0 };
  if (kind === 'recess') return { color: RECESS, emit: 0 };
  if (kind === 'trim') return { color: TRIM, emit: 0 };
  return { color: id === 'hauler' ? BODY.hauler : BODY.car, emit: 0 };
}

// gltfpack stores positions as uint16 with the decode scale on the node.
// applyMatrix4 writes the transformed floats back into that array, and uint16
// wraps them to 0 / 65535, so the baked car collapses. Expand to float32 first.
function asFloat32(geo: BufferGeometry, name: string): void {
  const attr = geo.getAttribute(name);
  if (!attr || attr.array instanceof Float32Array) return;
  const item = attr.itemSize;
  const out = new Float32Array(attr.count * item);
  for (let i = 0; i < attr.count; i++) {
    const o = i * item;
    out[o] = attr.getX(i);
    if (item > 1) out[o + 1] = attr.getY(i);
    if (item > 2) out[o + 2] = attr.getZ(i);
  }
  geo.setAttribute(name, new Float32BufferAttribute(out, item));
}

function bake(root: Object3D, id: 'car' | 'hauler'): BufferGeometry {
  root.updateWorldMatrix(true, true);
  const parts: BufferGeometry[] = [];
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.geometry.clone();
    asFloat32(src, 'position');
    asFloat32(src, 'normal');
    src.applyMatrix4(mesh.matrixWorld);
    const paint = paintOf(id, kindOf(mesh));
    parts.push(tag(src, paint.color, paint.emit));
  });
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error(`traffic ${id} bake produced no geometry`);
  merged.computeBoundingSphere();
  return merged;
}

function disposeTemplate(root: Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of list) {
      const maps = mat as Material & { map?: { dispose(): void } | null; emissiveMap?: { dispose(): void } | null };
      maps.map?.dispose();
      maps.emissiveMap?.dispose();
      mat.dispose();
    }
  });
}

function loadBaked(id: 'car' | 'hauler', lod: VehicleLod): Promise<void> {
  const key = `${id}-${lod}`;
  const url = `${import.meta.env.BASE_URL}models/traffic/${key}.glb`;
  return ensureDecoder().then(() => new Promise<void>((resolve, reject) => {
    loader.load(url, (gltf) => {
      try {
        const geo = resources.geometry(() => bake(gltf.scene, id), {
          label: `traffic-${key}`,
          owner: 'traffic',
          evictable: false,
        });
        disposeTemplate(gltf.scene);
        baked.set(key, geo);
        resolve();
      } catch (err) {
        disposeTemplate(gltf.scene);
        reject(err);
      }
    }, undefined, reject);
  }));
}

/** Start the glTF for this tier. Safe to call every frame. Low still binds a mesh. */
export function setVehicleLod(tier: Tier): void {
  activeLod = vehicleLodForTier(tier);
  for (const id of ['car', 'hauler'] as const) {
    const key = `${id}-${activeLod}`;
    if (baked.has(key) || pending.has(key)) continue;
    const job = loadBaked(id, activeLod).catch(() => undefined).finally(() => pending.delete(key));
    pending.set(key, job);
  }
}

export function vehicleGeometry(id: MeshId): BufferGeometry {
  if (id === 'car' || id === 'hauler') {
    const hit = baked.get(`${id}-${activeLod}`);
    if (hit) return hit;
  }
  return fallback(id);
}

/** Wet metal for the body, emissive where `emit` is 1. Shared by every class. */
export function vehicleMaterial(): MeshStandardNodeMaterial {
  return resources.material('ground-vehicle', () => {
    const m = new MeshStandardNodeMaterial();
    const col = T.attribute('color', 'vec3');
    const emit = T.attribute('emit', 'float');
    const lamp = T.step(T.float(0.5), emit);
    m.colorNode = col.mul(T.mix(T.float(1), T.float(0.58), U.wetness.mul(T.float(1).sub(lamp))));
    m.emissiveNode = col.mul(lamp).mul(T.mix(T.float(0.42), T.float(1.7), U.night)).mul(authoredLiftU);
    m.roughnessNode = T.mix(T.mix(T.float(0.4), T.float(0.15), U.wetness), T.float(0.48), lamp);
    m.metalnessNode = T.mix(T.float(0.64), T.float(0.02), lamp);
    return m;
  });
}
