// glTF landmarks. Ultra and high use the full mesh up close. Medium and low
// stay on the lighter files, so a phone on low does not fetch the 1024 maps.
// Placement, signs, beacons and colliders stay with the district builders.
import {
  Color, Group, Mesh, MeshStandardNodeMaterial, Vector2,
  type Material, type Object3D, type Texture,
} from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';
import type { Tier } from '../../core/quality';
import { resources } from '../../core/memory';
import lapdHighUrl from '../../../public/models/landmarks/lapd-high.glb?url';
import lapdMediumUrl from '../../../public/models/landmarks/lapd-medium.glb?url';
import lapdLowUrl from '../../../public/models/landmarks/lapd-low.glb?url';
import hallHighUrl from '../../../public/models/landmarks/hall-high.glb?url';
import hallMediumUrl from '../../../public/models/landmarks/hall-medium.glb?url';
import hallLowUrl from '../../../public/models/landmarks/hall-low.glb?url';
import wallaceHighUrl from '../../../public/models/landmarks/wallace-high.glb?url';
import wallaceMediumUrl from '../../../public/models/landmarks/wallace-medium.glb?url';
import wallaceLowUrl from '../../../public/models/landmarks/wallace-low.glb?url';

const T = TSL as any;

export type LandmarkKind = 'lapd' | 'hall' | 'wallace';
export type LandmarkLod = 'low' | 'medium' | 'high';

const URLS: Record<LandmarkKind, Record<LandmarkLod, string>> = {
  lapd: { high: lapdHighUrl, medium: lapdMediumUrl, low: lapdLowUrl },
  hall: { high: hallHighUrl, medium: hallMediumUrl, low: hallLowUrl },
  wallace: { high: wallaceHighUrl, medium: wallaceMediumUrl, low: wallaceLowUrl },
};

/** Near, mid, far. Low tier keeps the small file even beside the door. */
export function landmarkChain(tier: Tier): [LandmarkLod, LandmarkLod, LandmarkLod] {
  if (tier === 'low') return ['low', 'low', 'low'];
  if (tier === 'medium') return ['medium', 'low', 'low'];
  return ['high', 'medium', 'low'];
}

interface Slot {
  kind: LandmarkKind;
  host: Group;
  index: 0 | 1 | 2;
  lod: LandmarkLod | null;
  token: number;
}

const loader = new GLTFLoader();
let decoderReady: Promise<void> | null = null;
const templates = new Map<string, Promise<Group>>();
const slots: Slot[] = [];
let tier: Tier = 'high';
let fillToken = 0;

function ensureDecoder(): Promise<void> {
  if (!decoderReady) {
    loader.setMeshoptDecoder(MeshoptDecoder);
    decoderReady = MeshoptDecoder.ready;
  }
  return decoderReady;
}

function kindOf(name: string): string {
  const n = name.toLowerCase().replace(/\.\d+$/, '');
  const light = n.match(/light-[a-z0-9-]+/);
  if (light) return light[0];
  if (n.includes('portal-glow')) return 'portal-glow';
  if (n.includes('mouth-stone')) return 'mouth-stone';
  if (n.includes('roof-clay')) return 'roof-clay';
  if (n.includes('glass-warm')) return 'glass-warm';
  if (n.includes('glass')) return 'glass';
  if (n.includes('metal')) return 'metal';
  if (n.includes('livery')) return 'livery';
  if (n.includes('recess')) return 'recess';
  if (n.includes('fin')) return 'fin';
  if (n.includes('rubber')) return 'rubber';
  if (n.includes('satin')) return 'satin';
  return 'body';
}

type Pbr = Material & {
  map?: Texture | null;
  normalMap?: Texture | null;
  normalScale?: Vector2;
  roughnessMap?: Texture | null;
  metalnessMap?: Texture | null;
  emissive?: Color;
  emissiveIntensity?: number;
};

const LAMP: Record<string, Color> = {
  'light-white': new Color(0.9, 0.86, 0.78),
  'light-amber': new Color(0.9, 0.4, 0.08),
  'light-red': new Color(0.85, 0.05, 0.02),
  'light-blue': new Color(0.12, 0.28, 0.9),
};

function trackMap(tex: Texture | null | undefined, label: string): void {
  if (!tex) return;
  resources.tag(tex, { label, owner: 'landmarks', evictable: false });
  resources.markStreamed(tex);
}

function dressMaterial(src: Material, mesh: Mesh, kind: LandmarkKind, lod: LandmarkLod): Material {
  const role = kindOf(src.name || 'body');
  const tex = src as Pbr;
  const key = `landmark-${kind}-${lod}-${src.name || role}`;
  const hasColor = !!mesh.geometry.getAttribute('color');
  if (role === 'roof-clay') {
    return resources.material(key, () => new MeshStandardNodeMaterial({
      color: 0x7a3422,
      roughness: 0.74,
      metalness: 0.02,
      name: src.name,
    }));
  }
  if (role === 'mouth-stone') {
    const intensity = lod === 'low' ? 0.12 : 0.55;
    return resources.material(key, () => new MeshStandardNodeMaterial({
      color: 0x243038,
      roughness: 0.9,
      metalness: 0,
      emissive: new Color(0.2, 0.24, 0.3),
      emissiveIntensity: intensity,
      name: src.name,
    }));
  }
  if (role === 'portal-glow') {
    // Low keeps the mouth and drops the bloom. High stays under a clip.
    const intensity = lod === 'low' ? 0.12 : 0.48;
    return resources.material(key, () => new MeshStandardNodeMaterial({
      color: 0x1a0c06,
      roughness: 0.55,
      metalness: 0,
      emissive: new Color(0.55, 0.22, 0.06),
      emissiveIntensity: intensity,
      name: src.name,
    }));
  }
  if (role.startsWith('light-')) {
    const emissive = (LAMP[role] ?? LAMP['light-amber']!).clone();
    const intensity = lod === 'low' && kind === 'wallace' ? 0.15 : 0.7;
    return resources.material(key, () => new MeshStandardNodeMaterial({
      color: 0x14110e,
      roughness: 0.45,
      metalness: 0,
      emissive,
      emissiveIntensity: intensity,
      name: src.name,
    }));
  }
  if (role === 'glass-warm') {
    const intensity = lod === 'low' ? 0.06 : 0.16;
    return resources.material(key, () => new MeshStandardNodeMaterial({
      color: 0x140c08,
      roughness: 0.4,
      metalness: 0.02,
      emissive: new Color(0.55, 0.32, 0.1),
      emissiveIntensity: intensity,
      name: src.name,
    }));
  }
  const wet = role === 'glass' ? 0.08 : role === 'livery' ? 0.2 : role === 'recess' ? 0.22 : 0.12;
  const mat = resources.material(key, () => {
    const m = new MeshStandardNodeMaterial({
      color: role === 'metal' ? 0x8e949c : tex.map ? 0xffffff : 0x8a8680,
      metalness: role === 'glass' ? 0.55 : role === 'metal' ? 0.86 : 0.04,
      roughness: role === 'metal' ? 0.34 : tex.roughnessMap ? 1 : 0.82,
      name: src.name,
      vertexColors: hasColor,
    });
    if (tex.map) m.map = tex.map;
    if (tex.normalMap) {
      m.normalMap = tex.normalMap;
      if (tex.normalScale) m.normalScale.copy(tex.normalScale);
    }
    if (tex.roughnessMap) m.roughnessMap = tex.roughnessMap;
    if (role === 'glass') {
      m.transparent = false;
      m.opacity = 1;
      m.emissive = new Color(0.03, 0.025, 0.02);
      m.emissiveIntensity = 0.04;
      m.color = new Color(0.03, 0.028, 0.024);
      m.roughness = 0.42;
      m.metalness = 0.08;
    }
    // Rain darkens the roughness. The albedo stays the trim sheet.
    m.roughnessNode = T.mix(T.materialRoughness, T.float(wet), U.wetness);
    return m;
  });
  trackMap(tex.map, `${key}-albedo`);
  trackMap(tex.normalMap, `${key}-normal`);
  trackMap(tex.roughnessMap, `${key}-rough`);
  return mat;
}

function dress(root: Object3D, kind: LandmarkKind, lod: LandmarkLod): void {
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material;
    const list = Array.isArray(src) ? src : [src];
    const next = list.map((mat) => dressMaterial(mat, mesh, kind, lod));
    list.forEach((mat) => {
      if (!next.includes(mat)) mat.dispose();
    });
    mesh.material = Array.isArray(src) ? next : next[0]!;
    mesh.frustumCulled = true;
  });
}

function loadTemplate(kind: LandmarkKind, lod: LandmarkLod): Promise<Group> {
  const url = URLS[kind][lod];
  const key = `${kind}:${lod}`;
  let pending = templates.get(key);
  if (!pending) {
    pending = ensureDecoder().then(() => new Promise<Group>((resolve, reject) => {
      loader.load(url, (gltf) => {
        dress(gltf.scene, kind, lod);
        resolve(gltf.scene);
      }, undefined, reject);
    }));
    templates.set(key, pending);
  }
  return pending;
}

function cloneTemplate(template: Group, kind: LandmarkKind, lod: LandmarkLod): Group {
  const clone = template.clone(true);
  clone.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.geometry;
    mesh.geometry = resources.geometry(() => src.clone(), {
      label: `${kind}-${lod}`,
      owner: 'landmarks',
      evictable: true,
    });
    mesh.userData.sharedGeometry = false;
    mesh.geometry.computeBoundingSphere();
  });
  return clone;
}

function clearHost(host: Group): void {
  for (const child of [...host.children]) {
    child.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (mesh.userData.sharedGeometry) return;
      mesh.geometry.dispose();
    });
    host.remove(child);
  }
}

async function fill(slot: Slot, lod: LandmarkLod, token: number): Promise<void> {
  if (slot.lod === lod && slot.host.children.length > 0) return;
  try {
    const template = await loadTemplate(slot.kind, lod);
    if (slot.token !== token) return;
    clearHost(slot.host);
    slot.host.add(cloneTemplate(template, slot.kind, lod));
    slot.lod = lod;
  } catch (err) {
    console.error(`landmark ${slot.kind} ${lod} failed to load`, err);
  }
}

function applyChain(): void {
  const token = ++fillToken;
  const chain = landmarkChain(tier);
  const needed = new Set<string>();
  for (const slot of slots) {
    slot.token = token;
    const lod = chain[slot.index];
    needed.add(`${slot.kind}:${lod}`);
    void fill(slot, lod, token);
  }
  for (const kind of ['lapd', 'hall', 'wallace'] as const) {
    for (const lod of chain) {
      if (needed.has(`${kind}:${lod}`)) void loadTemplate(kind, lod);
    }
  }
}

/** Call before the landmark builders, and again whenever the graphics tier changes. */
export function setLandmarkTier(next: Tier): void {
  tier = next;
  const chain = landmarkChain(next);
  for (const kind of ['lapd', 'hall', 'wallace'] as const) {
    for (const lod of new Set(chain)) void loadTemplate(kind, lod);
  }
  if (slots.length) applyChain();
}

/**
 * Three stable hosts in landmark space: near, mid, far. The district adds signs
 * and the door to the near host. Swapping the tier replaces the child mesh only.
 */
export function createLandmarkLevels(kind: LandmarkKind, x: number, y: number, z: number, yaw: number): Group[] {
  const chain = landmarkChain(tier);
  return ([0, 1, 2] as const).map((index) => {
    const host = new Group();
    host.name = `${kind}-model-${index}`;
    host.position.set(x, y, z);
    host.rotation.y = yaw;
    const slot: Slot = { kind, host, index, lod: null, token: fillToken };
    slots.push(slot);
    void fill(slot, chain[index], fillToken);
    return host;
  });
}

/** Group a model host with the signs and door that belong on that LOD only. */
export function landmarkLevel(slot: Object3D, ...extra: Array<Object3D | null>): Object3D {
  const live = extra.filter((item): item is Object3D => !!item);
  if (!live.length) return slot;
  const group = new Group();
  group.name = slot.name;
  group.add(slot, ...live);
  return group;
}
