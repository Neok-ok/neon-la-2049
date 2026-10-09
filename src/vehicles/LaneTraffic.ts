// Spinners on the high sky lanes and holding patterns (Stage 3). Five instanced draws: spinner body + lights,
// transport body + lights, and one additive glow billboard per vehicle (nav blink, police strobe) that keeps
// a minimum pixel size so a lane reads as a moving string of lights from across the basin.
import {
  AdditiveBlending, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicNodeMaterial, PlaneGeometry,
  Quaternion, Vector3, type Camera, type Scene,
} from 'three/webgpu';
import * as TSL from 'three/tsl';
import { spinnerGeometries, spinnerMaterials } from './spinnerModel';
import { transportGeometries } from './transportModel';
import { U } from '../atmosphere/uniforms';
import { fogDepth } from '../atmosphere/SkyFog';
import type { CityQuery } from '../world/CityQuery';
import { Rng } from '../core/rng';
import { buildSkyLanes, sampleLane, type LaneClass, type SkyLane } from './skyLanes';

const T = TSL as any;

interface LaneCar {
  lane: SkyLane;
  s: number;
  dir: 1 | -1;
  speed: number;
  cls: LaneClass;
  phase: number;
  p: Vector3;
  vel: Vector3;
  /** index into the spinner or transport instance list */
  slot: number;
}

const G = 9.81;
const _m = new Matrix4(), _q = new Quaternion(), _qr = new Quaternion(), _s = new Vector3(), _f = new Vector3(0, 0, -1);
const _p = new Vector3(), _t = new Vector3(), _t2 = new Vector3(), _fwd = new Vector3(), _side = new Vector3(), _prev = new Vector3();

export class LaneTraffic {
  readonly lanes: SkyLane[];
  private cars: LaneCar[] = [];
  private spinBody: InstancedMesh;
  private spinLights: InstancedMesh;
  private trBody: InstancedMesh;
  private trLights: InstancedMesh;
  private glow: InstancedMesh;
  readonly nodes: InstancedMesh[];
  private gcol: InstancedBufferAttribute;
  private active = -1;

  constructor(scene: Scene, query: CityQuery, readonly max: number) {
    this.lanes = buildSkyLanes(query);
    const sg = spinnerGeometries(), tg = transportGeometries(), m = spinnerMaterials();
    this.spinBody = new InstancedMesh(sg.body, m.body, max);
    this.spinLights = new InstancedMesh(sg.lights, m.lights, max);
    this.trBody = new InstancedMesh(tg.body, m.body, max);
    this.trLights = new InstancedMesh(tg.lights, m.lights, max);
    const glowGeo = new PlaneGeometry(1, 1);
    this.gcol = new InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.gcol.setUsage(DynamicDrawUsage);
    glowGeo.setAttribute('gcol', this.gcol);
    const gm = new MeshBasicNodeMaterial();
    gm.transparent = true;
    gm.depthWrite = false;
    gm.blending = AdditiveBlending;
    gm.fog = false;
    gm.colorNode = T.Fn(() => {
      const c = T.attribute('gcol', 'vec4');
      const mode = T.floor(c.w);
      const ph = T.fract(c.w);
      const r = T.length(T.uv().sub(0.5)).mul(2.0);
      const core = T.smoothstep(0.42, 0.0, r);
      const fall = T.smoothstep(1.0, 0.0, r).pow(2.2).mul(0.6).add(core);
      const t = U.time.add(ph.mul(13.0));
      const police = T.step(0.5, T.fract(t.mul(2.5)));
      const navFlash = T.step(T.fract(t.mul(0.9)), 0.06);
      const policeCol = T.mix(T.vec3(1.0, 0.08, 0.1), T.vec3(0.15, 0.3, 1.0), police);
      const col = T.select(mode.lessThan(0.5), c.xyz, T.select(mode.lessThan(1.5), policeCol, c.xyz.add(T.vec3(1.2, 1.25, 1.3).mul(navFlash.mul(1.4)))));
      const att = T.exp(fogDepth(T.cameraPosition, T.positionWorld).mul(-0.26));
      return T.vec4(col.mul(fall).mul(att).mul(2.2), T.float(1));
    })();
    this.glow = new InstancedMesh(glowGeo, gm, max);
    const all = [this.spinBody, this.spinLights, this.trBody, this.trLights, this.glow];
    for (const im of all) {
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.frustumCulled = false;
      im.count = 0;
      scene.add(im);
    }
    this.spinBody.name = 'lane-spinners';
    this.trBody.name = 'lane-transports';
    this.glow.name = 'lane-glow';
    this.nodes = [this.spinBody, this.spinLights, this.trBody, this.trLights, this.glow];
  }

  get count(): number {
    return this.cars.length;
  }

  /** Re-deal the cars over the lanes, weighted by lane length × weight. Deterministic per count. */
  private deal(n: number): void {
    const r = new Rng(0x5eed + n);
    this.cars = [];
    if (!this.lanes.length) return;
    const w = this.lanes.map((l) => Math.sqrt(l.length / 1000) * l.weight);
    const total = w.reduce((a, b) => a + b, 0) || 1;
    // Largest-remainder shares, so a lane appended late (the downtown avenues) is not starved
    // by the earlier lanes each rounding up to at least one car.
    const shares = w.map((wi) => (n * wi) / total);
    const counts = shares.map((s) => Math.floor(s));
    let used = counts.reduce((a, b) => a + b, 0);
    const remain = shares.map((s, i) => ({ i, f: s - Math.floor(s) })).sort((a, b) => b.f - a.f);
    for (const o of remain) {
      if (used >= n) break;
      counts[o.i] = (counts[o.i] ?? 0) + 1;
      used++;
    }
    if (n >= this.lanes.length) {
      for (let i = 0; i < counts.length; i++) {
        if ((counts[i] ?? 0) > 0) continue;
        let donor = 0;
        for (let j = 1; j < counts.length; j++) if ((counts[j] ?? 0) > (counts[donor] ?? 0)) donor = j;
        if ((counts[donor] ?? 0) <= 1) break;
        counts[donor] = (counts[donor] ?? 0) - 1;
        counts[i] = 1;
      }
    }
    let spin = 0, tr = 0;
    // cars travel in platoons of 1–4 at a shared speed, so a lane reads as strings of lights rather than dust
    this.lanes.forEach((lane, li) => {
      const k = counts[li] ?? 0;
      if (k <= 0) return;
      let placed = 0;
      while (placed < k && this.cars.length < n) {
        const size = lane.platoon
          ? Math.min(k - placed, lane.platoon[0] + Math.floor(r.next() * r.next() * (lane.platoon[1] - lane.platoon[0] + 0.2)))
          : Math.min(k - placed, 1 + Math.floor(r.next() * r.next() * 4.2));
        const head = r.next() * lane.length;
        const dir: 1 | -1 = lane.loop || r.chance(0.5) ? 1 : -1;
        const u0 = r.next();
        const lead: LaneClass = u0 < lane.police ? 'police' : u0 < lane.police + lane.transport ? 'transport' : 'civilian';
        const speed = r.range(lane.speed[0], lane.speed[1]) * (lead === 'transport' ? 0.7 : 1);
        let gap = 0;
        for (let i = 0; i < size && this.cars.length < n; i++) {
          // police escort their own; transports pull a civilian or two behind them
          const cls: LaneClass = i === 0 || lead === 'police' ? lead : r.chance(lane.transport) ? 'transport' : 'civilian';
          this.cars.push({
            lane, s: head - dir * gap, dir, speed, cls, phase: r.next(),
            p: new Vector3(), vel: new Vector3(), slot: cls === 'transport' ? tr++ : spin++,
          });
          gap += r.range(45, 90) + (cls === 'transport' ? 25 : 0);
          placed++;
        }
      }
    });
  }

  update(dt: number, camera: Camera, active: number): void {
    const n = Math.min(this.max, active);
    if (n !== this.active) {
      this.active = n;
      this.deal(n);
    }
    const cam = camera.position;
    const gc = this.gcol.array as Float32Array;
    let ns = 0, nt = 0;
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i]!;
      const L = c.lane.length;
      c.s += c.dir * c.speed * dt;
      if (c.lane.loop) c.s = ((c.s % L) + L) % L;
      else if (c.s > L) c.s -= L;
      else if (c.s < 0) c.s += L;
      sampleLane(c.lane, c.s, _p, _t);
      if (c.dir < 0) _t.negate();
      // open lanes: right-hand traffic, opposite directions separated sideways and in height
      _side.set(-_t.z, 0, _t.x).normalize();
      if (!c.lane.loop) _p.addScaledVector(_side, c.lane.sep).y += c.lane.altBias;
      _p.y += Math.sin(U.time.value * 0.4 + c.phase * 30) * 0.6;
      _prev.copy(c.p);
      c.p.copy(_p);
      if (dt > 0) c.vel.subVectors(c.p, _prev).divideScalar(dt);
      // bank into the curve: roll = atan(v² κ / g)
      sampleLane(c.lane, c.s + c.dir * 40, _t2, _t2);
      if (c.dir < 0) _t2.negate();
      const turn = _t.x * _t2.z - _t.z * _t2.x;
      const roll = Math.max(-0.6, Math.min(0.6, Math.atan((c.speed * c.speed * (Math.asin(Math.max(-1, Math.min(1, turn))) / 40)) / G)));
      _fwd.copy(_t);
      _q.setFromUnitVectors(_f, _fwd);
      _qr.setFromAxisAngle(_fwd, -roll);
      _q.premultiply(_qr);
      // fade in/out at the ends of open lanes
      const fade = Math.max(8, c.lane.fade);
      const edge = c.lane.loop ? 1 : Math.max(0, Math.min(1, Math.min(c.s, L - c.s) / fade));
      _m.compose(c.p, _q, _s.setScalar(edge));
      if (c.cls === 'transport') {
        this.trBody.setMatrixAt(nt, _m);
        this.trLights.setMatrixAt(nt, _m);
        nt++;
      } else {
        this.spinBody.setMatrixAt(ns, _m);
        this.spinLights.setMatrixAt(ns, _m);
        ns++;
      }
      const d = c.p.distanceTo(cam);
      const size = Math.max(c.cls === 'transport' ? 6 : 3.4, d * 0.0052) * edge;
      _m.compose(c.p, camera.quaternion, _s.setScalar(size));
      this.glow.setMatrixAt(i, _m);
      const mode = c.cls === 'police' ? 1 : 2;
      if (c.cls === 'transport') gc.set([1.0, 0.62, 0.22], i * 4);
      else if (c.cls === 'police') gc.set([1, 0.2, 0.25], i * 4);
      else gc.set([1.0, 0.86, 0.66], i * 4);
      gc[i * 4 + 3] = mode + c.phase * 0.95;
    }
    this.spinBody.count = this.spinLights.count = ns;
    this.trBody.count = this.trLights.count = nt;
    this.glow.count = this.cars.length;
    for (const im of [this.spinBody, this.spinLights, this.trBody, this.trLights, this.glow]) {
      im.instanceMatrix.needsUpdate = true;
      im.visible = im.count > 0;
    }
    this.gcol.needsUpdate = true;
  }

  /** Closest lane vehicle (audio flybys): position, distance, closing speed (m/s, + = approaching), heavy. */
  nearestTo(x: number, y: number, z: number): { x: number; y: number; z: number; dist: number; closing: number; heavy: boolean } | null {
    let best: LaneCar | null = null;
    let bd = Infinity;
    for (const c of this.cars) {
      const d = Math.hypot(c.p.x - x, c.p.y - y, c.p.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) return null;
    const inv = 1 / Math.max(bd, 0.001);
    const closing = ((x - best.p.x) * best.vel.x + (y - best.p.y) * best.vel.y + (z - best.p.z) * best.vel.z) * inv;
    return { x: best.p.x, y: best.p.y, z: best.p.z, dist: bd, closing, heavy: best.cls === 'transport' };
  }

  /** A vehicle on a named lane (camera presets). */
  carOn(laneId: string): { p: Vector3; vel: Vector3 } | null {
    const c = this.cars.find((k) => k.lane.id === laneId);
    return c ? { p: c.p, vel: c.vel } : null;
  }
}
