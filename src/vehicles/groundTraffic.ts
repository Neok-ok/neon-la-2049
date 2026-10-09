// Street-level cars and vans on the downtown lane graph. Two instanced draws: a body that shares the
// spinner's wet metal, and vertex-coloured headlights. No engine audio — rain and city ambience only.
import {
  BoxGeometry, BufferGeometry, Color, DynamicDrawUsage, Float32BufferAttribute, InstancedMesh, Matrix4, MeshBasicNodeMaterial,
  Quaternion, Vector3, type Camera, type Scene,
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TSL from 'three/tsl';
import { spinnerMaterials } from './spinnerModel';
import { U } from '../atmosphere/uniforms';
import type { CityQuery } from '../world/CityQuery';
import { Rng, trueRandomSeed } from '../core/rng';
import { advanceGraph, downtownGraph, edgeAround, poseOn } from './streetGraph';

const T = TSL as any;

interface Van {
  edge: number;
  t: number;
  dir: 1 | -1;
  side: number;
  speed: number;
  salt: number;
  van: boolean;
  p: Vector3;
  fwd: Vector3;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _f = new Vector3(0, 0, -1);

function colored(g: BufferGeometry, c: Color): BufferGeometry {
  const g2 = g.index ? g.toNonIndexed() : g;
  const n = g2.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g2.setAttribute('color', new Float32BufferAttribute(a, 3));
  return g2;
}

let geos: { body: BufferGeometry; lights: BufferGeometry } | null = null;

function geometries(): { body: BufferGeometry; lights: BufferGeometry } {
  if (geos) return geos;
  // Forward is −Z, same as the spinner, so the heading quaternion matches.
  const hull = new BoxGeometry(1.85, 0.72, 4.15).translate(0, 0.62, 0);
  const cab = new BoxGeometry(1.7, 0.62, 2.05).translate(0, 1.22, -0.15);
  for (const g of [hull, cab]) g.deleteAttribute('uv');
  const body = mergeGeometries([hull, cab])!;
  const white = new Color(1.7, 1.55, 1.25);
  const red = new Color(1.8, 0.08, 0.05);
  const lights = mergeGeometries([
    colored(new BoxGeometry(1.45, 0.08, 0.06).translate(0, 0.72, -2.1), white),
    colored(new BoxGeometry(1.5, 0.07, 0.05).translate(0, 0.7, 2.1), red),
  ].map((g) => { g.deleteAttribute('uv'); return g; }))!;
  geos = { body, lights };
  return geos;
}

let lightMat: MeshBasicNodeMaterial | null = null;
function lightsMaterial(): MeshBasicNodeMaterial {
  if (lightMat) return lightMat;
  const m = new MeshBasicNodeMaterial({ vertexColors: true });
  m.fog = true;
  m.colorNode = T.attribute('color', 'vec3').mul(T.mix(T.float(0.35), T.float(1.55), U.night));
  lightMat = m;
  return m;
}

export class GroundTraffic {
  private cars: Van[] = [];
  private body: InstancedMesh;
  private lights: InstancedMesh;
  private rng = new Rng(trueRandomSeed() ^ 0x6a11);
  count = 0;
  radius = 420;

  constructor(scene: Scene, private query: CityQuery, readonly max: number) {
    const g = geometries();
    this.body = new InstancedMesh(g.body, spinnerMaterials().body, max);
    this.lights = new InstancedMesh(g.lights, lightsMaterial(), max);
    for (const im of [this.body, this.lights]) {
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.frustumCulled = false;
      im.count = 0;
      scene.add(im);
    }
    this.body.name = 'ground-body';
    this.lights.name = 'ground-lights';
  }

  private place(c: Van, x: number, z: number): boolean {
    const g = downtownGraph(this.query.layout);
    const hit = edgeAround(g, x, z, this.radius, this.rng);
    if (!hit) return false;
    c.edge = hit.edge;
    c.t = hit.t;
    c.dir = this.rng.chance(0.5) ? 1 : -1;
    c.side = this.rng.chance(0.5) ? 7.2 : -7.2;
    c.speed = this.rng.range(8, 16);
    c.salt = this.rng.int(1, 9000);
    c.van = this.rng.chance(0.2);
    const pose = poseOn(g, c.edge, c.t, c.dir, c.side);
    const y = this.query.layout.heightAt(pose.x, pose.z) + 0.55;
    c.p.set(pose.x, y, pose.z);
    c.fwd.set(pose.fx, 0, pose.fz);
    return true;
  }

  private spawn(cam: Vector3): Van | null {
    const c: Van = {
      edge: 0, t: 0, dir: 1, side: 7.2, speed: 10, salt: 1, van: false,
      p: new Vector3(), fwd: new Vector3(0, 0, -1),
    };
    const jitter = this.rng.range(0, this.radius * 0.8);
    const a = this.rng.next() * Math.PI * 2;
    const ok = this.place(c, cam.x + Math.cos(a) * jitter, cam.z + Math.sin(a) * jitter)
      || this.place(c, cam.x, cam.z);
    return ok ? c : null;
  }

  update(dt: number, camera: Camera, active: number): void {
    const cam = camera.position;
    const here = this.query.district(cam.x, cam.z).id;
    const downtown = here === 'dtla' || here === 'financial-megatowers' || here === 'civic-center';
    const n = downtown ? Math.min(this.max, active) : 0;
    const g = n > 0 ? downtownGraph(this.query.layout) : null;
    while (g && this.cars.length < n) {
      const c = this.spawn(cam);
      if (!c) break;
      this.cars.push(c);
    }
    this.cars.length = Math.min(this.cars.length, n);
    if (!g || !this.cars.length) {
      this.count = 0;
      this.body.count = 0;
      this.lights.count = 0;
      return;
    }
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i]!;
      const step = advanceGraph(g, c.edge, c.t, c.dir, c.speed * dt, c.salt);
      c.edge = step.edge;
      c.t = step.t;
      c.dir = step.dir;
      const pose = poseOn(g, c.edge, c.t, c.dir, c.side);
      c.p.set(pose.x, this.query.layout.heightAt(pose.x, pose.z) + 0.55, pose.z);
      c.fwd.set(pose.fx, 0, pose.fz);
      const dx = c.p.x - cam.x, dz = c.p.z - cam.z;
      if (dx * dx + dz * dz > this.radius * this.radius) {
        if (!this.place(c, cam.x, cam.z)) c.p.y = -500;
      }
      _q.setFromUnitVectors(_f, c.fwd);
      if (c.van) _s.set(1.12, 1.42, 1.28);
      else _s.set(0.96 + (c.salt % 5) * 0.015, 1, 1);
      _m.compose(c.p, _q, _s);
      this.body.setMatrixAt(i, _m);
      this.lights.setMatrixAt(i, _m);
    }
    this.count = this.cars.length;
    this.body.count = this.count;
    this.lights.count = this.count;
    this.body.instanceMatrix.needsUpdate = true;
    this.lights.instanceMatrix.needsUpdate = true;
  }
}
