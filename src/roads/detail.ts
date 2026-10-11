// LOD0 roads. One unique solid mesh per chunk, instanced paint, shared puddle quad.
// The streamer disposes unique geometry when the chunk leaves. Shared materials stay.
import {
  BufferAttribute, BufferGeometry, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry,
  Quaternion, Vector3,
} from 'three/webgpu';
import { registerDetail } from '../world/detail/registry';
import { buildRoadChunk, chunkDraws, type Stamp } from './buildChunk';
import { roadFancy, roadMarkMaterial, roadPuddleMaterial, roadSignMaterial, roadSurfaceMaterial } from './material';

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);

let groundQuad: BufferGeometry | null = null;
let signPlane: PlaneGeometry | null = null;

function groundTemplate(): BufferGeometry {
  if (groundQuad) return groundQuad;
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
  groundQuad = g;
  return g;
}

function signTemplate(): PlaneGeometry {
  if (!signPlane) signPlane = new PlaneGeometry(1, 1);
  return signPlane;
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
  const geo = (vertical ? signTemplate() : groundTemplate()).clone();
  const cell = new Float32Array(items.length);
  items.forEach((s, i) => { cell[i] = s.cell; });
  geo.setAttribute('iCell', new InstancedBufferAttribute(cell, 1));
  const mesh = new InstancedMesh(geo, material, items.length);
  mesh.name = name;
  place(mesh, items, vertical);
  mesh.renderOrder = 2;
  return mesh;
}

registerDetail('roads', '*', (ctx) => {
  const tier = ctx.quality.tier;
  roadFancy.value = tier === 'high' || tier === 'ultra' ? 1 : 0;
  const chunk = buildRoadChunk(ctx.layout, ctx.x0, ctx.z0, ctx.size, tier);
  if (!chunk) return null;
  const group = new Group();
  group.name = 'roads';
  let bytes = chunk.bytes;
  if (chunk.solid) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(chunk.solid.pos, 3));
    g.setAttribute('normal', new BufferAttribute(chunk.solid.nor, 3));
    g.setAttribute('uv', new BufferAttribute(chunk.solid.uv, 2));
    g.setAttribute('kind', new BufferAttribute(chunk.solid.kind, 1));
    g.setIndex(new BufferAttribute(chunk.solid.idx, 1));
    g.computeBoundingSphere();
    const mesh = new Mesh(g, roadSurfaceMaterial(tier));
    mesh.name = 'road-solid';
    mesh.renderOrder = 0;
    group.add(mesh);
  }
  const marks = roadMarkMaterial(tier);
  if (marks && chunk.stamps.length) {
    group.add(stampMesh(chunk.stamps, false, marks, 'road-marks'));
    bytes += chunk.stamps.length * 64;
  }
  const signs = roadSignMaterial(tier);
  if (signs && chunk.signs.length) {
    const boards = chunk.signs.map((s) => ({ ...s, vertical: 1 }));
    group.add(stampMesh(boards, true, signs, 'road-signs'));
    bytes += chunk.signs.length * 64;
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
    bytes += chunk.puddles.length * 64;
  }
  group.userData.tris = chunk.tris;
  group.userData.bytes = bytes;
  group.userData.draws = chunkDraws(tier, chunk);
  return group;
});
