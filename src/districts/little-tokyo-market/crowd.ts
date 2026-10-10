// One instanced crowd for the whole city. A district registers loops and a share; the mesh
// and the walk shader stay here. Legs and arms are a vertex-shader cycle (one draw, no
// skeleton, no pose texture): a planted stance half keeps the feet from skating at 1.5 m/s.
// The umbrella is parented to the right hand. Distant and low-tier people hold a static pose.
import {
  BufferAttribute, BufferGeometry, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicNodeMaterial,
  Quaternion, Vector3,
} from 'three/webgpu';
import * as TSL from 'three/tsl';
import type { CityQuery, PackedBlock } from '../../world/CityQuery';
import type { QualitySettings, Tier } from '../../core/quality';
import { hash2i } from '../../core/rng';
import { U } from '../../atmosphere/uniforms';
import type { CrowdLifeSpot } from '../../world/crowdLife';
import { allHolograms } from '../../world/holograms/registry';
import { streetGraph, visitBins } from '../../vehicles/streetGraph';
import { axisLamp } from '../../vehicles/trafficSignals';
import { dressBlock, pedestrianLoops, stallFrontLoop, type MarketBlock } from './dress';
import { marketSpots } from './spots';

const T = TSL as any;
const {
  attribute, float, vec3, vec4, sin, cos, mix, step, positionGeometry, positionLocal, abs, fract, asin, clamp,
} = T;

const MAX = 720;
/** Full cycle (two steps) at the 1.5 m/s base walk. Frequency is speed / STRIDE. */
const STRIDE = 1.42;
const TAU = 6.28318530718;

const COATS: Array<[number, number, number]> = [
  [0.045, 0.043, 0.048], [0.07, 0.07, 0.075], [0.1, 0.1, 0.105], [0.15, 0.145, 0.14],
  [0.09, 0.1, 0.07], [0.11, 0.12, 0.08], [0.16, 0.08, 0.05], [0.13, 0.07, 0.045],
  [0.055, 0.055, 0.06],
];
const CANOPY: Array<[number, number, number]> = [
  [1.0, 0.2, 0.45], [0.2, 0.78, 1.0], [1.0, 0.58, 0.16], [0.82, 0.28, 1.0],
  [1.0, 0.86, 0.28], [0.2, 0.88, 0.58], [1.0, 0.32, 0.18], [0.72, 0.76, 0.8],
];

export type { CrowdLifeSpot };

export interface CrowdBundle {
  loops: Array<Array<[number, number]>>;
  /** Extra sidewalks. A minority of walkers use these so the original loops stay the main paths. */
  extra?: Array<Array<[number, number]>>;
  life?: CrowdLifeSpot[];
}

export type CrowdSource = (blocks: PackedBlock[], query: CityQuery) => Array<Array<[number, number]>> | CrowdBundle;

interface CrowdReg {
  share: number;
  fn: CrowdSource;
}

const crowdSources = new Map<string, CrowdReg>();

export interface CrowdAudioSnap {
  districtId: string;
  /** Registered share of the tier count. */
  share: number;
  /** People actually drawn this frame. */
  count: number;
  /** Tier count times share, before the sidewalk test. */
  want: number;
  /** Stall, counter and awning anchors the district already built. */
  life: readonly CrowdLifeSpot[];
}

const NO_LIFE: readonly CrowdLifeSpot[] = [];
const crowdAudio: CrowdAudioSnap = { districtId: '', share: 0, count: 0, want: 0, life: NO_LIFE };

/** What the city-sound bus reads. Density is the registered share, filled by the live count. */
export function crowdAudioSnap(): CrowdAudioSnap {
  return crowdAudio;
}

export function crowdShareOf(id: string): number {
  return crowdSources.get(id)?.share ?? 0;
}

function publishCrowd(id: string, share: number, count: number, want: number, life: readonly CrowdLifeSpot[]): void {
  crowdAudio.districtId = id;
  crowdAudio.share = share;
  crowdAudio.count = count;
  crowdAudio.want = want;
  crowdAudio.life = life;
}

/**
 * Register where this district's people walk, and its share of the market tier count.
 * The market mesh is the only draw. App does not grow a branch per district.
 */
export function registerCrowdSource(districtId: string, fn: CrowdSource, share: number): void {
  crowdSources.set(districtId, { share, fn });
}

/** Fraction of walkers and queues holding an umbrella. Rises with rain and stays monotonic. */
export function umbrellaFraction(rain: number): number {
  if (rain <= 0.02) return 0;
  if (rain < 0.22) return 0.28;
  if (rain < 0.5) return 0.55;
  if (rain < 0.82) return 0.74;
  return 0.9;
}

interface Loop {
  pts: Array<[number, number]>;
  len: number;
  seg: number[];
  kind: 'walk' | 'cross';
  extra: boolean;
  axis: 0 | 1;
  node: number;
}

type Role = 'walk' | 'vendor' | 'queue' | 'awning' | 'gaze';

interface Agent {
  loop: number;
  u: number;
  speed: number;
  base: number;
  cycle: number;
  coat: [number, number, number];
  canopy: [number, number, number];
  hood: number;
  hat: number;
  bag: number;
  shortCoat: number;
  role: Role;
  hold: boolean;
  ix: number;
  iz: number;
  iyaw: number;
  x: number;
  z: number;
  yaw: number;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);
const _up = new Vector3(0, 1, 0);

function personGeometry(): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const part: number[] = [];
  const idx: number[] = [];
  let v = 0;
  const pushVert = (x: number, y: number, z: number, nx: number, ny: number, nz: number, p: number) => {
    pos.push(x, y, z);
    nor.push(nx, ny, nz);
    part.push(p);
    v++;
  };
  const wedge = (cx: number, cy: number, cz: number, w: number, h: number, d: number, p: number) => {
    const x = w / 2, y = h / 2, z = d / 2;
    const apex: [number, number, number] = [cx, cy + y, cz];
    const base: Array<[number, number, number]> = [
      [cx - x, cy - y, cz + z], [cx + x, cy - y, cz + z],
      [cx + x, cy - y, cz - z], [cx - x, cy - y, cz - z],
    ];
    const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const i0 = v;
      pushVert(a[0], a[1], a[2], nx, ny, nz, p);
      pushVert(b[0], b[1], b[2], nx, ny, nz, p);
      pushVert(c[0], c[1], c[2], nx, ny, nz, p);
      idx.push(i0, i0 + 1, i0 + 2);
    };
    for (let i = 0; i < 4; i++) tri(apex, base[i]!, base[(i + 1) % 4]!);
    tri(base[0]!, base[2]!, base[1]!);
    tri(base[0]!, base[3]!, base[2]!);
  };
  const box = (cx: number, cy: number, cz: number, w: number, h: number, d: number, p: number) => {
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
      const base = v;
      for (const c of corners) {
        pos.push(cx + c[0], cy + c[1], cz + c[2]);
        nor.push(nx, ny, nz);
        part.push(p);
        v++;
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  };
  // 0 torso, 1 head, 2 legL, 3 legR, 4 armL, 5 armR, 6 long coat, 7 canopy, 8 shaft,
  // 9 hood, 10 hat, 11 bag, 12 short coat. Body is 1.80 m to the top of the head.
  box(0, 1.2, 0, 0.34, 0.52, 0.2, 0);
  box(0, 1.69, 0, 0.17, 0.22, 0.17, 1);
  box(-0.1, 0.46, 0, 0.12, 0.88, 0.14, 2);
  box(0.1, 0.46, 0, 0.12, 0.88, 0.14, 3);
  box(-0.32, 1.14, 0.02, 0.09, 0.64, 0.09, 4);
  box(0.32, 1.14, 0.02, 0.09, 0.64, 0.09, 5);
  // Hem sits above the knee so the calves clear the coat. A floor-length box hid the walk.
  box(0, 1.12, 0, 0.46, 0.78, 0.26, 6);
  // Shallow pyramid, not a flat disc: at eye height a disc is a one-pixel edge.
  wedge(0.34, 1.78, 0.08, 0.92, 0.3, 0.92, 7);
  box(0.34, 1.33, 0.08, 0.026, 1.02, 0.026, 8);
  box(0, 1.7, -0.02, 0.3, 0.32, 0.28, 9);
  box(0, 1.78, 0, 0.34, 0.028, 0.34, 10);
  box(0, 1.86, 0, 0.16, 0.12, 0.16, 10);
  box(-0.34, 0.98, 0.05, 0.16, 0.3, 0.13, 11);
  box(0, 1.14, 0, 0.48, 0.7, 0.28, 12);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('part', new BufferAttribute(new Float32Array(part), 1));
  g.setIndex(idx);
  return g;
}

function crowdMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial();
  m.name = 'Crowd';
  m.fog = true;
  // Solid canopy. A dithered disc broke into holes at street distance, and a flat disc
  // is edge-on at eye height, so the shell is a small pyramid in the one opaque draw.
  const part = attribute('part', 'float');
  const motion = attribute('iMotion', 'vec4');
  const style = attribute('iStyle', 'vec4');
  const coat = attribute('iCoat', 'vec3');
  const can = attribute('iCanopy', 'vec3');
  const cycle = motion.x;
  const amp = motion.y;
  const umbrella = motion.z;
  const look = motion.w;
  const isL = step(1.5, part).mul(step(part, 2.5));
  const isR = step(2.5, part).mul(step(part, 3.5));
  const isAL = step(3.5, part).mul(step(part, 4.5));
  const isAR = step(4.5, part).mul(step(part, 5.5));
  const isCoat = step(5.5, part).mul(step(part, 6.5)).add(step(11.5, part).mul(step(part, 12.5)));
  const isCan = step(6.5, part).mul(step(part, 7.5));
  const isShaft = step(7.5, part).mul(step(part, 8.5));
  const isHood = step(8.5, part).mul(step(part, 9.5));
  const isHat = step(9.5, part).mul(step(part, 10.5));
  const isBag = step(10.5, part).mul(step(part, 11.5));
  const isHead = step(0.5, part).mul(step(part, 1.5));
  const vendor = step(3.5, look);
  const isGaze = step(1.5, look).mul(step(look, 2.5));
  const idleSway = step(0.5, look).mul(step(look, 3.5)).mul(float(1).sub(amp));
  // Stance half plants the foot: local Z falls at the walk speed, so world Z holds.
  const footZ = (phase: any) => {
    const p = fract(phase);
    const stance = step(p, float(0.5));
    const zStance = float(STRIDE).mul(float(0.25).sub(p));
    const zSwing = float(STRIDE).mul(p.sub(0.75));
    return mix(zSwing, zStance, stance);
  };
  const limb = (phase: any, length: number, travel: number) => {
    const z = footZ(phase).mul(travel);
    return asin(clamp(z.div(length).mul(-1), -0.92, 0.92)).mul(amp);
  };
  const sway = sin(U.time.mul(1.15).add(cycle.mul(TAU))).mul(idleSway);
  const vendorArm = sin(cycle.mul(TAU)).mul(vendor).mul(0.42);
  const legL = limb(cycle, 0.88, 1);
  const legR = limb(cycle.add(0.5), 0.88, 1);
  const armL = limb(cycle.add(0.5), 0.64, 0.8).add(vendorArm.mul(-1));
  const armR = limb(cycle, 0.64, 0.8).add(vendorArm);
  const coatAng = footZ(cycle).mul(amp).mul(-0.1).add(sway.mul(0.07));
  const headAng = footZ(cycle).mul(amp).mul(0.03).add(isGaze.mul(-0.58)).add(sway.mul(0.05));
  const bagAng = limb(cycle.add(0.5), 0.42, 0.35);
  const rotX = (pos: any, px: number, py: number, pz: number, ang: any) => {
    const dy = pos.y.sub(py);
    const dz = pos.z.sub(pz);
    const c = cos(ang);
    const s = sin(ang);
    return vec3(pos.x, float(py).add(dy.mul(c).sub(dz.mul(s))), float(pz).add(dy.mul(s).add(dz.mul(c))));
  };
  // Deform the raw attribute. setupPosition assigns this BEFORE the instanced-mesh
  // multiply. positionNode runs after that multiply, so a rotate there swings the
  // instance position around the origin.
  let pos = positionGeometry;
  pos = mix(pos, rotX(pos, -0.1, 0.9, 0, legL), isL);
  pos = mix(pos, rotX(pos, 0.1, 0.9, 0, legR), isR);
  pos = mix(pos, rotX(pos, -0.32, 1.46, 0, armL), isAL);
  pos = mix(pos, rotX(pos, 0.32, 1.46, 0, armR), isAR);
  pos = mix(pos, rotX(pos, 0.32, 1.46, 0, armR), isCan);
  pos = mix(pos, rotX(pos, 0.32, 1.46, 0, armR), isShaft);
  pos = mix(pos, rotX(pos, 0, 1.5, 0, coatAng), isCoat);
  pos = mix(pos, rotX(pos, 0, 1.5, 0, headAng), isHead);
  pos = mix(pos, rotX(pos, 0, 1.5, 0, headAng), isHood);
  pos = mix(pos, rotX(pos, 0, 1.5, 0, headAng), isHat);
  pos = mix(pos, rotX(pos, -0.28, 1.15, 0, bagAng), isBag);
  const bob = abs(sin(cycle.mul(TAU))).mul(amp).mul(0.02);
  pos = pos.add(vec3(0, bob, 0));
  const show = (flag: any, mask: any) => mix(float(1), flag, mask);
  pos = mix(vec3(0, 1.7, 0), pos, show(style.x, isHood));
  pos = mix(vec3(0, 1.8, 0), pos, show(style.y, isHat));
  pos = mix(vec3(-0.34, 0.98, 0.05), pos, show(style.z, isBag));
  pos = mix(vec3(0, 1.0, 0), pos, show(float(1).sub(style.w), step(5.5, part).mul(step(part, 6.5))));
  pos = mix(vec3(0, 1.14, 0), pos, show(style.w, step(11.5, part).mul(step(part, 12.5))));
  pos = mix(vec3(0.34, 0.82, 0.08), pos, show(umbrella, isCan.add(isShaft)));
  const skin = vec3(0.55, 0.42, 0.34);
  const shaftCol = vec3(1.0, 0.74, 0.38);
  let col = mix(coat, skin, isHead);
  col = mix(col, coat.mul(0.62), isL.add(isR));
  col = mix(col, coat.mul(0.55), isBag);
  col = mix(col, can, isCan);
  col = mix(col, shaftCol, isShaft);
  const glow = float(0.55).add(isShaft.mul(0.85).add(isShaft.mul(U.night).mul(0.55))).add(isCan.mul(0.2));
  m.colorNode = vec4(col.mul(glow), float(1));
  const setup = m.setupPosition.bind(m);
  m.setupPosition = (builder) => {
    positionLocal.assign(pos);
    return setup(builder);
  };
  return m;
}

function layoutId(query: CityQuery, index: number): string {
  const d = index === 0 ? query.layout.defaultDistrict : query.layout.districts[index - 1];
  return d?.id ?? '';
}

function pushLoops(
  out: Loop[], seen: Set<string>, lists: Array<Array<[number, number]>>,
  extra: boolean, kind: Loop['kind'] = 'walk', axis: 0 | 1 = 0, node = 0,
): void {
  for (const pts of lists) {
    if (pts.length < 2) continue;
    const a = pts[0]!;
    const key = `${kind}:${a[0].toFixed(1)},${a[1].toFixed(1)}:${pts.length}:${extra ? 1 : 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const seg: number[] = [];
    let len = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!, c = pts[(i + 1) % pts.length]!;
      const L = Math.hypot(c[0] - p[0], c[1] - p[1]);
      seg.push(L);
      len += L;
    }
    if (len > 8) out.push({ pts, len, seg, kind, extra, axis, node });
  }
}

function addCrossings(out: Loop[], walks: Loop[], query: CityQuery, x: number, z: number, radius: number): void {
  const g = streetGraph(query.layout);
  const seen = new Set<string>();
  const pts: Array<[number, number]> = [];
  for (const loop of walks) {
    if (loop.extra) continue;
    for (const p of loop.pts) pts.push(p);
  }
  visitBins(x, z, radius + 24, (key) => {
    const ids = g.signalBins.get(key);
    if (!ids) return;
    for (const n of ids) {
      const node = g.nodes[n];
      if (!node || Math.hypot(node.x - x, node.z - z) > radius + 18) continue;
      const links = g.links[n];
      if (!links?.length) continue;
      let ax0: { fx: number; fz: number } | null = null;
      let ax1: { fx: number; fz: number } | null = null;
      for (const link of links) {
        const e = g.edges[link.edge];
        if (!e || e.kind === 'freeway') continue;
        if (e.axis === 0 && !ax0) ax0 = e;
        if (e.axis === 1 && !ax1) ax1 = e;
      }
      if (!ax0 || !ax1) continue;
      for (const axis of [0, 1] as const) {
        const road = axis === 0 ? ax0 : ax1;
        const sx = -road.fz;
        const sz = road.fx;
        let pos: [number, number] | null = null;
        let neg: [number, number] | null = null;
        let posD = 1e9;
        let negD = 1e9;
        for (const p of pts) {
          const dx = p[0] - node.x;
          const dz = p[1] - node.z;
          const along = dx * road.fx + dz * road.fz;
          const side = dx * sx + dz * sz;
          if (Math.abs(along) > 16) continue;
          const d = dx * dx + dz * dz;
          if (d > 28 * 28) continue;
          if (side > 1.4 && d < posD) { posD = d; pos = p; }
          if (side < -1.4 && d < negD) { negD = d; neg = p; }
        }
        if (!pos || !neg) continue;
        const span = Math.hypot(pos[0] - neg[0], pos[1] - neg[1]);
        if (span < 5 || span > 26) continue;
        const id = `${n}:${axis}`;
        if (seen.has(id)) continue;
        seen.add(id);
        pushLoops(out, new Set(), [[pos, neg]], false, 'cross', axis, n);
      }
    }
  });
}

interface Gather {
  loops: Loop[];
  life: CrowdLifeSpot[];
}

function gather(blocks: PackedBlock[], query: CityQuery, x: number, z: number, radius: number): Gather {
  const loops: Loop[] = [];
  const seen = new Set<string>();
  const life: CrowdLifeSpot[] = [];
  const ids = new Set<string>();
  for (const b of blocks) ids.add(layoutId(query, b.districtIndex));
  for (const id of ids) {
    const src = crowdSources.get(id);
    if (!src) continue;
    const result = src.fn(blocks, query);
    const bundle: CrowdBundle = Array.isArray(result) ? { loops: result } : result;
    pushLoops(loops, seen, bundle.loops, false);
    if (bundle.extra) pushLoops(loops, seen, bundle.extra, true);
    if (bundle.life) life.push(...bundle.life);
  }
  const walks = loops.filter((l) => l.kind === 'walk');
  addCrossings(loops, walks, query, x, z, radius);
  return { loops, life };
}

function pointOn(loop: Loop, u: number): { x: number; z: number; yaw: number } {
  let d = ((u % 1) + 1) % 1 * loop.len;
  for (let i = 0; i < loop.seg.length; i++) {
    const L = loop.seg[i]!;
    if (d <= L || i === loop.seg.length - 1) {
      const t = L > 0 ? Math.min(1, d / L) : 0;
      const a = loop.pts[i]!;
      const b = loop.pts[(i + 1) % loop.pts.length]!;
      const tx = b[0] - a[0], tz = b[1] - a[1];
      return { x: a[0] + tx * t, z: a[1] + tz * t, yaw: Math.atan2(tx, tz) };
    }
    d -= L;
  }
  const a = loop.pts[0]!;
  return { x: a[0], z: a[1], yaw: 0 };
}

function unit(i: number, salt: number): number {
  return hash2i(i, 2049, salt) / 4294967296;
}

function coatOf(i: number): [number, number, number] {
  const h = hash2i(i, 2049, 3) % 1000;
  if (h < 40) return [0.74, 0.75, 0.77];
  if (h < 70) return [0.62, 0.8, 0.78];
  return COATS[hash2i(i, 2049, 4) % COATS.length]!;
}

function styleOf(i: number): { hood: number; hat: number; bag: number; shortCoat: number } {
  const s = hash2i(i, 2049, 5) % 1000;
  const hood = (s >= 340 && s < 560) || (s >= 820 && s < 920) ? 1 : 0;
  const hat = (s >= 560 && s < 700) || s >= 920 ? 1 : 0;
  const bag = s >= 700 && s < 920 ? 1 : 0;
  const shortCoat = hood === 0 && hash2i(i, 2049, 6) % 100 < 28 ? 1 : 0;
  return { hood, hat, bag, shortCoat };
}

function animReach(tier: Tier): number {
  if (tier === 'low') return 0;
  if (tier === 'medium') return 28;
  if (tier === 'high') return 48;
  return 72;
}

function idleBudget(want: number): number {
  if (want < 8) return want >= 4 ? 1 : 0;
  return Math.min(28, Math.max(2, Math.round(want * 0.12)));
}

const lifeCache = new Map<string, CrowdLifeSpot[]>();

function marketSource(blocks: PackedBlock[], query: CityQuery): CrowdBundle {
  const loops: Array<Array<[number, number]>> = [];
  const extra: Array<Array<[number, number]>> = [];
  const life: CrowdLifeSpot[] = [];
  for (const b of blocks) {
    if (layoutId(query, b.districtIndex) !== 'little-tokyo-market') continue;
    const mb: MarketBlock = {
      cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, la: b.la, lb: b.lb,
      street: b.street, seed: b.seed, ground: b.ground,
    };
    loops.push(...pedestrianLoops(mb));
    extra.push(stallFrontLoop(mb));
    const key = `${b.cx.toFixed(1)},${b.cz.toFixed(1)}`;
    let spots = lifeCache.get(key);
    if (!spots) {
      spots = dressBlock(mb, query.layout).life;
      lifeCache.set(key, spots);
    }
    life.push(...spots);
  }
  return { loops, extra, life };
}

registerCrowdSource('little-tokyo-market', marketSource, 1);

let sharedMat: MeshBasicNodeMaterial | null = null;

export class CrowdField {
  readonly mesh: InstancedMesh;
  count = 0;
  animated = 0;
  staticCount = 0;
  idle = 0;
  tris = 0;
  private readonly trisPer: number;
  private agents: Agent[] = [];
  private loops: Loop[] = [];
  private life: CrowdLifeSpot[] = [];
  private mainIdx: number[] = [];
  private extraIdx: number[] = [];
  private crossIdx: number[] = [];
  private loopKey = '';
  private coatAttr: InstancedBufferAttribute;
  private canopyAttr: InstancedBufferAttribute;
  private motionAttr: InstancedBufferAttribute;
  private styleAttr: InstancedBufferAttribute;

  constructor() {
    const geo = personGeometry();
    this.trisPer = (geo.index?.count ?? 0) / 3;
    if (!sharedMat) sharedMat = crowdMaterial();
    this.mesh = new InstancedMesh(geo, sharedMat, MAX);
    this.mesh.name = 'crowd';
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.coatAttr = new InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.canopyAttr = new InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.motionAttr = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.styleAttr = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.coatAttr.setUsage(DynamicDrawUsage);
    this.canopyAttr.setUsage(DynamicDrawUsage);
    this.motionAttr.setUsage(DynamicDrawUsage);
    this.styleAttr.setUsage(DynamicDrawUsage);
    geo.setAttribute('iCoat', this.coatAttr);
    geo.setAttribute('iCanopy', this.canopyAttr);
    geo.setAttribute('iMotion', this.motionAttr);
    geo.setAttribute('iStyle', this.styleAttr);
  }

  update(dt: number, x: number, z: number, query: CityQuery, quality: QualitySettings, rain: number, time = 0): void {
    const district = query.district(x, z);
    const share = crowdSources.get(district.id)?.share ?? 0;
    const want = Math.min(MAX, Math.round(quality.crowd * share));
    const radius = quality.crowdRadius;
    if (want <= 0) {
      this.count = 0;
      this.animated = 0;
      this.staticCount = 0;
      this.idle = 0;
      this.tris = 0;
      this.mesh.count = 0;
      publishCrowd(district.id, share, 0, 0, NO_LIFE);
      return;
    }
    const blocks = query.cachedBlocks(x, z, radius);
    const bucket = rain < 0.08 ? 0 : rain < 0.35 ? 1 : rain < 0.75 ? 2 : 3;
    const key = `${district.id}:${want}:${blocks.length}:${blocks[0]?.seed ?? 0}:${blocks[blocks.length - 1]?.seed ?? 0}:${Math.round(x / 20)}:${Math.round(z / 20)}:${bucket}`;
    if (key !== this.loopKey) {
      this.loopKey = key;
      const g = gather(blocks, query, x, z, radius);
      this.loops = g.loops;
      this.life = g.life;
      this.mainIdx = [];
      this.extraIdx = [];
      this.crossIdx = [];
      this.loops.forEach((loop, i) => {
        if (loop.kind === 'cross') this.crossIdx.push(i);
        else if (loop.extra) this.extraIdx.push(i);
        else this.mainIdx.push(i);
      });
      this.retarget(want, x, z, rain);
    }
    const loops = this.loops;
    // No sidewalk in range: draw nobody. A vendor or a gaze slot is not a loop.
    // Keeping the mesh up parked those people at the origin and added a draw on
    // low, where this district previously had an empty count.
    if (!loops.length) {
      this.count = 0;
      this.animated = 0;
      this.staticCount = 0;
      this.idle = 0;
      this.tris = 0;
      this.mesh.count = 0;
      publishCrowd(district.id, share, 0, want, this.life);
      return;
    }
    const n = Math.min(this.agents.length, want, MAX);
    for (let i = 0; i < n; i++) {
      const a = this.agents[i]!;
      a.hold = false;
      if (a.role !== 'walk') continue;
      const loop = loops[a.loop] ?? loops[0];
      if (!loop) continue;
      if (loop.kind === 'cross') {
        const open = axisLamp(loop.node, loop.axis, time) === 'stop';
        const u = a.u;
        const nearCurb = u < 0.12 || (u > 0.38 && u < 0.62) || u > 0.88;
        if (!open && nearCurb) {
          a.hold = true;
          a.speed = 0;
          a.u = u < 0.25 || u > 0.75 ? 0.001 : 0.5;
        } else a.speed = a.base;
      }
    }
    this.avoid(n);
    for (let i = 0; i < n; i++) {
      const a = this.agents[i]!;
      if (a.role === 'vendor') {
        a.cycle = (a.cycle + dt * 0.9) % 1;
        continue;
      }
      if (a.role !== 'walk' || a.hold) continue;
      const loop = loops[a.loop] ?? loops[0];
      if (!loop || loop.len < 1) continue;
      a.u = (a.u + (a.speed * dt) / loop.len) % 1;
      a.cycle = (a.cycle + (a.speed * dt) / STRIDE) % 1;
    }
    const reach = animReach(quality.tier);
    const holdUmbrella = umbrellaFraction(rain);
    const coat = this.coatAttr.array as Float32Array;
    const canopy = this.canopyAttr.array as Float32Array;
    const motion = this.motionAttr.array as Float32Array;
    const style = this.styleAttr.array as Float32Array;
    const spots = marketSpots(query.layout);
    const vendors = [spots.noodle?.cook, spots.bibi?.cook].filter((v): v is NonNullable<typeof v> => !!v);
    let vendorSlot = 0;
    let animated = 0;
    let idle = 0;
    for (let i = 0; i < n; i++) {
      const a = this.agents[i]!;
      if (a.role === 'vendor' && vendors.length) {
        const v = vendors[vendorSlot % vendors.length]!;
        vendorSlot++;
        if (Math.hypot(v.x - x, v.z - z) < radius) {
          a.x = v.x; a.z = v.z; a.yaw = v.yaw;
        } else {
          a.x = 1e6; a.z = 1e6;
        }
      } else if (a.role === 'vendor') {
        a.x = 1e6; a.z = 1e6;
      } else if (a.role === 'walk') {
        const loop = loops[a.loop] ?? loops[0];
        if (loop) {
          const p = pointOn(loop, a.u);
          a.x = p.x; a.z = p.z; a.yaw = p.yaw;
        } else {
          a.x = 1e6; a.z = 1e6;
        }
      } else {
        a.x = a.ix; a.z = a.iz; a.yaw = a.iyaw;
      }
      const dist = Math.hypot(a.x - x, a.z - z);
      const moving = a.role === 'walk' && !a.hold && a.speed > 0.35 && dist < reach;
      const amp = moving ? 1 : 0;
      if (amp > 0 || (a.role === 'vendor' && quality.tier !== 'low' && a.x < 1e5 && dist < reach)) animated++;
      if (a.role !== 'walk' && a.x < 1e5) idle++;
      const gy = a.x > 1e5 ? 0 : query.groundHeight(a.x, a.z);
      _p.set(a.x, gy, a.z);
      _q.setFromAxisAngle(_up, a.yaw);
      coat.set(a.coat, i * 3);
      canopy.set(a.canopy, i * 3);
      const sheltered = a.role === 'awning' || a.role === 'vendor';
      const hasUmbrella = !sheltered && unit(i, 12) < holdUmbrella ? 1 : 0;
      const look = a.role === 'queue' ? 1 : a.role === 'gaze' ? 2 : a.role === 'awning' ? 3 : a.role === 'vendor' ? 4 : 0;
      const hidden = a.x > 1e5 || (a.role !== 'vendor' && dist < 1.05);
      _s.set(hidden ? 0 : 1, hidden ? 0 : 1, hidden ? 0 : 1);
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      motion.set([a.cycle, amp, hasUmbrella, look], i * 4);
      style.set([a.hood, a.hat, a.bag, a.shortCoat], i * 4);
    }
    this.mesh.count = n;
    this.count = n;
    this.animated = animated;
    this.idle = idle;
    this.staticCount = n - animated;
    this.tris = n * this.trisPer;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.coatAttr.needsUpdate = true;
    this.canopyAttr.needsUpdate = true;
    this.motionAttr.needsUpdate = true;
    this.styleAttr.needsUpdate = true;
    publishCrowd(district.id, share, n, want, this.life);
  }

  private retarget(want: number, x: number, z: number, rain: number): void {
    const n = Math.min(want, MAX);
    while (this.agents.length < n) {
      const i = this.agents.length;
      const st = styleOf(i);
      const base = 1.5 * (0.88 + unit(i, 8) * 0.24);
      this.agents.push({
        loop: 0,
        u: unit(i, 9),
        speed: base,
        base,
        cycle: unit(i, 10),
        coat: coatOf(i),
        canopy: CANOPY[hash2i(i, 2049, 2) % CANOPY.length]!,
        hood: st.hood,
        hat: st.hat,
        bag: st.bag,
        shortCoat: st.shortCoat,
        role: 'walk',
        hold: false,
        ix: 0, iz: 0, iyaw: 0, x: 0, z: 0, yaw: 0,
      });
    }
    // Two cook slots exist on every tier, matching the previous field. They only
    // stand when this district has a counter; otherwise they stay parked off-map.
    const vendorN = 2;
    const budget = idleBudget(n);
    const placed: Array<{ x: number; z: number; yaw: number; role: Role }> = [];
    const ranked = this.life
      .map((s) => ({ s, d: (s.x - x) ** 2 + (s.z - z) ** 2 }))
      .filter((e) => e.d < 90 * 90)
      .sort((a, b) => a.d - b.d);
    let gaze: { x: number; z: number; yaw: number } | null = null;
    let gazeD = 70 * 70;
    for (const h of allHolograms()) {
      if (h.band !== 'street') continue;
      const d = (h.x - x) ** 2 + (h.z - z) ** 2;
      if (d >= gazeD) continue;
      gazeD = d;
      const ox = Math.sin(h.yaw);
      const oz = Math.cos(h.yaw);
      gaze = { x: h.x + ox * 6.5, z: h.z + oz * 6.5, yaw: Math.atan2(-ox, -oz) };
    }
    const awn = rain > 0.18 ? ranked.find((e) => e.s.kind === 'awning') : undefined;
    // A full idle budget keeps a pair under the awning and one watcher. Tight budgets stay queues.
    const reserve = budget >= 5 ? (awn ? 2 : 0) + (gaze ? 1 : 0) : 0;
    let queueLeft = budget - reserve;
    for (const { s } of ranked) {
      if (s.kind !== 'queue' || queueLeft < 2) continue;
      const count = Math.max(2, Math.min(5, s.n, queueLeft));
      if (count < 2) continue;
      for (let k = 0; k < count; k++) {
        const u = (k - (count - 1) / 2) * 0.58;
        placed.push({ x: s.x + s.lx * u, z: s.z + s.lz * u, yaw: s.yaw, role: 'queue' });
      }
      queueLeft -= count;
    }
    const room = () => budget - placed.length;
    if (awn && room() >= 2) {
      const count = Math.max(2, Math.min(4, awn.s.n, room()));
      for (let k = 0; k < count; k++) {
        const u = (k - (count - 1) / 2) * 0.7;
        placed.push({ x: awn.s.x + awn.s.lx * u, z: awn.s.z + awn.s.lz * u, yaw: awn.s.yaw, role: 'awning' });
      }
    }
    if (gaze && room() >= 1) placed.push({ ...gaze, role: 'gaze' });
    for (let i = 0; i < n; i++) {
      const a = this.agents[i]!;
      if (i < vendorN) {
        a.role = 'vendor';
        a.speed = 0;
        continue;
      }
      const slot = placed[i - vendorN];
      if (slot) {
        a.role = slot.role;
        a.ix = slot.x;
        a.iz = slot.z;
        a.iyaw = slot.yaw;
        a.speed = 0;
      } else {
        a.role = 'walk';
        a.loop = this.pickLoop(i);
        a.speed = a.base;
      }
    }
  }

  private pickLoop(i: number): number {
    const h = hash2i(i, 2049, 15) % 1000;
    if (h < 90 && this.crossIdx.length) return this.crossIdx[i % this.crossIdx.length]!;
    if (h < 300 && this.extraIdx.length) return this.extraIdx[i % this.extraIdx.length]!;
    if (this.mainIdx.length) return this.mainIdx[i % this.mainIdx.length]!;
    if (this.extraIdx.length) return this.extraIdx[i % this.extraIdx.length]!;
    if (this.crossIdx.length) return this.crossIdx[i % this.crossIdx.length]!;
    return 0;
  }

  private avoid(n: number): void {
    const by = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const a = this.agents[i]!;
      if (a.role !== 'walk' || a.hold) continue;
      const id = a.loop;
      let arr = by.get(id);
      if (!arr) by.set(id, (arr = []));
      arr.push(i);
    }
    for (const [id, ids] of by) {
      const loop = this.loops[id];
      if (!loop || ids.length < 2) {
        for (const i of ids) {
          const a = this.agents[i]!;
          if (!a.hold) a.speed = a.base;
        }
        continue;
      }
      ids.sort((a, b) => this.agents[a]!.u - this.agents[b]!.u);
      for (let k = 0; k < ids.length; k++) {
        const a = this.agents[ids[k]!]!;
        const b = this.agents[ids[(k + 1) % ids.length]!]!;
        let gap = b.u - a.u;
        if (gap < 0) gap += 1;
        const metres = gap * loop.len;
        a.speed = metres < 0.9 ? a.base * 0.28 : a.base;
      }
    }
  }
}
