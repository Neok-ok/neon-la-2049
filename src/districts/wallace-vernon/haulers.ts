// Ground haulers on the causeway. Not the sky-lane transport, and not a street-graph edge:
// four rigid trucks looping the approach. One body draw and one light draw.
import {
  BoxGeometry, BufferGeometry, DynamicDrawUsage, Float32BufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3,
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { spinnerMaterials } from '../../vehicles/spinnerModel';
import type { Group } from 'three/webgpu';

interface Haul {
  s: number;
  speed: number;
  lane: number;
}

interface Run {
  pts: Vector3[];
  cum: number[];
  length: number;
  sideX: number;
  sideZ: number;
  trucks: Haul[];
  body: InstancedMesh;
  lights: InstancedMesh;
}

let run: Run | null = null;

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
  const wheels = [-1, 1].flatMap((x) => [-2.3, 2.6].map((z) => box(0.55, 0.7, 0.55, x * 1.15, 0.4, z)));
  const body = mergeGeometries([
    box(2.45, 0.7, 8.4, 0, 0.95, 0.1),
    box(2.3, 1.35, 2.3, 0, 1.85, 2.85),
    box(2.4, 1.15, 4.8, 0, 1.95, -1.35),
    ...wheels,
  ])!;
  body.deleteAttribute('uv');
  const lights = mergeGeometries([
    colored(box(0.28, 0.1, 0.08, -0.7, 1.7, 4.05), 1, 0.72, 0.28),
    colored(box(0.28, 0.1, 0.08, 0.7, 1.7, 4.05), 1, 0.22, 0.12),
    colored(box(0.34, 0.16, 0.34, 0, 2.65, -1.3), 1, 0.55, 0.16),
  ])!;
  lights.deleteAttribute('uv');
  return { body, lights };
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _t = new Vector3();
const _up = new Vector3(0, 1, 0);

function sample(r: Run, s: number, out: Vector3, tan: Vector3): void {
  const L = r.length;
  s = ((s % L) + L) % L;
  let i = 1;
  while (i < r.cum.length - 1 && r.cum[i]! < s) i++;
  const a = r.pts[i - 1]!;
  const b = r.pts[i]!;
  const seg = r.cum[i]! - r.cum[i - 1]!;
  const t = seg > 0 ? (s - r.cum[i - 1]!) / seg : 0;
  out.lerpVectors(a, b, t);
  tan.subVectors(b, a);
  if (tan.lengthSq() < 1e-6) tan.set(0, 0, 1);
  else tan.normalize();
}

/** `pts` runs out and back so the loop has no jump. `side` is a unit offset for the two lanes. */
export function attachHaulers(parent: Group, pts: Array<[number, number, number]>, side: [number, number]): void {
  if (pts.length < 2) return;
  const world = pts.map((p) => new Vector3(p[0], p[1], p[2]));
  const cum = [0];
  for (let i = 1; i < world.length; i++) cum.push(cum[i - 1]! + world[i]!.distanceTo(world[i - 1]!));
  const length = cum[cum.length - 1]!;
  if (length < 20) return;
  const geo = geometries();
  const mats = spinnerMaterials();
  const n = 4;
  const body = new InstancedMesh(geo.body, mats.body, n);
  const lights = new InstancedMesh(geo.lights, mats.lights, n);
  body.name = 'wallace-haulers';
  lights.name = 'wallace-hauler-lights';
  body.frustumCulled = false;
  lights.frustumCulled = false;
  body.instanceMatrix.setUsage(DynamicDrawUsage);
  lights.instanceMatrix.setUsage(DynamicDrawUsage);
  parent.add(body, lights);
  const trucks: Haul[] = [];
  for (let i = 0; i < n; i++) {
    trucks.push({ s: (i / n) * length, speed: 6.2 + i * 0.7, lane: i % 2 === 0 ? 1 : -1 });
  }
  run = { pts: world, cum, length, sideX: side[0], sideZ: side[1], trucks, body, lights };
}

export function updateWallaceHaulers(dt: number): void {
  if (!run) return;
  for (let i = 0; i < run.trucks.length; i++) {
    const h = run.trucks[i]!;
    h.s += h.speed * dt;
    sample(run, h.s, _p, _t);
    _p.x += run.sideX * h.lane * 5.5;
    _p.z += run.sideZ * h.lane * 5.5;
    _q.setFromAxisAngle(_up, Math.atan2(_t.x, _t.z));
    _m.compose(_p, _q, _t.set(1, 1, 1));
    run.body.setMatrixAt(i, _m);
    run.lights.setMatrixAt(i, _m);
  }
  run.body.instanceMatrix.needsUpdate = true;
  run.lights.instanceMatrix.needsUpdate = true;
}
