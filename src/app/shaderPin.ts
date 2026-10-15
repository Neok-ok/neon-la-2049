// Unloading the last mesh of a material drops three.js's program (usedTimes hits 0).
// The next chunk then links that same shader again. One hidden stand-in per
// material and attribute layout keeps the program alive for the session.

import {
  BufferAttribute, BufferGeometry, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh,
  type Object3D, type Scene, type TypedArray,
} from 'three/webgpu';
import { params } from '../core/params';
import { resources } from '../core/memory/resources';

const pinRoot = new Group();
pinRoot.name = 'shader-pins';
pinRoot.matrixAutoUpdate = false;

const pins = new Map<string, Object3D>();
const drawn = new Set<string>();
let mounted = false;

export function mountShaderPins(scene: Scene): void {
  if (mounted) return;
  mounted = true;
  scene.add(pinRoot);
}

/** A shader variant changed. The stand-ins have to be drawn once more. */
export function resetShaderPins(): void {
  drawn.clear();
}

function signature(obj: Object3D): string | null {
  if (params.capture) return null;
  if (obj.name === 'traffic-streaks-street' || obj.name === 'shader-pin') return null;
  const mesh = obj as Mesh;
  if (!mesh.isMesh || !mesh.geometry || !mesh.material) return null;
  const mat = mesh.material;
  const id = Array.isArray(mat) ? mat.map((m) => m.uuid).join('/') : mat.uuid;
  const attrs = Object.keys(mesh.geometry.attributes).sort().map((name) => {
    const attr = mesh.geometry.attributes[name]!;
    const inst = (attr as InstancedBufferAttribute).isInstancedBufferAttribute ? 'i' : 'a';
    return `${name}:${attr.itemSize}:${attr.normalized ? 1 : 0}:${inst}`;
  }).join(',');
  const inst = (mesh as InstancedMesh).isInstancedMesh ? 'I' : 'M';
  const color = (mesh as InstancedMesh).instanceColor ? 'c' : '';
  return `${inst}${color}|${id}|${attrs}`;
}

function makePin(src: Mesh, sig: string): Object3D {
  const geo = resources.geometry(() => {
    const g = new BufferGeometry();
    for (const name of Object.keys(src.geometry.attributes)) {
      const attr = src.geometry.attributes[name]!;
      const itemSize = attr.itemSize || 1;
      const normalized = !!attr.normalized;
      const instanced = !!(attr as InstancedBufferAttribute).isInstancedBufferAttribute;
      const n = instanced ? 1 : 3;
      const Ctor = (attr.array?.constructor ?? Float32Array) as new (length: number) => TypedArray;
      const arr = new Ctor(Math.max(itemSize, n * itemSize));
      g.setAttribute(name, instanced
        ? new InstancedBufferAttribute(arr, itemSize, normalized)
        : new BufferAttribute(arr, itemSize, normalized));
    }
    if (src.geometry.getIndex()) g.setIndex([0, 1, 2]);
    g.computeBoundingSphere();
    return g;
  }, { label: 'shader-pin', owner: 'shaders', evictable: false });

  const isInst = (src as InstancedMesh).isInstancedMesh === true;
  const pin = isInst ? new InstancedMesh(geo, src.material, 1) : new Mesh(geo, src.material);
  if (isInst) {
    const im = pin as InstancedMesh;
    im.count = 1;
    im.setMatrixAt(0, new Matrix4());
    im.instanceMatrix.needsUpdate = true;
    const color = (src as InstancedMesh).instanceColor;
    if (color) im.instanceColor = new InstancedBufferAttribute(new Float32Array(color.itemSize || 3), color.itemSize || 3);
  }
  pin.name = 'shader-pin';
  pin.frustumCulled = false;
  pin.matrixAutoUpdate = false;
  pin.userData.shaderPin = sig;
  pin.position.set(0, -8000, 0);
  pin.updateMatrix();
  pin.visible = false;
  return pin;
}

/**
 * The first draw of this layout. Null once that stand-in has been drawn.
 * The caller draws the returned object, then `markShaderPinDrawn`.
 */
export function ensureShaderPin(obj: Object3D): Object3D | null {
  const sig = signature(obj);
  if (!sig || !mounted || drawn.has(sig)) return null;
  let pin = pins.get(sig);
  if (!pin) {
    pin = makePin(obj as Mesh, sig);
    pins.set(sig, pin);
    pinRoot.add(pin);
  }
  return pin;
}

export function markShaderPinDrawn(pin: Object3D): void {
  const sig = pin.userData.shaderPin;
  if (typeof sig === 'string') drawn.add(sig);
  pin.visible = false;
}
