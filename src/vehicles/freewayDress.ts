// Sunken decks for the 110, the 101 and the 10, plus instanced headlight streaks on every freeway.
// Street streaks are appended after the freeway ones so a higher tier can draw only the freeway range.
// Quads lie on the deck. They are the far LOD. Near cars are real meshes.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, InstancedBufferAttribute, InstancedMesh,
  Matrix4, Mesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial, PlaneGeometry, Quaternion, StaticDrawUsage, Vector3,
} from 'three/webgpu';
import { uniform } from 'three/tsl';
import * as TSL from 'three/tsl';
import type { CityLayout } from '../world/layout';
import { U } from '../atmosphere/uniforms';
import { NO_STREET_GRAPH, freewayRoutes, type FreewayTrafficSpec } from './trafficRegistry';
import { TRENCH_LIP } from './trenchQuery';
import { poseOn, streetGraph, type GraphEdge, type StreetGraph } from './streetGraph';

const T = TSL as any;

/** Horizontal metres inside which streaks fade so a near car's own lamps can read. Negative disables the fade. */
export const streakNear = uniform(32);

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);
const _f = new Vector3(0, 0, -1);
const _fwd = new Vector3();

interface Sample { x: number; y: number; z: number }

function accept(layout: CityLayout, x: number, z: number): boolean {
  if (!layout.inBounds(x, z) || layout.isOcean(x, z)) return false;
  if (NO_STREET_GRAPH.has(layout.districtAt(x, z).id)) return false;
  if (layout.inLandmark(x, z, 2)) return false;
  return true;
}

function walk(layout: CityLayout, pts: Array<[number, number]>, step: number, depth: number): Sample[][] {
  const chains: Sample[][] = [];
  let cur: Sample[] = [];
  const flush = () => {
    if (cur.length >= 2) chains.push(cur);
    cur = [];
  };
  const push = (x: number, z: number) => {
    if (!accept(layout, x, z)) { flush(); return; }
    const prev = cur[cur.length - 1];
    if (prev && (prev.x - x) ** 2 + (prev.z - z) ** 2 < 0.25) return;
    cur.push({ x, y: layout.heightAt(x, z) - depth, z });
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i]![0], az = pts[i]![1], bx = pts[i + 1]![0], bz = pts[i + 1]![1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1) continue;
    const n = Math.max(1, Math.ceil(len / step));
    for (let s = 0; s < n; s++) {
      const t = s / n;
      push(ax + (bx - ax) * t, az + (bz - az) * t);
    }
  }
  const end = pts[pts.length - 1];
  if (end) push(end[0], end[1]);
  flush();
  return chains;
}

function trenchMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();
  m.name = 'traffic-trench';
  m.side = DoubleSide;
  const col = T.attribute('color', 'vec3');
  m.colorNode = col.mul(T.mix(T.float(1), T.float(0.6), U.wetness));
  m.roughnessNode = T.mix(T.float(0.88), T.float(0.26), U.wetness);
  m.metalness = 0.04;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1;
  m.polygonOffsetUnits = -2;
  return m;
}

function streakMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial();
  m.name = 'traffic-streak';
  m.transparent = true;
  m.depthWrite = false;
  m.blending = AdditiveBlending;
  m.side = DoubleSide;
  m.fog = false;
  const a = T.attribute('iStreak', 'vec4');
  const span = T.max(a.y, T.float(8));
  const u = T.fract(a.x.add(U.time.mul(T.float(28)).div(span)));
  m.positionNode = T.positionLocal.add(T.vec3(0, 0, u.mul(span).negate()));
  const tail = T.step(T.float(0.5), a.z);
  const col = T.mix(T.vec3(1.7, 1.48, 1.15), T.vec3(1.75, 0.07, 0.04), tail);
  const dx = T.positionWorld.x.sub(T.cameraPosition.x);
  const dz = T.positionWorld.z.sub(T.cameraPosition.z);
  const horiz = T.length(T.vec3(dx, T.float(0), dz));
  const near = T.smoothstep(streakNear, streakNear.add(42), horiz);
  const dist = T.length(T.positionWorld.sub(T.cameraPosition));
  const fog = T.exp(dist.mul(U.fogDensity).mul(T.float(0.9)).negate());
  const night = T.mix(T.float(0.22), T.float(1.35), U.night);
  m.colorNode = T.vec4(col.mul(near).mul(fog).mul(night), near.mul(fog));
  return m;
}

class Ribbon {
  readonly p: number[] = [];
  readonly n: number[] = [];
  readonly c: number[] = [];
  readonly idx: number[] = [];
  private v = 0;

  quad(a: number[], b: number[], c: number[], d: number[], rgb: [number, number, number]): void {
    const ax = b[0]! - a[0]!, ay = b[1]! - a[1]!, az = b[2]! - a[2]!;
    const bx = c[0]! - a[0]!, by = c[1]! - a[1]!, bz = c[2]! - a[2]!;
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const base = this.v;
    for (const p of [a, b, c, d]) {
      this.p.push(p[0]!, p[1]!, p[2]!);
      this.n.push(nx, ny, nz);
      this.c.push(rgb[0], rgb[1], rgb[2]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.v += 4;
  }
}

const DECK: [number, number, number] = [0.07, 0.074, 0.08];
const WALL: [number, number, number] = [0.095, 0.096, 0.1];
const LIP: [number, number, number] = [0.055, 0.056, 0.058];
const MED: [number, number, number] = [0.16, 0.15, 0.12];

function addTrench(layout: CityLayout, spec: FreewayTrafficSpec, ribbon: Ribbon): void {
  if (!spec.trench) return;
  const line = layout.freeways.find((f) => f.id === spec.id);
  if (!line) return;
  const halfRoad = spec.inset + (spec.lanes - 1) * spec.spacing + 2.4;
  const halfOut = TRENCH_LIP;
  const chains = walk(layout, line.pts as Array<[number, number]>, 32, spec.depth);
  for (const chain of chains) {
    const frames = chain.map((s, i) => {
      const n = chain[Math.min(chain.length - 1, i + 1)]!;
      const p = chain[Math.max(0, i - 1)]!;
      const fx = n.x - p.x, fz = n.z - p.z;
      const len = Math.hypot(fx, fz) || 1;
      return { s, rx: fz / len, rz: -fx / len };
    });
    const at = (f: { s: Sample; rx: number; rz: number }, side: number, y: number) => [
      f.s.x + f.rx * side, y, f.s.z + f.rz * side,
    ];
    for (let i = 0; i < frames.length - 1; i++) {
      const a = frames[i]!, b = frames[i + 1]!;
      const y0 = a.s.y, y1 = b.s.y;
      const lip0 = a.s.y + spec.depth + 0.22;
      const lip1 = b.s.y + spec.depth + 0.22;
      ribbon.quad(at(a, -halfRoad, y0), at(b, -halfRoad, y1), at(b, halfRoad, y1), at(a, halfRoad, y0), DECK);
      ribbon.quad(at(a, -halfRoad, lip0), at(a, -halfRoad, y0), at(b, -halfRoad, y1), at(b, -halfRoad, lip1), WALL);
      ribbon.quad(at(a, halfRoad, y0), at(a, halfRoad, lip0), at(b, halfRoad, lip1), at(b, halfRoad, y1), WALL);
      ribbon.quad(at(a, -halfOut, lip0), at(b, -halfOut, lip1), at(b, -halfRoad, lip1), at(a, -halfRoad, lip0), LIP);
      ribbon.quad(at(a, halfRoad, lip0), at(b, halfRoad, lip1), at(b, halfOut, lip1), at(a, halfOut, lip0), LIP);
      const mh = 0.85;
      const mw = 0.42;
      ribbon.quad(at(a, -mw, y0 + mh), at(b, -mw, y1 + mh), at(b, mw, y1 + mh), at(a, mw, y0 + mh), MED);
      ribbon.quad(at(a, -mw, y0), at(a, -mw, y0 + mh), at(b, -mw, y1 + mh), at(b, -mw, y1), MED);
      ribbon.quad(at(a, mw, y0 + mh), at(a, mw, y0), at(b, mw, y1), at(b, mw, y1 + mh), MED);
    }
  }
}

interface StreakSlot { x: number; y: number; z: number; fx: number; fz: number; span: number; phase: number; tail: number }

function pushStreak(out: StreakSlot[], x: number, y: number, z: number, fx: number, fz: number, span: number, phase: number, tail: number): void {
  if (span < 10) return;
  out.push({ x, y: y + 0.28, z, fx, fz, span, phase, tail });
}

function freewayStreaks(layout: CityLayout, spec: FreewayTrafficSpec, out: StreakSlot[]): void {
  const line = layout.freeways.find((f) => f.id === spec.id);
  if (!line) return;
  const chains = walk(layout, line.pts as Array<[number, number]>, spec.streakStep, spec.depth);
  for (const chain of chains) {
    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i]!, b = chain[i + 1]!;
      const dx = b.x - a.x, dz = b.z - a.z;
      const span = Math.hypot(dx, dz);
      const fx = dx / span, fz = dz / span;
      for (const dir of [1, -1] as const) {
        const tfx = fx * dir, tfz = fz * dir;
        const rx = tfz, rz = -tfx;
        for (let lane = 0; lane < spec.streakLanes; lane++) {
          const side = spec.inset + lane * spec.spacing;
          const tail = (i + lane + (dir < 0 ? 1 : 0)) % 2;
          pushStreak(
            out,
            a.x + rx * side, a.y, a.z + rz * side,
            tfx, tfz, span, dir < 0 ? 0.37 : 0, tail,
          );
        }
      }
    }
  }
}

const CORE_STREAKS = new Set(['downtown-avenues', 'broadway-canyon']);

function emitStreak(layout: CityLayout, g: StreetGraph, e: GraphEdge, t: number, span: number, i: number, out: StreakSlot[]): void {
  for (const dir of [1, -1] as const) {
    const pose = poseOn(g, e.index, t, dir, e.lane);
    const y = layout.heightAt(pose.x, pose.z) + e.deck;
    pushStreak(out, pose.x, y, pose.z, pose.fx, pose.fz, span, dir < 0 ? 0.37 : 0.08, (i + (dir < 0 ? 1 : 0)) % 2);
  }
}

/** Downtown and Broadway keep the original combined step, so adding a basin lattice does not thin them. */
function coreStreaks(layout: CityLayout, g: StreetGraph, edges: GraphEdge[], out: StreakSlot[]): void {
  let len = 0;
  for (const e of edges) len += e.length;
  const step = Math.max(26, (len * 2) / 7000);
  for (const e of edges) {
    if (e.length < step) continue;
    const n = Math.floor(e.length / step);
    for (let i = 0; i < n; i++) emitStreak(layout, g, e, (i + 0.35) / n, e.length / n, i, out);
  }
}

/** Each later route gets its own cap. Short residential edges still receive a dash. */
function routeStreaks(layout: CityLayout, g: StreetGraph, edges: GraphEdge[], out: StreakSlot[]): void {
  let len = 0;
  for (const e of edges) len += e.length;
  const step = Math.max(140, (len * 2) / 7000);
  let acc = step * 0.35;
  let i = 0;
  for (const e of edges) {
    while (acc < e.length) {
      emitStreak(layout, g, e, acc / e.length, Math.min(72, Math.max(26, e.length * 0.45)), i, out);
      acc += step;
      i++;
    }
    acc -= e.length;
  }
}

function streetStreaks(layout: CityLayout, g: StreetGraph, out: StreakSlot[]): void {
  const core: GraphEdge[] = [];
  const extra = new Map<string, GraphEdge[]>();
  for (const e of g.edges) {
    if (e.kind === 'freeway') continue;
    if (CORE_STREAKS.has(e.route)) core.push(e);
    else {
      const list = extra.get(e.route);
      if (list) list.push(e);
      else extra.set(e.route, [e]);
    }
  }
  coreStreaks(layout, g, core, out);
  for (const edges of extra.values()) routeStreaks(layout, g, edges, out);
}

function fillStreaks(slots: StreakSlot[]): InstancedMesh {
  const geo = new PlaneGeometry(1.6, 14);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -7);
  const data = new Float32Array(slots.length * 4);
  const mesh = new InstancedMesh(geo, streakMaterial(), slots.length);
  mesh.name = 'traffic-streaks';
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]!;
    _fwd.set(s.fx, 0, s.fz);
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    _q.setFromUnitVectors(_f, _fwd);
    _p.set(s.x, s.y, s.z);
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    data.set([s.phase, s.span, s.tail, 0], i * 4);
  }
  geo.setAttribute('iStreak', new InstancedBufferAttribute(data, 4));
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.count = slots.length;
  return mesh;
}

export interface TrafficDress {
  trench: Mesh | null;
  streaks: InstancedMesh | null;
  /** Instances that are freeway slots. Higher tiers draw only these. */
  freewayStreaks: number;
  streakTotal: number;
}

export function createTrafficDress(layout: CityLayout): TrafficDress {
  const ribbon = new Ribbon();
  const freewaySlots: StreakSlot[] = [];
  for (const spec of freewayRoutes()) {
    const line = layout.freeways.find((f) => f.id === spec.id);
    if (!line) continue;
    addTrench(layout, spec, ribbon);
    freewayStreaks(layout, spec, freewaySlots);
  }
  const streetSlots: StreakSlot[] = [];
  streetStreaks(layout, streetGraph(layout), streetSlots);
  const slots = freewaySlots.concat(streetSlots);

  let trench: Mesh | null = null;
  if (ribbon.p.length) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(ribbon.p), 3));
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(ribbon.n), 3));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(ribbon.c), 3));
    geo.setIndex(new BufferAttribute(new Uint32Array(ribbon.idx), 1));
    trench = new Mesh(geo, trenchMaterial());
    trench.name = 'traffic-trench';
    trench.frustumCulled = false;
  }
  const streaks = slots.length ? fillStreaks(slots) : null;
  return { trench, streaks, freewayStreaks: freewaySlots.length, streakTotal: slots.length };
}
