// One decoded mesh from a human glb. Skin joints stay out of GPU memory:
// the shader reads the bone id from uv1 and the pose from the shared palette.
import { BufferGeometry, Mesh } from 'three/webgpu';
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

/** Largest mesh in the file. glTF materials and the skin attributes are dropped. */
export async function loadHumanGeometry(fileUrl: string): Promise<BufferGeometry> {
  await ensureDecoder();
  const asset = await loadGltf(fileUrl);
  let best: BufferGeometry | null = null;
  let n = 0;
  asset.scene.traverse((obj) => {
    const mesh = obj as { isMesh?: boolean; geometry?: BufferGeometry };
    if (!mesh.isMesh || !mesh.geometry) return;
    const count = mesh.geometry.getAttribute('position')?.count ?? 0;
    if (count >= n) {
      n = count;
      best = mesh.geometry;
    }
  });
  if (!best) throw new Error(`no mesh in ${fileUrl}`);
  const geometry: BufferGeometry = best;
  stripSkin(geometry);
  const blank = new BufferGeometry();
  asset.scene.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) m?.dispose();
    if (mesh.geometry && mesh.geometry !== geometry) mesh.geometry.dispose();
    if (mesh.geometry === geometry) mesh.geometry = blank;
  });
  asset.animations.length = 0;
  return geometry;
}
