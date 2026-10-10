// One instanced crowd for the whole market. Silhouettes: long coat, head, a sliding walk cycle,
// a lit umbrella when it is raining. Lanes come from the dressed block's sidewalk loops.
// Avoidance is a sort along the lane: if the person ahead is closer than ~0.9 m, slow down.
import {
  BufferAttribute, BufferGeometry, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicNodeMaterial,
  Quaternion, Vector3,
} from 'three/webgpu';
import * as TSL from 'three/tsl';
import type { CityQuery, PackedBlock } from '../../world/CityQuery';
import type { QualitySettings } from '../../core/quality';
import { U } from '../../atmosphere/uniforms';
import { pedestrianLoops, type MarketBlock } from './dress';
import { marketSpots } from './spots';

const T = TSL as any;
const { attribute, float, vec3, vec4, sin, cos, mix, step, positionLocal, abs } = T;

const MAX = 720;
const COATS: Array<[number, number, number]> = [
  [0.08, 0.07, 0.08], [0.12, 0.09, 0.07], [0.05, 0.06, 0.08], [0.16, 0.14, 0.12],
  [0.07, 0.08, 0.1], [0.18, 0.08, 0.08], [0.06, 0.07, 0.06], [0.1, 0.1, 0.12],
];
const CANOPY: Array<[number, number, number]> = [
  [1.0, 0.16, 0.42], [0.15, 0.75, 1.0], [1.0, 0.55, 0.12], [0.85, 0.2, 1.0],
  [1.0, 0.85, 0.2], [0.15, 0.9, 0.55], [1.0, 0.25, 0.15], [0.7, 0.75, 0.8],
];

interface Loop {
  pts: Array<[number, number]>;
  len: number;
  seg: number[];
}

interface Agent {
  loop: number;
  u: number;
  speed: number;
  base: number;
  phase: number;
  umbrella: number;
  coat: [number, number, number];
  canopy: [number, number, number];
  vendor: boolean;
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
  // 0 torso, 1 head, 2 legL, 3 legR, 4 armL, 5 armR, 6 coat, 7 canopy, 8 shaft
  box(0, 1.12, 0, 0.36, 0.52, 0.2, 0);
  box(0, 1.55, 0, 0.16, 0.18, 0.16, 1);
  box(-0.09, 0.42, 0, 0.1, 0.8, 0.12, 2);
  box(0.09, 0.42, 0, 0.1, 0.8, 0.12, 3);
  box(-0.24, 1.12, 0, 0.08, 0.46, 0.08, 4);
  box(0.24, 1.12, 0, 0.08, 0.46, 0.08, 5);
  box(0, 1.02, 0, 0.48, 0.78, 0.28, 6);
  box(0, 2.02, 0, 1.05, 0.035, 1.05, 7);
  box(0, 1.72, 0.02, 0.025, 0.55, 0.025, 8);
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
  const part = attribute('part', 'float');
  const agent = attribute('iAgent', 'vec4');
  const coat = attribute('iCoat', 'vec3');
  const can = attribute('iCanopy', 'vec3');
  const origin = attribute('iOrigin', 'vec3');
  const phase = agent.x;
  const moving = agent.y;
  const umbrella = agent.z;
  const yaw = agent.w;
  const swing = sin(U.time.mul(5.2).add(phase.mul(6.28))).mul(moving);
  const isL = step(1.5, part).mul(step(part, 2.5));
  const isR = step(2.5, part).mul(step(part, 3.5));
  const isAL = step(3.5, part).mul(step(part, 4.5));
  const isAR = step(4.5, part).mul(step(part, 5.5));
  const sign = isL.mul(1).add(isR.mul(-1)).add(isAL.mul(-0.65)).add(isAR.mul(0.65));
  const along = swing.mul(sign).mul(0.16);
  const c = cos(yaw);
  const s = sin(yaw);
  const hide = step(6.5, part).mul(float(1).sub(umbrella));
  const bob = abs(swing).mul(0.015).mul(moving);
  m.positionNode = positionLocal
    .add(vec3(s.mul(along), bob, c.mul(along)))
    .sub(positionLocal.sub(origin).mul(hide));
  const skin = vec3(0.55, 0.42, 0.34);
  const isHead = step(0.5, part).mul(step(part, 1.5));
  const isCan = step(6.5, part);
  const col = mix(mix(coat, skin, isHead), can, isCan);
  const glow = isCan.mul(U.night).mul(0.85).add(0.55);
  m.colorNode = vec4(col.mul(glow), float(1));
  return m;
}

export type CrowdSource = (blocks: PackedBlock[], query: CityQuery) => Array<Array<[number, number]>>;

const crowdSources = new Map<string, CrowdSource>();

/** Other districts feed the same crowd mesh. The market stays the built-in source. */
export function registerCrowdSource(districtId: string, fn: CrowdSource): void {
  crowdSources.set(districtId, fn);
}

function pushLoops(out: Loop[], seen: Set<string>, lists: Array<Array<[number, number]>>): void {
  for (const pts of lists) {
    if (pts.length < 3) continue;
    const a = pts[0]!;
    const key = `${a[0].toFixed(1)},${a[1].toFixed(1)}:${pts.length}`;
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
    if (len > 8) out.push({ pts, len, seg });
  }
}

function loopsFrom(blocks: PackedBlock[], query: CityQuery): Loop[] {
  const out: Loop[] = [];
  const seen = new Set<string>();
  const layoutId = (index: number) => {
    const d = index === 0 ? query.layout.defaultDistrict : query.layout.districts[index - 1];
    return d?.id ?? '';
  };
  for (const b of blocks) {
    if (layoutId(b.districtIndex) !== 'little-tokyo-market') continue;
    const mb: MarketBlock = {
      cx: b.cx, cz: b.cz, ax: b.ax, az: b.az, la: b.la, lb: b.lb,
      street: b.street, seed: b.seed, ground: b.ground,
    };
    pushLoops(out, seen, pedestrianLoops(mb));
  }
  const called = new Set<string>();
  for (const b of blocks) {
    const id = layoutId(b.districtIndex);
    if (id === 'little-tokyo-market' || called.has(id)) continue;
    called.add(id);
    const src = crowdSources.get(id);
    if (src) pushLoops(out, seen, src(blocks, query));
  }
  return out;
}

function pointOn(loop: Loop, u: number): { x: number; z: number; yaw: number } {
  let d = ((u % 1) + 1) % 1 * loop.len;
  for (let i = 0; i < loop.seg.length; i++) {
    const L = loop.seg[i];
    if (d <= L || i === loop.seg.length - 1) {
      const t = L > 0 ? Math.min(1, d / L) : 0;
      const a = loop.pts[i], b = loop.pts[(i + 1) % loop.pts.length];
      const tx = b[0] - a[0], tz = b[1] - a[1];
      return { x: a[0] + tx * t, z: a[1] + tz * t, yaw: Math.atan2(tx, tz) };
    }
    d -= L;
  }
  const a = loop.pts[0];
  return { x: a[0], z: a[1], yaw: 0 };
}

let sharedMat: MeshBasicNodeMaterial | null = null;

export class CrowdField {
  readonly mesh: InstancedMesh;
  count = 0;
  private agents: Agent[] = [];
  private loops: Loop[] = [];
  private loopKey = '';
  private coatAttr: InstancedBufferAttribute;
  private canopyAttr: InstancedBufferAttribute;
  private agentAttr: InstancedBufferAttribute;
  private originAttr: InstancedBufferAttribute;

  constructor() {
    const geo = personGeometry();
    if (!sharedMat) sharedMat = crowdMaterial();
    this.mesh = new InstancedMesh(geo, sharedMat, MAX);
    this.mesh.name = 'crowd';
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.coatAttr = new InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.canopyAttr = new InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.agentAttr = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.originAttr = new InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    geo.setAttribute('iCoat', this.coatAttr);
    geo.setAttribute('iCanopy', this.canopyAttr);
    geo.setAttribute('iAgent', this.agentAttr);
    geo.setAttribute('iOrigin', this.originAttr);
    geo.userData.sharedGeometry = true;
  }

  update(dt: number, x: number, z: number, query: CityQuery, quality: QualitySettings, rain: number): void {
    const district = query.district(x, z);
    const share = district.id === 'little-tokyo-market' ? 1
      : district.id === 'dtla' || district.id === 'financial-megatowers' ? 0.4
        : district.id === 'civic-center' ? 0.22
          : district.id === 'historic-core' ? 0.72
            : district.id === 'k-megablock' ? 0.32
              : district.id === 'lakewood-megablocks' ? 0.12
                : district.id === 'south-la-megablocks' ? 0.2
                  : district.id === 'arts-district' ? 0.06
                    : district.id === 'westside' ? 0.14
                      : district.id === 'basin-sprawl' ? 0.07
                        : district.id === 'southeast-industrial' ? 0.04
                          : district.id === 'hollywood' ? 0.22
                            : district.id === 'south-bay-refineries' ? 0.03
                              : district.id === 'harbor' ? 0.02
                                : 0;
    const want = Math.round(quality.crowd * share);
    const radius = quality.crowdRadius;
    if (want <= 0) {
      this.count = 0;
      this.mesh.count = 0;
      return;
    }
    const blocks = query.cachedBlocks(x, z, radius);
    const key = `${blocks.length}:${blocks[0]?.seed ?? 0}:${blocks[blocks.length - 1]?.seed ?? 0}:${Math.round(x / 20)}:${Math.round(z / 20)}`;
    if (key !== this.loopKey) {
      this.loopKey = key;
      this.loops = loopsFrom(blocks, query);
      this.retarget(want, rain);
    }
    const loops = this.loops;
    if (!loops.length) {
      this.count = 0;
      this.mesh.count = 0;
      return;
    }
    const n = Math.min(this.agents.length, want, MAX);
    for (let i = 0; i < n; i++) {
      const a = this.agents[i];
      if (a.vendor) continue;
      const loop = loops[a.loop % loops.length];
      a.u = (a.u + (a.speed * dt) / loop.len) % 1;
    }
    this.avoid(n);
    const umbrella = rain > 0.25 ? 1 : 0;
    const coat = this.coatAttr.array as Float32Array;
    const canopy = this.canopyAttr.array as Float32Array;
    const agent = this.agentAttr.array as Float32Array;
    const origin = this.originAttr.array as Float32Array;
    const spots = marketSpots(query.layout);
    let vendorSlot = 0;
    const vendors = [spots.noodle?.cook, spots.bibi?.cook].filter((v): v is NonNullable<typeof v> => !!v);
    for (let i = 0; i < n; i++) {
      const a = this.agents[i];
      if (a.vendor && vendors.length) {
        const v = vendors[vendorSlot % vendors.length];
        vendorSlot++;
        if (Math.hypot(v.x - x, v.z - z) < radius) {
          a.x = v.x; a.z = v.z; a.yaw = v.yaw;
        } else {
          a.x = 1e6; a.z = 1e6;
        }
      } else if (a.vendor) {
        // No cook list in this district. Leave the slot off the origin so it does not stand in the sea.
        a.x = 1e6; a.z = 1e6;
      } else if (!a.vendor) {
        const p = pointOn(loops[a.loop % loops.length], a.u);
        a.x = p.x; a.z = p.z; a.yaw = p.yaw;
      }
      const gy = query.groundHeight(a.x, a.z);
      _p.set(a.x, gy, a.z);
      _q.setFromAxisAngle(_up, a.yaw);
      coat.set(a.coat, i * 3);
      canopy.set(a.canopy, i * 3);
      const moving = a.vendor ? 0.12 : Math.min(1, a.speed / 1.15);
      const hasUmbrella = !a.vendor && umbrella > 0 && i % 5 !== 0 ? 1 : 0;
      // Keep a body out of the lens. The cook stays if the camera has stepped back from the counter.
      const hidden = a.x > 1e5 || (!a.vendor && Math.hypot(a.x - x, a.z - z) < 1.05);
      _s.set(hidden ? 0 : 1, hidden ? 0 : 1, hidden ? 0 : 1);
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      _s.set(1, 1, 1);
      agent.set([a.phase, moving, hasUmbrella, a.yaw], i * 4);
      origin.set([a.x, gy, a.z], i * 3);
    }
    this.mesh.count = n;
    this.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.coatAttr.needsUpdate = true;
    this.canopyAttr.needsUpdate = true;
    this.agentAttr.needsUpdate = true;
    this.originAttr.needsUpdate = true;
  }

  private retarget(want: number, rain: number): void {
    const loops = this.loops;
    const n = Math.min(want, MAX);
    const umbrellaOn = rain > 0.25;
    while (this.agents.length < n) {
      const i = this.agents.length;
      const vendor = i < 2;
      this.agents.push({
        loop: i % Math.max(1, loops.length),
        u: (i * 0.137) % 1,
        speed: 0.85 + (i % 7) * 0.08,
        base: 0.85 + (i % 7) * 0.08,
        phase: (i % 16) / 16,
        umbrella: umbrellaOn && i % 5 !== 0 ? 1 : umbrellaOn ? 0.0 : 0,
        coat: COATS[i % COATS.length],
        canopy: CANOPY[i % CANOPY.length],
        vendor,
        x: 0, z: 0, yaw: 0,
      });
    }
    for (let i = 0; i < n; i++) {
      const a = this.agents[i];
      a.loop = loops.length ? i % loops.length : 0;
      if (!umbrellaOn) a.umbrella = 0;
      else if (a.umbrella === 0 && i % 5 !== 0) a.umbrella = 1;
    }
  }

  private avoid(n: number): void {
    const by = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const a = this.agents[i];
      if (a.vendor) continue;
      const id = a.loop % Math.max(1, this.loops.length);
      let arr = by.get(id);
      if (!arr) by.set(id, (arr = []));
      arr.push(i);
    }
    for (const [id, ids] of by) {
      const loop = this.loops[id];
      if (!loop || ids.length < 2) {
        for (const i of ids) this.agents[i].speed = this.agents[i].base;
        continue;
      }
      ids.sort((a, b) => this.agents[a].u - this.agents[b].u);
      for (let k = 0; k < ids.length; k++) {
        const a = this.agents[ids[k]];
        const b = this.agents[ids[(k + 1) % ids.length]];
        let gap = b.u - a.u;
        if (gap < 0) gap += 1;
        const metres = gap * loop.len;
        a.speed = metres < 0.9 ? a.base * 0.28 : a.base;
      }
    }
  }
}
