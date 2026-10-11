// One decoded mesh from a human glb. Skin joints stay out of GPU memory:
// the shader reads the bone id from uv1 and the pose from the shared palette.
import { BufferAttribute, BufferGeometry, Mesh, Vector3 } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const gltf = new GLTFLoader();
let decoderReady: Promise<void> | null = null;

function ensureDecoder(): Promise<void> {
  if (!decoderReady) {
    gltf.setMeshoptDecoder(MeshoptDecoder);
    decoderReady = MeshoptDecoder.ready;
  }
  return decoderReady;
}

function loadGltf(fileUrl: string): Promise<{ scene: { traverse(cb: (obj: unknown) => void): void }; animations: unknown[] }> {
  return new Promise((resolve, reject) => {
    gltf.load(fileUrl, resolve, undefined, reject);
  });
}

/** Bytes retained by the attributes we still reference. Shared buffers count once. */
export function retainedGeometryBytes(geo: BufferGeometry | null | undefined, skip?: ReadonlySet<string>): number {
  if (!geo) return 0;
  const seen = new Set<ArrayBufferLike>();
  let bytes = 0;
  const add = (array?: ArrayBufferView | null) => {
    if (!array) return;
    const buf = array.buffer;
    if (seen.has(buf)) return;
    seen.add(buf);
    bytes += buf.byteLength;
  };
  for (const [name, attr] of Object.entries(geo.attributes)) {
    if (skip?.has(name)) continue;
    add(attr?.array);
  }
  add(geo.index?.array ?? null);
  return bytes;
}

function stripSkin(geo: BufferGeometry): void {
  geo.deleteAttribute('skinIndex');
  geo.deleteAttribute('skinWeight');
}

/** Atlas UVs fit in a normalized uint16. Part and bone ids stay raw integers. */
function packVec2(geo: BufferGeometry, name: string, normalized: boolean): void {
  const attr = geo.getAttribute(name);
  if (!attr || attr.array instanceof Uint16Array) return;
  const u = new Uint16Array(attr.count * 2);
  for (let i = 0; i < attr.count; i++) {
    const x = attr.getX(i);
    const y = attr.getY(i);
    if (normalized) {
      u[i * 2] = Math.max(0, Math.min(65535, Math.round(x * 65535)));
      u[i * 2 + 1] = Math.max(0, Math.min(65535, Math.round(y * 65535)));
    } else {
      u[i * 2] = Math.max(0, Math.min(65535, Math.round(x)));
      u[i * 2 + 1] = Math.max(0, Math.min(65535, Math.round(y)));
    }
  }
  geo.setAttribute(name, new BufferAttribute(u, 2, normalized));
}

const _v = new Vector3();

/**
 * gltfpack stores positions as uint16 and the metre scale on the node.
 * The bone palette is in metres, so the scale has to be in the vertex
 * before the shader skins. applyMatrix4 on a Uint16Array would truncate.
 */
function bakeNodePosition(mesh: Mesh): void {
  mesh.updateWorldMatrix(true, false);
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position');
  if (!pos) return;
  const m = mesh.matrixWorld;
  const floats = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    _v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(m);
    floats[i * 3] = _v.x;
    floats[i * 3 + 1] = _v.y;
    floats[i * 3 + 2] = _v.z;
  }
  geo.setAttribute('position', new BufferAttribute(floats, 3));
  geo.computeBoundingSphere();
}

/** Largest mesh in the file. glTF materials and the skin attributes are dropped. */
export async function loadHumanGeometry(fileUrl: string): Promise<BufferGeometry> {
  await ensureDecoder();
  const asset = await loadGltf(fileUrl);
  let best: Mesh | null = null;
  let n = 0;
  asset.scene.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const count = mesh.geometry.getAttribute('position')?.count ?? 0;
    if (count >= n) {
      n = count;
      best = mesh;
    }
  });
  if (!best) throw new Error(`no mesh in ${fileUrl}`);
  const mesh: Mesh = best;
  bakeNodePosition(mesh);
  const geometry = mesh.geometry;
  packVec2(geometry, 'uv', true);
  packVec2(geometry, 'uv1', false);
  stripSkin(geometry);
  const blank = new BufferGeometry();
  asset.scene.traverse((obj) => {
    const other = obj as Mesh;
    if (!other.isMesh) return;
    const mats = Array.isArray(other.material) ? other.material : [other.material];
    for (const m of mats) m?.dispose();
    if (other.geometry && other.geometry !== geometry) other.geometry.dispose();
    if (other.geometry === geometry) other.geometry = blank;
  });
  asset.animations.length = 0;
  return geometry;
}
