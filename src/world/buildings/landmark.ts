// Three original hero megastructures in the financial district.
// They are landmarks so sky lanes step over them and the spinner collides above the fabric ceiling.
// Each LOD is an instanced copy of the shared kit box, not a unique mesh.
// Low keeps the mass (the impostor). Medium adds the mid band. High and ultra add the near band.
// LAPD, City Hall and the Wallace pyramid are not built here.
import { Group, Mesh, type InstancedMesh, type Object3D } from 'three/webgpu';
import { hashString } from '../../core/rng';
import type { Tier } from '../../core/quality';
import { resources } from '../../core/memory/resources';
import { archDetailFromLod } from '../architecture/scale';
import { openDoorLeaf } from '../architecture/trim';
import { bearingToDir } from '../geo';
import type { Landmark } from '../layout';
import type { LandmarkLods } from '../landmarks/LandmarkLods';
import { registerLandmarkType, type LandmarkCollider, type LandmarkEnv } from '../landmarks/registry';
import { DOOR_H, DOOR_W, HERO_KINDS, doorFace } from './parts';
import { placeHero, type Placed, type PlacedBox } from './place';
import { buildKitMesh, disposeKitMesh } from './kitMesh';
import { buildingDetailCap, type BuildingCap } from './tiers';

const LOD_DIST = [1600, 5200];

const KIND_OF: Record<string, (typeof HERO_KINDS)[number]> = {
  'b1-gate': 'hero-gate',
  'b1-step': 'hero-step',
  'b1-obelisk': 'hero-obelisk',
};

interface HeroSlot {
  id: string;
  lods: LandmarkLods;
  placed: Placed;
  ground: number;
  yaw: number;
  bearing: number;
  x: number;
  z: number;
  meshes: InstancedMesh[];
}

const heroes: HeroSlot[] = [];
let heroCap: BuildingCap = 2;

function worldOf(x: number, z: number, bearing: number, s: number, t: number): [number, number] {
  const [ax, az] = bearingToDir(bearing);
  const [bx, bz] = bearingToDir(bearing + 90);
  return [x + ax * s + bx * t, z + az * s + bz * t];
}

function capsFor(cap: BuildingCap): BuildingCap[] {
  const out: BuildingCap[] = [];
  for (let c = cap; c >= 0; c--) out.push(c as BuildingCap);
  return out;
}

function distsFor(caps: BuildingCap[]): number[] {
  if (caps.length >= 3) return [LOD_DIST[0]!, LOD_DIST[1]!];
  if (caps.length === 2) return [LOD_DIST[1]!];
  return [];
}

function recordsFor(slot: HeroSlot, cap: BuildingCap): Float32Array {
  const tmp: number[] = [];
  for (const b of slot.placed.boxes) {
    if (!keepHero(b, cap)) continue;
    const [wx, wz] = worldOf(slot.x, slot.z, slot.bearing, b.s, b.t);
    const seed = (hashString(`${slot.id}:${b.s.toFixed(2)}:${b.t.toFixed(2)}:${b.base.toFixed(1)}`) % 997) / 997;
    tmp.push(wx, slot.ground + b.base, wz, slot.yaw, b.lb, b.h, b.la, seed, b.style, b.lit, b.tint);
  }
  return new Float32Array(tmp);
}

function keepHero(b: PlacedBox, cap: BuildingCap): boolean {
  if (b.detail > cap) return false;
  if (b.ornament !== undefined && b.ornament > cap) return false;
  return true;
}

/** Full detail only. The opening metres stay on the wall at every tier. The leaf reuses the civic trim sheet. */
function attachLeaf(slot: HeroSlot, mesh: InstancedMesh): void {
  const detail = archDetailFromLod(2);
  const door = doorFace(slot.placed.draft);
  const leaf = door && openDoorLeaf(detail, DOOR_W, DOOR_H);
  if (!leaf || !door) return;
  const [hx, hz] = worldOf(slot.x, slot.z, slot.bearing, door.s - 0.12, door.t + DOOR_W / 2);
  leaf.position.set(hx, slot.ground + 0.02, hz);
  leaf.rotation.y = slot.yaw + 1.15;
  resources.tag(leaf.geometry, { label: 'b1-door-leaf', owner: 'towers', evictable: true });
  mesh.add(leaf);
}

function releaseMesh(mesh: InstancedMesh): void {
  const leaf = mesh.getObjectByName('arch-door-leaf');
  if (leaf instanceof Mesh) {
    if (!resources.release(leaf.geometry)) leaf.geometry.dispose();
    leaf.removeFromParent();
  }
  disposeKitMesh(mesh);
}

function meshesFor(slot: HeroSlot, cap: BuildingCap): InstancedMesh[] {
  const meshes: InstancedMesh[] = [];
  for (const c of capsFor(cap)) {
    const mesh = buildKitMesh(recordsFor(slot, c), `${slot.id}-l${c}`);
    if (!mesh) continue;
    if (c >= 2) attachLeaf(slot, mesh);
    meshes.push(mesh);
  }
  return meshes;
}

function applySlot(slot: HeroSlot, cap: BuildingCap): void {
  for (const mesh of slot.meshes) releaseMesh(mesh);
  const meshes = meshesFor(slot, cap);
  slot.meshes = meshes;
  slot.lods.replace(slot.id, meshes, distsFor(capsFor(cap)));
}

/** Quality changes rebuild the placed heroes. The kite reserve has no mesh. Fabric chunks rebuild on their own. */
export function setB1HeroTier(tier: Tier): void {
  const cap = buildingDetailCap(tier);
  if (cap === heroCap) return;
  heroCap = cap;
  for (const slot of heroes) applySlot(slot, cap);
}

registerLandmarkType('b1-hero', (l: Landmark, env: LandmarkEnv) => {
  // MT-4 is already a 600 m cruciform. Caldera Step is a 640 m taper on this same
  // 70 m base. A 480 m kite beside it is a third needle, so the reserve stays empty.
  if (l.id === 'b1-obelisk') {
    const held = new Group();
    held.name = l.id;
    return { object: held, colliders: [] };
  }
  const kind = KIND_OF[l.id] ?? 'hero-step';
  const w = l.baseWidth;
  const d = l.baseDepth ?? l.baseWidth * 0.7;
  const placed = placeHero(kind, w, d, l.height, (hashString(l.id) % 1000) / 1000);
  const ground = env.layout.heightAt(l.x, l.z);
  const bearing = l.bearingDeg;
  // Same yaw the fabric mesher uses, so local width stays on the block B axis.
  const yaw = Math.PI - (bearing * Math.PI) / 180;
  const slot: HeroSlot = {
    id: l.id, lods: env.lods, placed, ground, yaw, bearing, x: l.x, z: l.z, meshes: [],
  };
  const meshes = meshesFor(slot, heroCap);
  slot.meshes = meshes;
  heroes.push(slot);
  const levels: Object3D[] = meshes;
  const top = ground + placed.boxes.reduce((m, b) => Math.max(m, b.base + b.h), 0);
  const r = Math.hypot(w, d) * 0.5;
  const object = env.lods.add(l.id, levels, distsFor(capsFor(heroCap)), l.x, l.z, ground, top, r);
  const colliders: LandmarkCollider[] = [];
  for (const b of placed.boxes) {
    if (b.detail > 0) continue;
    if (b.ornament !== undefined && b.ornament > 0) continue;
    if (Math.min(b.lb, b.la) < 1.2) continue;
    const [wx, wz] = worldOf(l.x, l.z, bearing, b.s, b.t);
    colliders.push({
      x: wx, z: wz, hw: b.lb / 2, hd: b.la / 2, yaw,
      y0: ground + b.base, top: ground + b.base + b.h,
    });
  }
  return { object, colliders };
});
