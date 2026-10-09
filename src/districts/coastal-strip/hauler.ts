// One salt truck on the landward maintenance strip. Not a street-graph vehicle.
import {
  BoxGeometry, BufferGeometry, DynamicDrawUsage, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Quaternion, Vector3,
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { spinnerMaterials } from '../../vehicles/spinnerModel';
import type { CityLayout } from '../../world/layout';
import { fightHit, framePoint } from './profile';

let body: InstancedMesh | null = null;
let lights: InstancedMesh | null = null;
let path: { ax: number; az: number; bx: number; bz: number; y: number; len: number } | null = null;
let s = 12;

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);
const _up = new Vector3(0, 1, 0);

function box(w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry {
  return new BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
}

function colored(g: BufferGeometry, r: number, gv: number, b: number): BufferGeometry {
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([r, gv, b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(a, 3));
  return g;
}

function geometries(): { body: BufferGeometry; lights: BufferGeometry } {
  const wheels = [-1, 1].flatMap((x) => [-2.2, 2.4].map((z) => box(0.5, 0.65, 0.5, x * 1.05, 0.35, z)));
  const hull = mergeGeometries([
    box(2.3, 0.7, 7.6, 0, 0.9, 0),
    box(2.15, 1.2, 2.2, 0, 1.7, 2.4),
    box(2.25, 1.05, 4.2, 0, 1.75, -1.2),
    ...wheels,
  ]);
  if (!hull) throw new Error('hauler');
  hull.deleteAttribute('uv');
  const lamps = mergeGeometries([
    colored(box(0.24, 0.08, 0.08, -0.65, 1.55, 3.7), 0.75, 0.82, 0.86),
    colored(box(0.24, 0.08, 0.08, 0.65, 1.55, 3.7), 0.75, 0.82, 0.86),
    colored(box(0.16, 0.08, 0.08, -0.6, 1.5, -3.7), 0.45, 0.12, 0.08),
    colored(box(0.16, 0.08, 0.08, 0.6, 1.5, -3.7), 0.45, 0.12, 0.08),
  ]);
  if (!lamps) throw new Error('hauler lights');
  lamps.deleteAttribute('uv');
  return { body: hull, lights: lamps };
}

export function attachHauler(group: Group, layout: CityLayout): void {
  const hit = fightHit(layout);
  const a = framePoint(hit.frame, -74, -80);
  const b = framePoint(hit.frame, -74, 80);
  const y = layout.heightAt(hit.frame.x, hit.frame.z) + 0.02;
  path = { ax: a.x, az: a.z, bx: b.x, bz: b.z, y, len: 160 };
  const g = geometries();
  const mats = spinnerMaterials();
  body = new InstancedMesh(g.body, mats.body, 1);
  lights = new InstancedMesh(g.lights, mats.lights, 1);
  body.name = 'coast-hauler';
  lights.name = 'coast-hauler-lights';
  body.frustumCulled = false;
  lights.frustumCulled = false;
  body.instanceMatrix.setUsage(DynamicDrawUsage);
  lights.instanceMatrix.setUsage(DynamicDrawUsage);
  group.add(body, lights);
}

export function updateHauler(camX: number, camZ: number, dt: number): void {
  if (!body || !lights || !path) return;
  const d = Math.hypot(camX - (path.ax + path.bx) / 2, camZ - (path.az + path.bz) / 2);
  const on = d < 860;
  body.visible = on;
  lights.visible = on;
  if (!on) return;
  s = (s + dt * 7.5) % path.len;
  const t = s / path.len;
  const ping = t < 0.5 ? t * 2 : (1 - t) * 2;
  const dir = t < 0.5 ? 1 : -1;
  const x = path.ax + (path.bx - path.ax) * ping;
  const z = path.az + (path.bz - path.az) * ping;
  const tx = (path.bx - path.ax) * dir;
  const tz = (path.bz - path.az) * dir;
  // Hauler geometry faces +Z. Yaw maps local +Z onto the travel direction.
  const yaw = Math.atan2(tx, tz);
  _p.set(x, path.y, z);
  _q.setFromAxisAngle(_up, yaw);
  _m.compose(_p, _q, _s);
  body.setMatrixAt(0, _m);
  lights.setMatrixAt(0, _m);
  body.instanceMatrix.needsUpdate = true;
  lights.instanceMatrix.needsUpdate = true;
}
