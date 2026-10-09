// Stage 3 Financial District landmarks: hand-placed hero megatowers, 2019-era ziggurat towers and the
// skybridges between them, all built from the megatower kit with three LODs each.
import { Group } from 'three/webgpu';
import { registerLandmarkType, type LandmarkEnv } from '../../world/landmarks/registry';
import { bearingToYaw } from '../../world/geo';
import type { Landmark } from '../../world/layout';
import { hashString } from '../../core/rng';
import { buildSkybridge, buildTower } from '../_shared/megatower/tower';
import type { KitFrame } from '../_shared/megatower/geoSink';
import { buildLevels, levelGroup, placeKit } from '../_shared/megatower/place';
import { heroPlan } from './specs';

/** LOD switch distances (m, before the tier scale): full kit → mid → silhouette proxy. */
export const TOWER_LOD_DIST = [1900, 6500];
const BRIDGE_LOD_DIST = [1500, 5000];

/** Kit detail per level: 3 = hero clutter, 1 = secondary, 0 = mass only (the distant proxy). */
const LEVEL_DETAIL = [3, 1, 0];

/** Triangle counts per built level, for the perf notes and `__nla.stats()`. */
export const kitStats: Array<{ id: string; tris: number[] }> = [];

function buildHero(l: Landmark, env: LandmarkEnv) {
  const w = l.baseWidth, d = l.baseDepth ?? l.baseWidth;
  const { plan, spec } = heroPlan(l.id, l.height, w, d);
  const frame: KitFrame = { x: l.x, z: l.z, y: env.layout.heightAt(l.x, l.z), yaw: bearingToYaw(l.bearingDeg) + ((spec.turn ?? 0) * Math.PI) / 2 };
  const { meshes, parts, tris } = buildLevels(l.id, frame, LEVEL_DETAIL, (sink) => buildTower(plan, sink));
  kitStats.push({ id: l.id, tris });
  const placed = placeKit(parts, frame, env, { id: l.id, designs: spec.designs, colors: spec.colors, seed: plan.seed });
  const levels = [levelGroup(meshes[0]!, placed.signs), meshes[1]!, meshes[2]!];
  const r = Math.hypot(parts.halfW, parts.halfD);
  const object = env.lods.add(l.id, levels, TOWER_LOD_DIST, l.x, l.z, frame.y, frame.y + parts.top, r);
  return { object, colliders: placed.colliders };
}

registerLandmarkType('megatower', buildHero);
registerLandmarkType('legacy-tower', buildHero);

/** Half extent of a hero's shaft along world direction (ux, uz), a little inside the face so the deck is buried. */
function shaftReach(l: Landmark, ux: number, uz: number): number {
  const { spec } = heroPlan(l.id, l.height, l.baseWidth, l.baseDepth ?? l.baseWidth);
  const yaw = bearingToYaw(l.bearingDeg) + ((spec.turn ?? 0) * Math.PI) / 2;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const ax = Math.abs(ux * c - uz * s), az = Math.abs(ux * s + uz * c);
  return (ax * l.baseWidth + az * (l.baseDepth ?? l.baseWidth)) * 0.5 * 0.8;
}

registerLandmarkType('skybridge', (l, env) => {
  const a = l.from ? env.layout.landmarkById(l.from) : undefined;
  const b = l.to ? env.layout.landmarkById(l.to) : undefined;
  if (!a || !b) {
    console.warn(`skybridge ${l.id}: missing from/to landmark`);
    return { object: new Group(), colliders: [] };
  }
  const dx = b.x - a.x, dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const ux = dx / dist, uz = dz / dist;
  const ra = shaftReach(a, ux, uz), rb = shaftReach(b, -ux, -uz);
  const span = dist - ra - rb;
  const mx = a.x + ux * (ra + span / 2), mz = a.z + uz * (ra + span / 2);
  // local +X runs from `from` to `to`
  const frame: KitFrame = { x: mx, z: mz, y: 0, yaw: Math.atan2(-uz, ux) };
  const seed = (hashString(l.id) % 1000) / 1000;
  const plan = { seed, length: span + 6, y: l.height, width: l.baseWidth, height: l.baseDepth ?? 12, holo: 2, lit: 0.75 };
  const { meshes, parts, tris } = buildLevels(l.id, frame, LEVEL_DETAIL, (sink) => buildSkybridge(plan, sink));
  kitStats.push({ id: l.id, tris });
  const placed = placeKit(parts, frame, env, { id: l.id, designs: ['glyph-loop', 'lease-loop'], seed });
  const object = env.lods.add(l.id, [meshes[0]!, meshes[1]!, meshes[2]!], BRIDGE_LOD_DIST, mx, mz, l.height - 20, l.height + 20, span / 2);
  return { object, colliders: placed.colliders };
});
