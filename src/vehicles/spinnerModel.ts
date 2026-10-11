// Original low-poly "spinner" (flying police car) in the angular 2049 pattern language. ~5.0 x 2.3 x 1.45 m.
// Forward = -Z. Origin at the ground contact centre.
import {
  BoxGeometry, BufferGeometry, Color, ExtrudeGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicNodeMaterial,
  MeshStandardNodeMaterial, Shape, type Material, type Object3D, type Texture,
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as TSL from 'three/tsl';
import { U } from '../atmosphere/uniforms';
import type { Tier } from '../core/quality';

const T = TSL as any;

export const SPINNER_DIMS = { length: 5.0, width: 2.3, height: 1.45 };

function extrudeProfile(pts: number[][], width: number): BufferGeometry {
  const sh = new Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  const g = new ExtrudeGeometry(sh, { depth: width, bevelEnabled: false });
  g.rotateY(Math.PI / 2); // shape X (forward) -> -Z
  g.translate(-width / 2, 0, 0);
  return g;
}

function colored(g: BufferGeometry, c: Color): BufferGeometry {
  const g2 = g.index ? g.toNonIndexed() : g;
  const n = g2.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g2.setAttribute('color', new Float32BufferAttribute(a, 3));
  return g2;
}

let cache: { body: BufferGeometry; glass: BufferGeometry; lights: BufferGeometry } | null = null;

export function spinnerGeometries() {
  if (cache) return cache;
  const L = SPINNER_DIMS.length / 2;
  const hull = extrudeProfile(
    [[-L, 0.32], [L - 0.15, 0.36], [L, 0.55], [L - 0.9, 0.86], [-L + 0.5, 0.95], [-L, 0.8]],
    2.1,
  );
  const cabin = extrudeProfile([[1.25, 0.84], [0.25, 1.43], [-1.25, 1.4], [-1.55, 0.9]], 1.78);
  const podL = new BoxGeometry(0.42, 0.62, 1.7).translate(-1.12, 0.42, 1.25).toNonIndexed();
  const podR = new BoxGeometry(0.42, 0.62, 1.7).translate(1.12, 0.42, 1.25).toNonIndexed();
  const fpodL = new BoxGeometry(0.34, 0.45, 1.1).translate(-1.08, 0.38, -1.55).toNonIndexed();
  const fpodR = new BoxGeometry(0.34, 0.45, 1.1).translate(1.08, 0.38, -1.55).toNonIndexed();
  for (const g of [hull, podL, podR, fpodL, fpodR]) g.deleteAttribute('uv');
  cabin.deleteAttribute('uv');
  const body = mergeGeometries([hull, podL, podR, fpodL, fpodR])!;
  const white = new Color(1.6, 1.5, 1.3), red = new Color(2.2, 0.08, 0.05), blue = new Color(0.15, 0.35, 2.5);
  const lights = mergeGeometries([
    colored(new BoxGeometry(1.7, 0.06, 0.05).translate(0, 0.62, -L - 0.01), white),
    colored(new BoxGeometry(1.9, 0.08, 0.05).translate(0, 0.78, L + 0.01), red),
    colored(new BoxGeometry(0.5, 0.08, 0.18).translate(-0.3, 1.47, -0.2), red),
    colored(new BoxGeometry(0.5, 0.08, 0.18).translate(0.3, 1.47, -0.2), blue),
  ].map((g) => { g.deleteAttribute('uv'); return g; }))!;
  cache = { body, glass: cabin, lights };
  return cache;
}

let mats: { body: MeshStandardNodeMaterial; glass: MeshStandardNodeMaterial; lights: MeshBasicNodeMaterial } | null = null;

export function spinnerMaterials() {
  if (mats) return mats;
  const body = new MeshStandardNodeMaterial({ color: 0x1a1c1f, metalness: 0.7, roughness: 0.32 });
  body.roughnessNode = T.mix(T.float(0.36), T.float(0.12), U.wetness);
  const glass = new MeshStandardNodeMaterial({ color: 0x07090b, metalness: 0.9, roughness: 0.06 });
  const lights = new MeshBasicNodeMaterial({ vertexColors: true });
  // police bar strobes: modulate red/blue channels in alternation
  lights.colorNode = T.Fn(() => {
    const c = T.attribute('color', 'vec3');
    const s = T.step(0.5, T.fract(U.time.mul(2.5)));
    const isBar = T.step(1.5, c.x.add(c.z)).mul(T.step(c.y, 0.5));
    const k = T.mix(T.float(1), T.mix(s, T.float(1).sub(s), T.step(c.z, c.x)), isBar);
    return c.mul(k.mul(0.85).add(0.15));
  })();
  mats = { body, glass, lights };
  return mats;
}

/** The pre-M1 shell. Traffic stays on spinnerGeometries(); the turntable uses this as the "before" sheet. */
export function createLegacySpinnerMesh(): Group {
  const g = spinnerGeometries();
  const m = spinnerMaterials();
  const grp = new Group();
  grp.name = 'legacy-spinner';
  grp.add(new Mesh(g.body, m.body), new Mesh(g.glass, m.glass), new Mesh(g.lights, m.lights));
  return grp;
}

export type SpinnerLod = 'low' | 'medium' | 'high';

/** Ultra and high share the full mesh. Medium is the lighter LOD. Low is the simple shell. */
export function spinnerLodForTier(tier: Tier): SpinnerLod {
  if (tier === 'low') return 'low';
  if (tier === 'medium') return 'medium';
  return 'high';
}

function spinnerUrl(lod: SpinnerLod): string {
  return `${import.meta.env.BASE_URL}models/spinner/spinner-${lod}.glb`;
}

const loader = new GLTFLoader();
let decoderReady: Promise<void> | null = null;
const templates = new Map<string, Promise<Group>>();

function ensureDecoder(): Promise<void> {
  if (!decoderReady) {
    loader.setMeshoptDecoder(MeshoptDecoder);
    decoderReady = MeshoptDecoder.ready;
  }
  return decoderReady;
}

function kindOf(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('strobe-red')) return 'strobe-red';
  if (n.includes('strobe-blue')) return 'strobe-blue';
  if (n.includes('nozzle')) return 'nozzle';
  if (n.includes('amber')) return 'amber';
  if (n.includes('white')) return 'white';
  if (n.includes('blue')) return 'blue';
  if (n.includes('red')) return 'red';
  if (n.includes('glass')) return 'glass';
  if (n.includes('recess')) return 'recess';
  return 'body';
}

const LAMP: Record<string, Color> = {
  white: new Color(1.6, 1.5, 1.3),
  red: new Color(2.2, 0.08, 0.05),
  blue: new Color(0.15, 0.35, 2.5),
  amber: new Color(1.35, 0.42, 0.08),
  nozzle: new Color(0.85, 0.22, 0.04),
};

function dressMaterial(src: Material): Material {
  const kind = kindOf(src.name);
  const map = (src as Material & { map?: Texture | null }).map ?? null;
  if (kind === 'body' || kind === 'recess') {
    const m = new MeshStandardNodeMaterial({
      color: map ? 0xffffff : kind === 'body' ? 0x1a1c1f : 0x0a0b0c,
      metalness: kind === 'body' ? 0.72 : 0.28,
      roughness: kind === 'body' ? 0.4 : 0.72,
      name: src.name,
    });
    if (map) m.map = map;
    const dry = kind === 'body' ? 0.4 : 0.72;
    m.roughnessNode = T.mix(T.float(dry), T.float(0.12), U.wetness);
    return m;
  }
  if (kind === 'glass') {
    return new MeshStandardNodeMaterial({ color: 0x07090b, metalness: 0.9, roughness: 0.06, name: src.name });
  }
  const basic = new MeshBasicNodeMaterial({ name: src.name });
  if (kind === 'strobe-red' || kind === 'strobe-blue') {
    const on = kind === 'strobe-red' ? T.vec3(2.2, 0.08, 0.05) : T.vec3(0.15, 0.35, 2.5);
    const off = T.vec3(0.12, 0.02, 0.02);
    const pulse = T.step(0.5, T.fract(U.time.mul(2.5)));
    const k = kind === 'strobe-red' ? pulse : T.float(1).sub(pulse);
    basic.colorNode = T.mix(off, on, k);
  } else {
    basic.color.copy(LAMP[kind] ?? LAMP.white);
  }
  return basic;
}

/** Swap glTF materials for the game's wet-metal body and HDR lamps. Safe to call once per template. */
export function dressSpinner(root: Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const src = mesh.material;
    const list = Array.isArray(src) ? src : [src];
    const next = list.map((mat) => dressMaterial(mat));
    list.forEach((mat) => mat.dispose());
    mesh.material = Array.isArray(src) ? next : next[0];
  });
}

function loadTemplate(url: string): Promise<Group> {
  let pending = templates.get(url);
  if (!pending) {
    pending = ensureDecoder().then(() => new Promise<Group>((resolve, reject) => {
      loader.load(url, (gltf) => {
        dressSpinner(gltf.scene);
        resolve(gltf.scene);
      }, undefined, reject);
    }));
    templates.set(url, pending);
  }
  return pending;
}

/** Load one spinner glTF (already dressed). The turntable uses this; the game clones the cached template. */
export function loadSpinnerFile(url: string): Promise<Group> {
  return loadTemplate(url).then((template) => template.clone(true));
}

function countTris(root: Object3D): number {
  let tris = 0;
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    const pos = g.getAttribute('position');
    tris += g.index ? g.index.count / 3 : (pos ? pos.count / 3 : 0);
  });
  return tris;
}

/**
 * Swap the player craft to the LOD for `tier`. Keeps the mesh already on screen until the
 * new file arrives, and ignores a stale reply if the tier changed again mid-load.
 */
export function mountSpinnerLod(root: Group, tier: Tier): void {
  const lod = spinnerLodForTier(tier);
  const pending = root.userData.pending as string | undefined;
  if (pending === lod && root.userData.inflight) return;
  if (root.userData.lod === lod && root.userData.ready && !root.userData.inflight) return;
  const token = ((root.userData.token as number | undefined) ?? 0) + 1;
  root.userData.token = token;
  root.userData.pending = lod;
  root.userData.inflight = true;
  root.userData.ready = false;
  loadTemplate(spinnerUrl(lod)).then((template) => {
    if (root.userData.token !== token) return;
    for (const child of [...root.children]) root.remove(child);
    root.add(template.clone(true));
    root.userData.lod = lod;
    root.userData.ready = true;
    root.userData.inflight = false;
    console.log(`[spinner] lod ${lod} ${Math.round(countTris(root))} tris`);
  }).catch((err: unknown) => {
    if (root.userData.token !== token) return;
    console.error('[spinner] lod failed', lod, err);
    root.userData.ready = true;
    root.userData.inflight = false;
    if (!root.userData.lod) root.userData.lod = 'fallback';
  });
}

export function createSpinnerMesh(tier: Tier = 'high'): Group {
  const root = new Group();
  root.name = 'player-spinner';
  root.add(createLegacySpinnerMesh());
  root.userData.ready = false;
  root.userData.lod = 'legacy';
  root.userData.token = 0;
  void mountSpinnerLod(root, tier);
  return root;
}
