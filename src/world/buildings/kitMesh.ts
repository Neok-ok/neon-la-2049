// One box, many towers. The chunk streamer and the three heroes instance this template.
// Unload disposes the clone (instance matrix, bdata, kit scale). The template stays.
import {
  BufferAttribute, BufferGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3,
} from 'three/webgpu';
import { resources } from '../../core/memory/resources';
import { KIT_STRIDE } from './kitBudget';
import { getKitMaterial } from '../materials/cityMaterial';

function pushQuad(
  pos: number[], nor: number[], fac: number[], faceA: number[], idx: number[],
  face: number, corners: ReadonlyArray<readonly [number, number, number, number, number]>,
  n: readonly [number, number, number],
): void {
  const v = pos.length / 3;
  for (const [x, y, z, u, vv] of corners) {
    pos.push(x, y, z);
    nor.push(n[0], n[1], n[2]);
    fac.push(u, vv);
    faceA.push(face);
  }
  idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
}

/** Unit box. X is width (B), Y is up from the base, Z is depth (A). Scale goes on the instance. */
export function kitTemplate(): BufferGeometry {
  return resources.sharedGeometry('b1-kit-box', () => {
  const pos: number[] = [];
  const nor: number[] = [];
  const fac: number[] = [];
  const faceA: number[] = [];
  const idx: number[] = [];
  // Wall order matches emitBox: +Z, +X, -Z, -X, then the roof. No bottom.
  pushQuad(pos, nor, fac, faceA, idx, 0, [
    [-0.5, 0, 0.5, 0, 0], [0.5, 0, 0.5, 1, 0], [0.5, 1, 0.5, 1, 1], [-0.5, 1, 0.5, 0, 1],
  ], [0, 0, 1]);
  pushQuad(pos, nor, fac, faceA, idx, 1, [
    [0.5, 0, 0.5, 0, 0], [0.5, 0, -0.5, 1, 0], [0.5, 1, -0.5, 1, 1], [0.5, 1, 0.5, 0, 1],
  ], [1, 0, 0]);
  pushQuad(pos, nor, fac, faceA, idx, 2, [
    [0.5, 0, -0.5, 0, 0], [-0.5, 0, -0.5, 1, 0], [-0.5, 1, -0.5, 1, 1], [0.5, 1, -0.5, 0, 1],
  ], [0, 0, -1]);
  pushQuad(pos, nor, fac, faceA, idx, 3, [
    [-0.5, 0, -0.5, 0, 0], [-0.5, 0, 0.5, 1, 0], [-0.5, 1, 0.5, 1, 1], [-0.5, 1, -0.5, 0, 1],
  ], [-1, 0, 0]);
  pushQuad(pos, nor, fac, faceA, idx, 4, [
    [-0.5, 1, 0.5, 0, 1], [0.5, 1, 0.5, 1, 1], [0.5, 1, -0.5, 1, 0], [-0.5, 1, -0.5, 0, 0],
  ], [0, 1, 0]);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('facade', new BufferAttribute(new Float32Array(fac), 2));
  g.setAttribute('kitFace', new BufferAttribute(new Float32Array(faceA), 1));
  g.setIndex(new BufferAttribute(new Uint16Array(idx), 1));
  g.computeBoundingSphere();
  g.name = 'b1-kit-box';
  return g;
  });
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * Instances of the shared box. `records` is KIT_STRIDE floats per box, in the mesh's local space
 * (chunk-relative for fabric, world space for heroes). Returns null when there is nothing to draw.
 * The caller must dispose the mesh when the chunk or the hero LOD unloads. Do not dispose the material.
 */
export function buildKitMesh(records: Float32Array, name: string): InstancedMesh | null {
  const n = Math.floor(records.length / KIT_STRIDE);
  if (n <= 0) return null;
  const geo = resources.geometry(() => {
    const g = kitTemplate().clone();
    // clone() shares the template's userData object. A fresh bag keeps the template shared
    // and lets chunk unload dispose this copy's instance buffers.
    g.userData = { sharedGeometry: false };
    return g;
  }, { label: name, owner: 'towers', evictable: true });
  const bdata = new Float32Array(n * 4);
  const kit = new Float32Array(n * 4);
  const mesh = new InstancedMesh(geo, getKitMaterial(), n);
  for (let i = 0; i < n; i++) {
    const o = i * KIT_STRIDE;
    const w = records[o + 4] ?? 0;
    const h = records[o + 5] ?? 0;
    const d = records[o + 6] ?? 0;
    _p.set(records[o] ?? 0, records[o + 1] ?? 0, records[o + 2] ?? 0);
    _q.setFromAxisAngle(_up, records[o + 3] ?? 0);
    _s.set(w, h, d);
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    bdata.set([records[o + 7] ?? 0, records[o + 8] ?? 0, records[o + 9] ?? 0, records[o + 10] ?? 0], i * 4);
    kit.set([w, d, h, 0], i * 4);
  }
  geo.setAttribute('bdata', new InstancedBufferAttribute(bdata, 4));
  geo.setAttribute('kit', new InstancedBufferAttribute(kit, 4));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.matrixAutoUpdate = false;
  mesh.name = name;
  mesh.userData.kitInstances = n;
  mesh.userData.sharedGeometry = false;
  return mesh;
}

/** Drop a kit mesh created by buildKitMesh. The shared template and the city material stay. */
export function disposeKitMesh(mesh: InstancedMesh): void {
  mesh.removeFromParent();
  const geo = mesh.geometry;
  if (geo && !resources.release(geo)) geo.dispose();
  mesh.dispose();
}
