// LOD0 roads. One unique solid mesh per chunk, instanced paint, shared puddle quad.
// The streamer disposes unique geometry when the chunk leaves. Shared materials stay.
import {
  BufferAttribute, BufferGeometry, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry,
  Quaternion, Vector3,
} from 'three/webgpu';
import type { Tier } from '../core/quality';
import { resources } from '../core/memory';
import { registerDetail } from '../world/detail/registry';
import { buildRoadChunk, chunkDraws, paveSpans, type RoadChunk, type Stamp } from './buildChunk';
import { heroSpans } from './heroSpans';
import { roadFancy, roadMarkMaterial, roadPuddleMaterial, roadSignMaterial, roadSurfaceMaterial } from './material';
import { retainChunk } from '../lighting/registry.ts';

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);

function groundTemplate(): BufferGeometry {
  return resources.sharedGeometry('road-ground-quad', () => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array([
      -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
    ]), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array([
      0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    ]), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array([
      0, 0, 1, 0, 1, 1, 0, 1,
    ]), 2));
    g.setIndex(new BufferAttribute(new Uint16Array([0, 2, 1, 0, 3, 2]), 1));
    return g;
  });
}

function signTemplate(): BufferGeometry {
  return resources.sharedGeometry('road-sign-plane', () => new PlaneGeometry(1, 1));
}

function place(mesh: InstancedMesh, items: Stamp[], vertical: boolean): void {
  items.forEach((s, i) => {
    _p.set(s.x, vertical ? s.y : s.y, s.z);
    _q.setFromAxisAngle(_up, s.yaw);
    _s.set(s.sx, vertical ? s.sy : 1, vertical ? 1 : s.sz);
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

function stampMesh(items: Stamp[], vertical: boolean, material: NonNullable<ReturnType<typeof roadMarkMaterial>>, name: string): InstancedMesh {
  const geo = resources.geometry(() => {
    const g = (vertical ? signTemplate() : groundTemplate()).clone();
    // The template is shared. This clone owns the per-chunk instance attribute.
    g.userData.sharedGeometry = false;
    const cell = new Float32Array(items.length);
    items.forEach((s, i) => { cell[i] = s.cell; });
    g.setAttribute('iCell', new InstancedBufferAttribute(cell, 1));
    return g;
  }, { label: name, owner: 'roads', evictable: true });
  const mesh = new InstancedMesh(geo, material, items.length);
  mesh.name = name;
  place(mesh, items, vertical);
  mesh.renderOrder = 2;
  return mesh;
}

function mountChunk(group: Group, chunk: RoadChunk, tier: Tier, lampKey: string): () => void {
  if (chunk.solid) {
    const g = resources.geometry(() => {
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(chunk.solid!.pos, 3));
      geo.setAttribute('normal', new BufferAttribute(chunk.solid!.nor, 3));
      geo.setAttribute('uv', new BufferAttribute(chunk.solid!.uv, 2));
      geo.setAttribute('kind', new BufferAttribute(chunk.solid!.kind, 1));
      geo.setIndex(new BufferAttribute(chunk.solid!.idx, 1));
      geo.computeBoundingSphere();
      return geo;
    }, { label: 'road-solid', owner: 'roads', evictable: true });
    const mesh = new Mesh(g, roadSurfaceMaterial(tier));
    mesh.name = 'road-solid';
    mesh.renderOrder = 0;
    group.add(mesh);
  }
  const marks = roadMarkMaterial(tier);
  if (marks && chunk.stamps.length) group.add(stampMesh(chunk.stamps, false, marks, 'road-marks'));
  const signs = roadSignMaterial(tier);
  if (signs && chunk.signs.length) {
    const boards = chunk.signs.map((s) => ({ ...s, vertical: 1 }));
    group.add(stampMesh(boards, true, signs, 'road-signs'));
  }
  if (chunk.puddles.length && (tier === 'high' || tier === 'ultra')) {
    const geo = groundTemplate();
    const mesh = new InstancedMesh(geo, roadPuddleMaterial(), chunk.puddles.length);
    mesh.name = 'road-puddles';
    mesh.userData.sharedGeometry = true;
    mesh.renderOrder = 1;
    chunk.puddles.forEach((p, i) => {
      _p.set(p.x, p.y, p.z);
      _q.setFromAxisAngle(_up, p.yaw);
      _s.set(p.sx, 1, p.sz);
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  if (!chunk.lamps.length) return () => {};
  return retainChunk(
    lampKey,
    chunk.lamps.map((p) => ({ preset: 'street-sodium' as const, x: p.x, y: p.y, z: p.z, dx: 0, dy: -1, dz: 0 })),
  );
}

registerDetail('roads', '*', (ctx) => {
  const tier = ctx.quality.tier;
  roadFancy.value = tier === 'high' || tier === 'ultra' ? 1 : 0;
  const chunk = buildRoadChunk(ctx.layout, ctx.x0, ctx.z0, ctx.size, tier);
  const extra = paveSpans(ctx.layout, heroSpans(ctx.layout, ctx.x0, ctx.z0, ctx.size), ctx.x0, ctx.z0, ctx.size, tier);
  if (!chunk && !extra) return null;
  const group = new Group();
  group.name = 'roads';
  const releases: Array<() => void> = [];
  let bytes = 0;
  let tris = 0;
  let draws = 0;
  if (chunk) {
    releases.push(mountChunk(group, chunk, tier, `road:${ctx.x0}:${ctx.z0}`));
    bytes += chunk.bytes;
    tris += chunk.tris;
    draws += chunkDraws(tier, chunk);
  }
  if (extra) {
    releases.push(mountChunk(group, extra, tier, `road-span:${ctx.x0}:${ctx.z0}`));
    bytes += extra.bytes;
    tris += extra.tris;
    draws += chunkDraws(tier, extra);
  }
  group.userData.tris = tris;
  group.userData.bytes = bytes;
  group.userData.draws = draws;
  group.userData.releaseLights = () => {
    for (const release of releases) release();
  };
  return group;
});
