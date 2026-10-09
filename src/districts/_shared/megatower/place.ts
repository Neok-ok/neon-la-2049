// Main thread. Turns kit output (tower frame) into world-space landmark pieces: colliders, aviation lights,
// registered holograms, neon signs and flame stacks. Shared by every district that uses the megatower kit.
import { Group, Mesh, type Object3D } from 'three/webgpu';
import { getCityMaterial } from '../../../world/materials/cityMaterial';
import { makeSignMesh } from '../../../world/materials/signMesh';
import { registerHologram } from '../../../world/holograms/registry';
import type { HoloBand, HoloDesignId, HoloRank } from '../../../world/holograms/types';
import type { LandmarkCollider, LandmarkEnv } from '../../../world/landmarks/registry';
import { LightKind as BeaconKind } from '../../../world/landmarks/Beacons';
import type { Sign } from '../../../world/fabric/types';
import { SignColor } from '../../../world/fabric/types';
import { frameToWorld, GeoSink, type KitFrame } from './geoSink';
import { faceNormal, type KitHolo, type LightKind, type TowerParts } from './tower';
import type { MassSink } from './sink';

const LIGHT: Record<LightKind, [number, number]> = {
  red: [BeaconKind.Red, 6],
  steady: [BeaconKind.Steady, 4.2],
  strobe: [BeaconKind.Strobe, 9],
  pad: [BeaconKind.Pad, 2.4],
  police: [BeaconKind.Police, 3],
  warm: [BeaconKind.Warm, 3.2],
};

const BAND: Record<KitHolo['kind'], HoloBand> = {
  crown: 'skyline',
  shaft: 'tower',
  gap: 'tower',
  podium: 'tower',
  bridge: 'tower',
};

const FALLBACK_DESIGNS: HoloDesignId[] = ['lease-loop', 'ash-crane', 'glyph-loop', 'coil-vendor'];
const FALLBACK_COLORS = [SignColor.Cyan, SignColor.Pink, SignColor.Amber, SignColor.Violet];

export interface PlaceOptions {
  id: string;
  designs?: HoloDesignId[];
  colors?: number[];
  seed: number;
}

/** World yaw of a face normal (matches signs / holograms: normal = (sin yaw, cos yaw)). */
export function faceYaw(frame: KitFrame, face: 0 | 1 | 2 | 3): number {
  const [nx, nz] = faceNormal(face);
  const c = Math.cos(frame.yaw), s = Math.sin(frame.yaw);
  return Math.atan2(nx * c + nz * s, -nx * s + nz * c);
}

function holoId(id: string, h: KitHolo, i: number): string {
  // `-holo-a` stays the shaft figure: the X4 aerial view frames `megatower-1-holo-a`.
  switch (h.kind) {
    case 'shaft': return `${id}-holo-a`;
    case 'podium': return `${id}-holo-b`;
    case 'crown': return `${id}-holo-crown`;
    case 'gap': return `${id}-holo-gap`;
    default: return `${id}-holo-${i}`;
  }
}

/** Registers lights, holograms and flames; returns world colliders and a sign mesh (or null). */
export function placeKit(parts: TowerParts, frame: KitFrame, env: LandmarkEnv, o: PlaceOptions): { colliders: LandmarkCollider[]; signs: Object3D | null } {
  const colliders: LandmarkCollider[] = parts.colliders.map((c) => {
    const [x, z] = frameToWorld(frame, c.lx, c.lz);
    return { x, z, hw: c.hw, hd: c.hd, yaw: frame.yaw, y0: frame.y + c.y0, top: frame.y + c.top };
  });
  for (const l of parts.lights) {
    const [x, z] = frameToWorld(frame, l.lx, l.lz);
    const [kind, size] = LIGHT[l.kind];
    env.beacons.add(x, frame.y + l.y, z, kind, size);
  }
  for (const f of parts.flames) {
    const [x, z] = frameToWorld(frame, f.lx, f.lz);
    env.flares.add(x, frame.y + f.y, z, f.size);
  }
  const designs = o.designs ?? FALLBACK_DESIGNS;
  const colors = o.colors ?? FALLBACK_COLORS;
  parts.holos.forEach((h, i) => {
    const [x, z] = frameToWorld(frame, h.lx, h.lz);
    const spill = h.kind === 'crown' ? Math.min(70, h.h * 0.5) : h.kind === 'podium' ? Math.min(28, h.h * 0.6) : Math.min(56, h.h * 0.45);
    registerHologram({
      id: holoId(o.id, h, i),
      x, y: frame.y + h.y, z,
      yaw: faceYaw(frame, h.face),
      w: h.w, h: h.h,
      design: designs[i % designs.length]!,
      color: colors[i % colors.length]!,
      seed: (o.seed * 13.7 + i * 0.29) % 1,
      rank: h.rank as HoloRank,
      band: BAND[h.kind],
      spill,
    });
  });
  let signs: Object3D | null = null;
  if (parts.signs.length) {
    const list: Sign[] = parts.signs.map((s, i) => {
      const [x, z] = frameToWorld(frame, s.lx, s.lz);
      const yaw = faceYaw(frame, s.face) + (s.kind === 1 ? Math.PI / 2 : 0);
      return { x, y: frame.y + s.y, z, yaw, w: s.w, h: s.h, color: s.color, seed: (o.seed * 7.1 + i * 0.137) % 1, kind: s.kind };
    });
    signs = makeSignMesh(list);
  }
  return { colliders, signs };
}

/**
 * Builds the three LOD meshes of a kit structure. `build` runs once per level with a sink of that detail;
 * the level-0 parts are returned for placement (the plan is deterministic, so every level has the same parts).
 */
export function buildLevels(name: string, frame: KitFrame, details: number[], build: (sink: MassSink) => TowerParts): { meshes: Mesh[]; parts: TowerParts; tris: number[] } {
  const meshes: Mesh[] = [];
  const tris: number[] = [];
  let parts: TowerParts | null = null;
  for (const md of details) {
    const sink = new GeoSink(md, frame);
    const p = build(sink);
    if (!parts) parts = p;
    const m = new Mesh(sink.writer.build(), getCityMaterial());
    m.name = `${name}-lod${meshes.length}`;
    meshes.push(m);
    tris.push(sink.tris);
  }
  return { meshes, parts: parts!, tris };
}

/** Group a level mesh with extras that should only draw at that level (signs on LOD0). */
export function levelGroup(mesh: Mesh, ...extra: Array<Object3D | null>): Object3D {
  const live = extra.filter((e): e is Object3D => !!e);
  if (!live.length) return mesh;
  const g = new Group();
  g.name = mesh.name;
  g.add(mesh, ...live);
  return g;
}
