// Ground traffic on the shared street graph. One instanced draw per vehicle class.
// Low tier draws light streaks only. Higher tiers keep real cars near the camera and streaks farther out.
// Signals are clocks. Cars walk the graph, stop at a red line, and leave a gap. No physics.
import {
  BoxGeometry, BufferGeometry, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4,
  MeshBasicNodeMaterial, MeshStandardNodeMaterial, Object3D, PlaneGeometry, Quaternion, Vector3, type Camera,
} from 'three/webgpu';
import * as TSL from 'three/tsl';
import type { CityQuery } from '../world/CityQuery';
import type { Tier } from '../core/quality';
import { Rng, trueRandomSeed } from '../core/rng';
import { U } from '../atmosphere/uniforms';
import { getPoolMaterial } from '../districts/_shared/kit/materials';
import { advanceGraph, edgeNear, poseOn, streetGraph, type GraphEdge, type StreetGraph } from './streetGraph';
import { MESH_LEN, vehicleGeometry, vehicleMaterial, type MeshId } from './vehicleModels';
import { createTrafficDress, streakNear, type TrafficDress } from './freewayDress';
import { SPINE_B } from '../districts/south-la-megablocks/spec';
import { LAMP_RGB, STOP_LINE, axisLamp, lampHeld, type Lamp } from './trafficSignals';

const T = TSL as any;

const MESHES: MeshId[] = ['car', 'van', 'box', 'hauler'];
const STREET_R = 400;
const FREEWAY_R = 640;

interface Agent {
  edge: number;
  t: number;
  dir: 1 | -1;
  side: number;
  speed: number;
  salt: number;
  mesh: MeshId;
  sx: number;
  sy: number;
  sz: number;
  len: number;
  freeway: boolean;
  live: boolean;
  p: Vector3;
  fwd: Vector3;
}

interface Head {
  node: number;
  axis: 0 | 1;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _pos = new Vector3();
const _back = new Vector3(0, 0, -1);

function endDist(e: GraphEdge, c: Agent): number {
  return (c.dir > 0 ? 1 - c.t : c.t) * e.length;
}

function setEndDist(c: Agent, e: GraphEdge, dist: number): void {
  const d = Math.max(0.35, Math.min(e.length - 0.35, dist));
  c.t = c.dir > 0 ? 1 - d / e.length : d / e.length;
}

export class GroundTraffic {
  private street: Agent[] = [];
  private freeway: Agent[] = [];
  private bodies: Record<MeshId, InstancedMesh>;
  private rng = new Rng(trueRandomSeed() ^ 0x6a11);
  private dress: TrafficDress;
  private poles: InstancedMesh | null = null;
  private heads: InstancedMesh | null = null;
  private headRec: Head[] = [];
  private headMats: Matrix4[] = [];
  private lampAttr: InstancedBufferAttribute | null = null;
  private pools: InstancedMesh;
  private poolAttr: InstancedBufferAttribute;
  private streetPick: number[] = [];
  private freewayPick: number[] = [];
  readonly nodes: Object3D[];
  count = 0;
  streetCount = 0;
  freewayCount = 0;
  streakCount = 0;
  queued = 0;
  viewSignal: Lamp | 'none' = 'none';
  /** 0..1 engine and tyre bed for the ambience bus. */
  bed = 0;

  constructor(scene: import('three/webgpu').Scene, private query: CityQuery, maxStreet: number, maxFreeway: number) {
    const cap = Math.max(1, maxStreet + maxFreeway);
    const material = vehicleMaterial();
    this.bodies = {
      car: this.mesh(scene, 'car', vehicleGeometry('car'), material, cap),
      van: this.mesh(scene, 'van', vehicleGeometry('van'), material, cap),
      box: this.mesh(scene, 'box', vehicleGeometry('box'), material, cap),
      hauler: this.mesh(scene, 'hauler', vehicleGeometry('hauler'), material, cap),
    };
    this.dress = createTrafficDress(query.layout);
    if (this.dress.trench) scene.add(this.dress.trench);
    if (this.dress.streaks) scene.add(this.dress.streaks);
    this.buildSignals(scene);
    const poolGeo = new PlaneGeometry(1, 1);
    poolGeo.rotateX(-Math.PI / 2);
    this.poolAttr = new InstancedBufferAttribute(new Float32Array(32 * 4), 4);
    poolGeo.setAttribute('iLight', this.poolAttr);
    this.pools = new InstancedMesh(poolGeo, getPoolMaterial(), 32);
    this.pools.name = 'traffic-pools';
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 3;
    this.pools.count = 0;
    scene.add(this.pools);
    this.nodes = [
      ...MESHES.map((id) => this.bodies[id]),
      ...(this.dress.trench ? [this.dress.trench] : []),
      ...(this.dress.streaks ? [this.dress.streaks] : []),
      ...(this.poles ? [this.poles] : []),
      ...(this.heads ? [this.heads] : []),
      this.pools,
    ];
  }

  private mesh(scene: import('three/webgpu').Scene, name: string, geo: BufferGeometry, material: MeshStandardNodeMaterial, cap: number): InstancedMesh {
    const im = new InstancedMesh(geo, material, cap);
    im.name = `ground-${name}`;
    im.instanceMatrix.setUsage(DynamicDrawUsage);
    im.frustumCulled = false;
    im.count = 0;
    im.visible = false;
    scene.add(im);
    return im;
  }

  private buildSignals(scene: import('three/webgpu').Scene): void {
    const g = streetGraph(this.query.layout);
    const layout = this.query.layout;
    const rec: Head[] = [];
    const matrices: Matrix4[] = [];
    for (let i = 0; i < g.nodes.length; i++) {
      if (!g.signal[i]) continue;
      const seen = new Set<number>();
      for (const link of g.links[i]!) {
        if (seen.has(link.edge)) continue;
        seen.add(link.edge);
        const e = g.edges[link.edge];
        if (!e || e.kind === 'freeway' || e.length < STOP_LINE + 6) continue;
        const inbound: 1 | -1 = link.dir === 1 ? -1 : 1;
        const back = Math.min(STOP_LINE + 0.2, e.length * 0.42);
        const t = inbound > 0 ? 1 - back / e.length : back / e.length;
        const pose = poseOn(g, e.index, t, inbound, e.lane + 1.45);
        const y = layout.heightAt(pose.x, pose.z) + e.deck;
        matrices.push(new Matrix4().setPosition(pose.x, y, pose.z));
        rec.push({ node: i, axis: e.axis });
      }
    }
    if (!rec.length) return;
    const poleMat = new MeshStandardNodeMaterial({ color: 0x1a1c20 });
    poleMat.roughnessNode = T.mix(T.float(0.86), T.float(0.34), U.wetness);
    poleMat.metalness = 0.08;
    const poleGeo = new BoxGeometry(0.16, 5.45, 0.16).translate(0, 2.72, 0);
    this.poles = new InstancedMesh(poleGeo, poleMat, rec.length);
    this.poles.name = 'traffic-poles';
    this.poles.frustumCulled = false;
    const headGeo = new BoxGeometry(0.34, 0.46, 0.26).translate(0, 5.52, 0);
    const colors = new Float32Array(rec.length * 3);
    this.lampAttr = new InstancedBufferAttribute(colors, 3);
    this.lampAttr.setUsage(DynamicDrawUsage);
    headGeo.setAttribute('iLamp', this.lampAttr);
    const headMat = new MeshBasicNodeMaterial();
    headMat.fog = false;
    const lamp = T.attribute('iLamp', 'vec3');
    const dist = T.length(T.positionWorld.sub(T.cameraPosition));
    const fade = T.smoothstep(T.float(520), T.float(70), dist);
    headMat.colorNode = lamp.mul(T.mix(T.float(0.4), T.float(1.65), U.night)).mul(fade);
    this.heads = new InstancedMesh(headGeo, headMat, rec.length);
    this.heads.name = 'traffic-heads';
    this.heads.frustumCulled = false;
    this.heads.renderOrder = 3;
    this.poles.instanceMatrix.setUsage(DynamicDrawUsage);
    this.heads.instanceMatrix.setUsage(DynamicDrawUsage);
    // The whole basin's heads would be one mesh. Draw only the ones near the camera.
    this.poles.count = 0;
    this.heads.count = 0;
    this.poles.visible = false;
    this.heads.visible = false;
    this.headRec = rec;
    this.headMats = matrices;
    scene.add(this.poles, this.heads);
  }

  private blank(): Agent {
    return {
      edge: 0, t: 0.5, dir: 1, side: 7.2, speed: 10, salt: 1,
      mesh: 'car', sx: 1, sy: 1, sz: 1, len: MESH_LEN.car, freeway: false, live: false,
      p: new Vector3(), fwd: new Vector3(0, 0, -1),
    };
  }

  private style(e: GraphEdge, freeway: boolean, g?: StreetGraph): Pick<Agent, 'mesh' | 'sx' | 'sy' | 'sz' | 'len' | 'speed'> {
    const rng = this.rng;
    if (!freeway && (e.kind === 'canyon' || e.lane < 5)) {
      if (rng.chance(0.28)) {
        return { mesh: 'car', sx: 0.5, sy: 1.22, sz: 0.7, len: MESH_LEN.car * 0.7, speed: rng.range(6, 11) };
      }
      if (rng.chance(0.2)) {
        return { mesh: 'car', sx: 1.12, sy: 1.42, sz: 1.28, len: MESH_LEN.car * 1.28, speed: rng.range(8, 14) };
      }
      return { mesh: 'car', sx: 0.96 + rng.int(0, 4) * 0.015, sy: 1, sz: 1, len: MESH_LEN.car, speed: rng.range(8, 16) };
    }
    let mesh: MeshId;
    if (freeway) {
      const r = rng.next();
      mesh = r < 0.34 ? 'car' : r < 0.58 ? 'van' : r < 0.8 ? 'box' : 'hauler';
    } else if (e.district === 'civic-center') {
      mesh = rng.chance(0.2) ? 'van' : 'car';
    } else if (e.district === 'lakewood-megablocks') {
      mesh = rng.chance(0.16) ? 'van' : 'car';
    } else if (e.district === 'south-la-megablocks') {
      const j = g?.nodes[e.a]?.j;
      const spine = e.axis === 0 && j !== undefined && (SPINE_B as readonly number[]).includes(j) && e.length >= 160;
      mesh = spine && rng.chance(0.08) ? 'box' : rng.chance(0.2) ? 'van' : 'car';
    } else if (e.district === 'arts-district') {
      const r = rng.next();
      mesh = r < 0.62 ? 'box' : r < 0.9 ? 'hauler' : 'van';
    } else if (e.district === 'westside') {
      mesh = rng.chance(0.18) ? 'van' : 'car';
    } else {
      const r = rng.next();
      mesh = r < 0.62 ? 'car' : r < 0.82 ? 'van' : r < 0.94 ? 'box' : 'hauler';
    }
    if ((mesh === 'box' || mesh === 'hauler') && e.length < 40) mesh = 'van';
    let speed: number;
    if (freeway) speed = mesh === 'hauler' ? rng.range(16, 26) : mesh === 'box' ? rng.range(18, 28) : rng.range(22, 34);
    else if (mesh === 'hauler') speed = rng.range(7, 11);
    else if (mesh === 'box') speed = rng.range(7, 12);
    else if (mesh === 'van') speed = rng.range(8, 14);
    else speed = rng.range(8, 16);
    const sx = mesh === 'car' ? 0.96 + rng.int(0, 4) * 0.015 : 1;
    return { mesh, sx, sy: 1, sz: 1, len: MESH_LEN[mesh], speed };
  }

  private place(c: Agent, g: StreetGraph, x: number, z: number, freeway: boolean, nearBias: boolean): boolean {
    const list = freeway ? this.freewayPick : this.streetPick;
    let edge = -1;
    let t = 0.5;
    if (nearBias) {
      const near = edgeNear(g, x, z, 110, freeway ? 'freeway' : 'street');
      if (near) { edge = near.edge; t = Math.min(0.9, Math.max(0.1, near.t)); }
    }
    if (edge < 0) {
      if (!list.length) return false;
      edge = this.pick(list, g);
      t = 0.08 + this.rng.next() * 0.84;
    }
    const e = g.edges[edge];
    if (!e) return false;
    c.edge = edge;
    c.t = t;
    c.dir = this.rng.chance(0.5) ? 1 : -1;
    c.salt = this.rng.int(1, 9000);
    c.freeway = freeway;
    if (freeway) {
      const lane = this.rng.int(0, Math.max(0, e.laneCount - 1));
      c.side = e.lane + lane * e.laneGap;
    } else {
      c.side = (this.rng.chance(0.5) ? 1 : -1) * e.lane;
    }
    Object.assign(c, this.style(e, freeway, g));
    this.commit(c, g);
    c.live = true;
    return true;
  }

  /** Keep a few street cars ahead of the camera so a crossing reads as a queue. */
  private anchorStreet(g: StreetGraph, x: number, z: number, fx: number, fz: number): void {
    let close = 0;
    let far: Agent | null = null;
    let farD = -1;
    for (const c of this.street) {
      if (!c.live) continue;
      const d2 = (c.p.x - x) ** 2 + (c.p.z - z) ** 2;
      if (d2 < 48 * 48) close++;
      else if (d2 > farD) { farD = d2; far = c; }
    }
    if (close >= 6 || !far) return;
    const ahead = 12 + this.rng.next() * 22;
    const near = edgeNear(g, x + fx * ahead, z + fz * ahead, 36, 'street') ?? edgeNear(g, x, z, 80, 'street');
    if (!near) return;
    const e = g.edges[near.edge];
    if (!e) return;
    const withLook: 1 | -1 = e.fx * fx + e.fz * fz >= 0 ? 1 : -1;
    const oncoming = this.rng.chance(0.42);
    far.edge = near.edge;
    far.t = Math.min(0.92, Math.max(0.08, near.t));
    far.dir = oncoming ? (withLook === 1 ? -1 : 1) : withLook;
    far.side = e.lane;
    far.freeway = false;
    far.salt = this.rng.int(1, 9000);
    Object.assign(far, this.style(e, false, g));
    this.commit(far, g);
    far.live = true;
  }

  private pick(list: number[], g: StreetGraph): number {
    let sum = 0;
    for (const i of list) {
      const e = g.edges[i]!;
      sum += e.length * Math.max(0.05, e.density);
    }
    let r = this.rng.next() * (sum || 1);
    for (const i of list) {
      const e = g.edges[i]!;
      r -= e.length * Math.max(0.05, e.density);
      if (r <= 0) return i;
    }
    return list[list.length - 1]!;
  }

  private collect(g: StreetGraph, x: number, z: number): void {
    this.streetPick.length = 0;
    this.freewayPick.length = 0;
    const rs = STREET_R * STREET_R;
    const rf = FREEWAY_R * FREEWAY_R;
    for (const e of g.edges) {
      const a = g.nodes[e.a]!, b = g.nodes[e.b]!;
      const dx = (a.x + b.x) / 2 - x;
      const dz = (a.z + b.z) / 2 - z;
      const d2 = dx * dx + dz * dz;
      if (e.kind === 'freeway') { if (d2 < rf) this.freewayPick.push(e.index); }
      else if (d2 < rs) this.streetPick.push(e.index);
    }
  }

  private fill(list: Agent[], want: number, freeway: boolean, g: StreetGraph, x: number, z: number): void {
    if (want <= 0 || !(freeway ? this.freewayPick : this.streetPick).length) {
      list.length = 0;
      return;
    }
    let guard = 0;
    while (list.length < want && guard++ < want + 6) {
      const c = this.blank();
      if (!this.place(c, g, x, z, freeway, !freeway && list.length < 3)) break;
      list.push(c);
    }
    if (list.length > want) list.length = want;
  }

  private commit(c: Agent, g: StreetGraph): void {
    const e = g.edges[c.edge];
    if (!e) { c.live = false; return; }
    const pose = poseOn(g, c.edge, c.t, c.dir, c.side);
    c.p.set(pose.x, this.query.layout.heightAt(pose.x, pose.z) + e.deck + 0.02, pose.z);
    c.fwd.set(pose.fx, 0, pose.fz);
    if (c.fwd.lengthSq() < 1e-8) c.fwd.set(0, 0, -1);
  }

  private drive(c: Agent, g: StreetGraph, dt: number, time: number): void {
    const e0 = g.edges[c.edge];
    if (!e0) { c.live = false; return; }
    let allow = c.speed * dt;
    if (e0.kind !== 'freeway') {
      const node = c.dir > 0 ? e0.b : e0.a;
      if (g.signal[node]) {
        const dist = endDist(e0, c);
        if (lampHeld(axisLamp(node, e0.axis, time), dist)) {
          const room = dist - STOP_LINE;
          allow = room <= 0.2 ? 0 : Math.min(allow, room);
        }
      }
    }
    const prevDir = c.dir;
    const prevEdge = c.edge;
    const step = advanceGraph(g, c.edge, c.t, c.dir, allow, c.salt);
    c.edge = step.edge;
    c.t = step.t;
    c.dir = step.dir;
    const e1 = g.edges[c.edge];
    if (!e1) { c.live = false; return; }
    if (e1.kind === 'freeway') {
      if (step.edge === prevEdge && step.dir !== prevDir) c.side = -c.side;
    } else {
      const sign = c.side < 0 ? -1 : 1;
      c.side = sign * e1.lane;
    }
  }

  private separate(list: Agent[], g: StreetGraph, time: number, freeway: boolean): void {
    const groups = new Map<string, Agent[]>();
    for (const c of list) {
      if (!c.live) continue;
      const key = `${c.edge}:${c.dir}:${Math.round(c.side * 4)}`;
      const arr = groups.get(key);
      if (arr) arr.push(c);
      else groups.set(key, [c]);
    }
    const gap = freeway ? 4.2 : 1.75;
    for (const arr of groups.values()) {
      const e = g.edges[arr[0]!.edge];
      if (!e) continue;
      arr.sort((a, b) => endDist(e, a) - endDist(e, b));
      const node = arr[0]!.dir > 0 ? e.b : e.a;
      let minDist = -1e9;
      for (const c of arr) {
        let d = endDist(e, c);
        const stop = !freeway && g.signal[node] === 1 && lampHeld(axisLamp(node, e.axis, time), d);
        const floor = stop && d >= STOP_LINE - 1.5 ? Math.max(minDist, STOP_LINE) : minDist;
        if (d < floor) {
          setEndDist(c, e, floor);
          d = Math.max(0.35, Math.min(e.length - 0.35, floor));
        }
        minDist = d + c.len + gap;
      }
    }
  }

  private repaintSignals(g: StreetGraph, cam: Vector3, time: number): void {
    if (!this.heads || !this.poles || !this.lampAttr) return;
    const rgb = this.lampAttr.array as Float32Array;
    const reach = 500 * 500;
    let n = 0;
    for (let i = 0; i < this.headRec.length; i++) {
      const h = this.headRec[i]!;
      const node = g.nodes[h.node];
      if (!node) continue;
      const d = (node.x - cam.x) ** 2 + (node.z - cam.z) ** 2;
      if (d > reach) continue;
      const lamp = axisLamp(h.node, h.axis, time);
      const c = LAMP_RGB[lamp];
      rgb[n * 3] = c[0];
      rgb[n * 3 + 1] = c[1];
      rgb[n * 3 + 2] = c[2];
      const mat = this.headMats[i];
      if (mat) {
        this.poles.setMatrixAt(n, mat);
        this.heads.setMatrixAt(n, mat);
      }
      n++;
    }
    this.poles.count = n;
    this.heads.count = n;
    this.poles.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    this.lampAttr.needsUpdate = true;
    this.heads.visible = n > 0;
    this.poles.visible = n > 0;
  }

  private readSignal(g: StreetGraph, camera: Camera, time: number): Lamp | 'none' {
    camera.updateMatrixWorld();
    const cam = camera.position;
    let best = -1;
    let bd = 80 * 80;
    for (let i = 0; i < g.nodes.length; i++) {
      if (!g.signal[i]) continue;
      const n = g.nodes[i]!;
      const d2 = (n.x - cam.x) ** 2 + (n.z - cam.z) ** 2;
      if (d2 < bd) { bd = d2; best = i; }
    }
    if (best < 0) return 'none';
    const e = camera.matrixWorld.elements;
    const fx = -e[8]!, fz = -e[10]!;
    let axis: 0 | 1 = 0;
    let dot = -1;
    for (const link of g.links[best]!) {
      const ed = g.edges[link.edge];
      if (!ed || ed.kind === 'freeway') continue;
      const d = Math.abs(ed.fx * fx + ed.fz * fz);
      if (d > dot) { dot = d; axis = ed.axis; }
    }
    return axisLamp(best, axis, time);
  }

  private paintPools(cam: Vector3, wet: boolean): void {
    if (!wet) {
      this.pools.count = 0;
      this.pools.visible = false;
      return;
    }
    const near: Array<{ c: Agent; d2: number }> = [];
    const take = (list: Agent[]) => {
      for (const c of list) {
        if (!c.live) continue;
        const d2 = (c.p.x - cam.x) ** 2 + (c.p.z - cam.z) ** 2;
        if (d2 < 46 * 46) near.push({ c, d2 });
      }
    };
    take(this.street);
    take(this.freeway);
    near.sort((a, b) => a.d2 - b.d2);
    const n = Math.min(16, near.length);
    const attr = this.poolAttr.array as Float32Array;
    let w = 0;
    for (let i = 0; i < n; i++) {
      const c = near[i]!.c;
      for (const tail of [0, 1]) {
        const sign = tail ? -1 : 1;
        _pos.set(c.p.x + c.fwd.x * c.len * 0.32 * sign, c.p.y + 0.08, c.p.z + c.fwd.z * c.len * 0.32 * sign);
        _back.set(0, 0, -1);
        _q.setFromUnitVectors(_back, c.fwd);
        _s.set(tail ? 1.45 : 1.7, 1, tail ? 2.8 : 3.6);
        this.pools.setMatrixAt(w, _m.compose(_pos, _q, _s));
        attr.set(tail ? [1.55, 0.06, 0.04, 1.05] : [1.45, 1.25, 0.85, 1.15], w * 4);
        w++;
      }
    }
    this.pools.count = w;
    this.pools.visible = w > 0;
    if (w) {
      this.pools.instanceMatrix.needsUpdate = true;
      this.poolAttr.needsUpdate = true;
    }
  }

  update(dt: number, camera: Camera, streetBudget: number, freewayBudget: number, tier: Tier, elapsed: number): void {
    const g = streetGraph(this.query.layout);
    const cam = camera.position;
    const step = Math.min(Math.max(dt, 0), 0.05);
    this.collect(g, cam.x, cam.z);
    const dens = this.query.layout.districtAt(cam.x, cam.z).traffic;
    const wantS = tier === 'low' ? 0 : Math.round(streetBudget * Math.max(0, dens));
    const wantF = tier === 'low' || !this.freewayPick.length ? 0 : freewayBudget;
    this.fill(this.street, wantS, false, g, cam.x, cam.z);
    this.fill(this.freeway, wantF, true, g, cam.x, cam.z);

    const maintain = (list: Agent[], freeway: boolean, radius: number) => {
      const r2 = radius * radius;
      for (const c of list) {
        const dx = c.p.x - cam.x, dz = c.p.z - cam.z;
        if (!c.live || dx * dx + dz * dz > r2) {
          c.live = this.place(c, g, cam.x, cam.z, freeway, false);
        }
        if (!c.live) continue;
        this.drive(c, g, step, elapsed);
      }
    };
    maintain(this.street, false, STREET_R);
    maintain(this.freeway, true, FREEWAY_R);
    camera.updateMatrixWorld();
    const look = camera.matrixWorld.elements;
    for (let n = 0; n < 4; n++) this.anchorStreet(g, cam.x, cam.z, -look[8]!, -look[10]!);
    this.separate(this.street, g, elapsed, false);
    this.separate(this.freeway, g, elapsed, true);

    const buckets: Record<MeshId, number> = { car: 0, van: 0, box: 0, hauler: 0 };
    let streetLive = 0;
    let freewayLive = 0;
    const draw = (list: Agent[], freeway: boolean) => {
      for (const c of list) {
        if (!c.live) continue;
        if (freeway) freewayLive++;
        else streetLive++;
        this.commit(c, g);
        const i = buckets[c.mesh]++;
        _s.set(c.sx, c.sy, c.sz);
        _back.set(0, 0, -1);
        _q.setFromUnitVectors(_back, c.fwd);
        this.bodies[c.mesh].setMatrixAt(i, _m.compose(c.p, _q, _s));
      }
    };
    draw(this.street, false);
    draw(this.freeway, true);
    for (const id of MESHES) {
      const n = buckets[id];
      const im = this.bodies[id];
      im.count = n;
      im.visible = n > 0;
      if (n) im.instanceMatrix.needsUpdate = true;
    }

    this.streetCount = streetLive;
    this.freewayCount = freewayLive;
    this.count = streetLive + freewayLive;
    let queued = 0;
    for (const c of this.street) {
      if (!c.live) continue;
      const e = g.edges[c.edge];
      if (!e) continue;
      const node = c.dir > 0 ? e.b : e.a;
      if (!g.signal[node]) continue;
      const d = endDist(e, c);
      if (d < STOP_LINE + c.len + 6 && lampHeld(axisLamp(node, e.axis, elapsed), d)) queued++;
    }
    this.queued = queued;
    this.viewSignal = this.readSignal(g, camera, elapsed);
    this.repaintSignals(g, cam, elapsed);
    this.paintPools(cam, tier !== 'low' && U.wetness.value > 0.22);
    const alt = cam.y - this.query.layout.heightAt(cam.x, cam.z);
    if (this.dress.streaks) {
      const low = tier === 'low';
      this.dress.streaks.count = low ? this.dress.streakTotal : this.dress.freewayStreaks;
      this.dress.streaks.visible = this.dress.streaks.count > 0;
      streakNear.value = low ? -180 : alt > 16 ? 18 : 32;
      this.streakCount = this.dress.streaks.count;
    } else this.streakCount = 0;

    let near = 0;
    let fwy = 0;
    const hear = (list: Agent[], freeway: boolean) => {
      const lim = freeway ? 100 : 70;
      for (const c of list) {
        if (!c.live) continue;
        const d2 = (c.p.x - cam.x) ** 2 + (c.p.z - cam.z) ** 2;
        if (d2 < lim * lim) {
          near++;
          if (freeway) fwy++;
        }
      }
    };
    hear(this.street, false);
    hear(this.freeway, true);
    let bed = Math.min(1, near / 5) * 0.7 + Math.min(1, fwy / 3) * 0.5;
    if (this.freewayPick.length && alt < 45) bed = Math.max(bed, 0.32);
    const fade = alt < 28 ? 1 : Math.max(0, 1 - (alt - 28) / 150);
    this.bed = Math.min(1, bed * fade);
  }
}
