// City-wide port: gantries, animated trolleys, instanced containers, LOD'd hulls,
// wet slips, and the work-light sprites. One set for the district, not per chunk,
// so a crane still reads from the sea wall and from LAX after far LOD.
import {
  BufferAttribute, BufferGeometry, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh,
  Matrix4, MeshBasicNodeMaterial, MeshStandardNodeMaterial, PlaneGeometry, Quaternion, Vector3,
  type Object3D,
} from 'three/webgpu';
import * as TSL from 'three/tsl';
import type { CityLayout } from '../../world/layout';
import type { CityQuery } from '../../world/CityQuery';
import { BOOM_Y, HOUSE_Y, SHIP_B, SHIP_H, SHIP_L } from './spec';
import { harborSites, type BerthFrame, type StackBox } from './sites';
import { mountHarborLights } from './lights';

const T = TSL as any;
const { attribute, vec3, float } = T;

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);
const _zero = new Vector3(0, 0, 0);

interface Anim {
  trolley: InstancedMesh;
  spreader: InstancedMesh;
  near: InstancedMesh;
  far: InstancedMesh;
  cranes: BerthFrame[];
  ships: BerthFrame[];
}

let anim: Anim | null = null;

function steel(color: [number, number, number], metal = 0.62): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();
  m.colorNode = vec3(color[0], color[1], color[2]);
  m.roughnessNode = float(0.56);
  m.metalnessNode = float(metal);
  m.emissiveNode = vec3(color[0], color[1], color[2]).mul(0.05);
  return m;
}

function box(cx: number, cy: number, cz: number, w: number, h: number, d: number, into: number[]): void {
  const x = w / 2, y = h / 2, z = d / 2;
  const faces: Array<[number, number, number, number[][]]> = [
    [0, 0, 1, [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]]],
    [0, 0, -1, [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]]],
    [1, 0, 0, [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]]],
    [-1, 0, 0, [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]]],
    [0, 1, 0, [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]]],
    [0, -1, 0, [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]]],
  ];
  for (const [nx, ny, nz, corners] of faces) {
    for (const c of corners) into.push(cx + c[0], cy + c[1], cz + c[2], nx, ny, nz);
  }
}

function geo(raw: number[]): BufferGeometry {
  const pos = new Float32Array(raw.length / 2);
  const nor = new Float32Array(raw.length / 2);
  const idx: number[] = [];
  let v = 0;
  for (let i = 0; i < raw.length; i += 24) {
    for (let k = 0; k < 4; k++) {
      pos[v * 3] = raw[i + k * 6]!;
      pos[v * 3 + 1] = raw[i + k * 6 + 1]!;
      pos[v * 3 + 2] = raw[i + k * 6 + 2]!;
      nor[v * 3] = raw[i + k * 6 + 3]!;
      nor[v * 3 + 1] = raw[i + k * 6 + 4]!;
      nor[v * 3 + 2] = raw[i + k * 6 + 5]!;
      v++;
    }
    const b = v - 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function craneGeo(): BufferGeometry {
  const raw: number[] = [];
  box(-12, 35, 0, 1.7, BOOM_Y, 1.8, raw);
  box(12, 35, 0, 1.7, BOOM_Y, 1.8, raw);
  box(-12, 35, 14, 1.5, BOOM_Y, 1.6, raw);
  box(12, 35, 14, 1.5, BOOM_Y, 1.6, raw);
  box(0, BOOM_Y, 7, 28, 1.8, 18, raw);
  box(0, BOOM_Y + 1.3, 20, 2.6, 1.3, 68, raw);
  box(0, HOUSE_Y - 5, -8, 7, 10, 6, raw);
  box(0, 1.1, 4, 6, 2.2, 22, raw);
  return geo(raw);
}

function trolleyGeo(): BufferGeometry {
  const raw: number[] = [];
  box(0, 0, 0, 4.4, 1.5, 3.2, raw);
  box(0, 0.9, 0, 2.2, 1.4, 2.2, raw);
  return geo(raw);
}

/** Origin at the trolley. Cables drop to the spreader. */
function spreaderGeo(): BufferGeometry {
  const raw: number[] = [];
  box(-1.2, -8, 0, 0.18, 16, 0.18, raw);
  box(1.2, -8, 0, 0.18, 16, 0.18, raw);
  box(0, -16, 0, 14, 0.55, 1.6, raw);
  return geo(raw);
}

function hullGeo(): BufferGeometry {
  const raw: number[] = [];
  box(0, SHIP_H * 0.5, 0, SHIP_B, SHIP_H, SHIP_L * 0.78, raw);
  box(0, SHIP_H * 0.42, SHIP_L * 0.46, SHIP_B * 0.62, SHIP_H * 0.7, SHIP_L * 0.16, raw);
  box(0, SHIP_H + 5, -SHIP_L * 0.28, 8, 10, 12, raw);
  return geo(raw);
}

function farHullGeo(): BufferGeometry {
  const raw: number[] = [];
  const h = SHIP_H + 8;
  box(0, h * 0.5, 0, SHIP_B, h, SHIP_L, raw);
  return geo(raw);
}

function place(mesh: InstancedMesh, i: number, x: number, y: number, z: number, yaw: number, sx = 1, sy = 1, sz = 1): void {
  _p.set(x, y, z);
  _q.setFromAxisAngle(_up, yaw);
  _s.set(sx, sy, sz);
  mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
}

function hide(mesh: InstancedMesh, i: number): void {
  _p.copy(_zero);
  _q.identity();
  _s.set(0, 0, 0);
  mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
}

export function mountHarbor(parent: Object3D, layout: CityLayout, query: CityQuery): void {
  const sites = harborSites(layout);
  if (!sites.cranes.length) return;
  const crane = new InstancedMesh(craneGeo(), steel([0.27, 0.29, 0.31]), sites.cranes.length);
  crane.name = 'harbor-cranes';
  crane.frustumCulled = false;
  for (let i = 0; i < sites.cranes.length; i++) {
    const c = sites.cranes[i]!;
    place(crane, i, c.x, c.ground, c.z, c.yaw);
  }
  crane.instanceMatrix.needsUpdate = true;
  parent.add(crane);

  const trolley = new InstancedMesh(trolleyGeo(), steel([0.34, 0.36, 0.38], 0.4), sites.cranes.length);
  trolley.name = 'harbor-trolleys';
  trolley.frustumCulled = false;
  trolley.instanceMatrix.setUsage(DynamicDrawUsage);
  const spreader = new InstancedMesh(spreaderGeo(), steel([0.55, 0.32, 0.12], 0.35), sites.cranes.length);
  spreader.name = 'harbor-spreaders';
  spreader.frustumCulled = false;
  spreader.instanceMatrix.setUsage(DynamicDrawUsage);
  parent.add(trolley, spreader);

  const near = new InstancedMesh(hullGeo(), steel([0.16, 0.17, 0.19], 0.48), sites.ships.length);
  near.name = 'harbor-hulls';
  near.frustumCulled = false;
  near.instanceMatrix.setUsage(DynamicDrawUsage);
  const far = new InstancedMesh(farHullGeo(), steel([0.14, 0.15, 0.17], 0.4), sites.ships.length);
  far.name = 'harbor-hulls-far';
  far.frustumCulled = false;
  far.instanceMatrix.setUsage(DynamicDrawUsage);
  parent.add(near, far);

  mountStacks(parent, sites.stacks);
  mountSlips(parent, sites.ships);
  mountHarborLights(parent, sites.lights);
  query.addColliders(colliders(sites.cranes, sites.ships));

  anim = { trolley, spreader, near, far, cranes: sites.cranes, ships: sites.ships };
  updateHarbor(0, 0, 0, 0);
}

function mountStacks(parent: Object3D, stacks: StackBox[]): void {
  if (!stacks.length) return;
  const raw: number[] = [];
  box(0, 0, 0, 1, 1, 1, raw);
  const boxGeo = geo(raw);
  const col = new InstancedBufferAttribute(new Float32Array(stacks.length * 3), 3);
  boxGeo.setAttribute('iCol', col);
  const m = new MeshStandardNodeMaterial();
  m.colorNode = attribute('iCol', 'vec3');
  m.roughnessNode = float(0.72);
  m.metalnessNode = float(0.25);
  m.emissiveNode = attribute('iCol', 'vec3').mul(0.03);
  const mesh = new InstancedMesh(boxGeo, m, stacks.length);
  mesh.name = 'harbor-stacks';
  mesh.frustumCulled = false;
  const arr = col.array as Float32Array;
  for (let i = 0; i < stacks.length; i++) {
    const b = stacks[i]!;
    place(mesh, i, b.x, b.y, b.z, b.yaw, b.sx, b.sy, b.sz);
    arr[i * 3] = b.color[0];
    arr[i * 3 + 1] = b.color[1];
    arr[i * 3 + 2] = b.color[2];
  }
  mesh.instanceMatrix.needsUpdate = true;
  col.needsUpdate = true;
  parent.add(mesh);
}

function mountSlips(parent: Object3D, ships: BerthFrame[]): void {
  if (!ships.length) return;
  const g = new PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  const m = new MeshBasicNodeMaterial();
  m.colorNode = vec3(0.03, 0.045, 0.055);
  const mesh = new InstancedMesh(g, m, ships.length);
  mesh.name = 'harbor-slips';
  mesh.frustumCulled = false;
  for (let i = 0; i < ships.length; i++) {
    const s = ships[i]!;
    place(mesh, i, s.x, s.ground + 0.35, s.z, s.hullYaw, SHIP_B + 28, 1, SHIP_L + 24);
  }
  mesh.instanceMatrix.needsUpdate = true;
  parent.add(mesh);
}

function localPoint(f: BerthFrame, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  return { x: f.x + lx * c + lz * s, z: f.z - lx * s + lz * c };
}

function colliders(cranes: BerthFrame[], ships: BerthFrame[]) {
  const out: Array<{ x: number; z: number; hw: number; hd: number; y0: number; top: number; yaw: number }> = [];
  for (const c of cranes) {
    const portal = localPoint(c, 0, 7);
    out.push({ x: portal.x, z: portal.z, hw: 14, hd: 10, y0: c.ground, top: c.ground + BOOM_Y, yaw: c.yaw });
    const boom = localPoint(c, 0, 20);
    out.push({ x: boom.x, z: boom.z, hw: 2, hd: 34, y0: c.ground + BOOM_Y - 1, top: c.ground + BOOM_Y + 3, yaw: c.yaw });
  }
  for (const s of ships) {
    out.push({
      x: s.x, z: s.z, hw: SHIP_B / 2, hd: SHIP_L / 2,
      y0: s.ground, top: s.ground + SHIP_H, yaw: s.hullYaw,
    });
  }
  return out;
}

/** Slow trolley travel. Far hulls replace the near mesh past about 1.4 km. */
export function updateHarbor(time: number, camX: number, camY: number, camZ: number): void {
  if (!anim) return;
  for (let i = 0; i < anim.cranes.length; i++) {
    const c = anim.cranes[i]!;
    const u = 0.5 + 0.5 * Math.sin(time * 0.2 + c.phase * Math.PI * 2);
    const zLocal = 2 + u * 48;
    const p = localPoint(c, 0, zLocal);
    const y = c.ground + BOOM_Y + 2.2;
    place(anim.trolley, i, p.x, y, p.z, c.yaw);
    place(anim.spreader, i, p.x, y - 0.4, p.z, c.yaw);
  }
  anim.trolley.instanceMatrix.needsUpdate = true;
  anim.spreader.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < anim.ships.length; i++) {
    const s = anim.ships[i]!;
    const dist = Math.hypot(s.x - camX, (s.ground + 12) - camY, s.z - camZ);
    const far = dist > 1400;
    if (far) {
      hide(anim.near, i);
      place(anim.far, i, s.x, s.ground, s.z, s.hullYaw);
    } else {
      hide(anim.far, i);
      place(anim.near, i, s.x, s.ground, s.z, s.hullYaw);
    }
  }
  anim.near.instanceMatrix.needsUpdate = true;
  anim.far.instanceMatrix.needsUpdate = true;
}

/**
 * Port machinery on the existing bed.
 * Inside the polygon it falls off with height. Outside it falls off with
 * distance from the control door, so the sea wall hears it and downtown does not.
 */
export function harborHum(x: number, y: number, z: number, layout: CityLayout): number {
  const alt = Math.max(0, y - layout.heightAt(x, z));
  if (layout.districtAt(x, z).id === 'harbor') return Math.max(0, 1 - alt / 110) * 0.46;
  const door = harborSites(layout).control;
  if (!door) return 0;
  const horiz = Math.hypot(x - door.x, z - door.z);
  return 0.28 * Math.exp(-horiz / 4200) * Math.max(0, 1 - alt / 150);
}
