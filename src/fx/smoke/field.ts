// One instanced draw. The buffer is this tier's cap, so a phone does not allocate the ultra count.
import {
  DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, PlaneGeometry, Vector3,
  type Scene, type Camera,
} from 'three/webgpu';
import type { CityLayout } from '../../world/layout';
import type { Tier } from '../../core/quality';
import { resources } from '../../core/memory';
import { visualSeed } from '../../core/rng';
import { steamCardGain } from '../../districts/_shared/kit/materials';
import { readLaunchPlume } from './bridge';
import { smokeDetail, smokeMaterial } from './material';
import { launchStretchAxis, SmokePool, type Wind } from './sim';
import { PUFF_CAP, PUFF_DETAIL, PUFF_SCALE, aliveBudget } from './tiers';
import { KIND_NAME, type Mouth, type Puff, type SmokeSnapshot } from './types';
import {
  exhaustPose, gatherMouths, stallPose, streetSteamPose, type SmokePose, type Tailpipe,
} from './anchors';

const TINT: Record<(typeof KIND_NAME)[number], [number, number, number]> = {
  launch: [0.62, 0.58, 0.52],
  ground: [0.32, 0.3, 0.28],
  stack: [0.16, 0.15, 0.14],
  vent: [0.7, 0.73, 0.76],
  grate: [0.74, 0.76, 0.8],
  stall: [0.84, 0.78, 0.68],
  exhaust: [0.32, 0.33, 0.35],
};

/** How much practical light this kind takes. Exhaust stays a grey trail. */
function lampOf(kind: number): number {
  if (kind === 6) return 0.18;
  if (kind === 0 || kind === 1) return 0.1;
  if (kind === 2) return 0.9;
  return 0.62;
}

const WARM_FRAMES = 14;

export class SmokeField {
  readonly root: Group;
  private mesh!: InstancedMesh;
  private pool: SmokePool;
  private puff!: InstancedBufferAttribute;
  private shade!: InstancedBufferAttribute;
  private tint!: InstancedBufferAttribute;
  private move!: InstancedBufferAttribute;
  private geo!: PlaneGeometry;
  private order: number[] = [];
  private mouths: Mouth[] = [];
  private kindAcc = [0, 0, 0, 0, 0, 0, 0];
  private cursor = [0, 0, 0, 0, 0, 0, 0];
  private tails: Tailpipe[] = [];
  private tier: Tier;
  private cap = 0;
  private warmLeft = WARM_FRAMES;
  private gatherAt = -1;
  private lastX = 0;
  private lastZ = 0;
  private hasCam = false;
  private windDir = 0;
  private readonly plumeUp = { x: 0, y: 1, z: 0 };
  private readonly camDir = new Vector3();
  private readonly forward = { x: 0, y: 0, z: -1 };

  constructor(scene: Scene, tier: Tier) {
    this.tier = tier;
    const seed = visualSeed('smoke-puffs') ?? 0x51e0;
    this.pool = new SmokePool(seed);
    this.root = new Group();
    this.root.name = 'smoke';
    scene.add(this.root);
    this.mountMesh(PUFF_CAP[tier]);
    steamCardGain.value = 0;
    smokeDetail.value = PUFF_DETAIL[tier];
  }

  setTier(tier: Tier): void {
    smokeDetail.value = PUFF_DETAIL[tier];
    if (tier === this.tier) return;
    this.tier = tier;
    if (PUFF_CAP[tier] !== this.cap) this.mountMesh(PUFF_CAP[tier]);
    this.pool.clear();
    this.kindAcc.fill(0);
    this.warmLeft = WARM_FRAMES;
    steamCardGain.value = 0;
  }

  dispose(): void {
    this.root.removeFromParent();
    if (this.geo) resources.release(this.geo);
    this.pool.clear();
    steamCardGain.value = 1;
  }

  pose(kind: 'stall' | 'exhaust' | 'street', layout: CityLayout): SmokePose | null {
    if (kind === 'stall') return stallPose(layout);
    if (kind === 'street') return streetSteamPose(layout);
    return exhaustPose(layout, this.tails);
  }

  update(
    dt: number,
    camera: Camera,
    layout: CityLayout,
    tier: Tier,
    windDir: number,
    windSpeed: number,
    rain: number,
    tails: readonly Tailpipe[],
  ): void {
    if (tier !== this.tier) this.setTier(tier);
    this.tails = tails as Tailpipe[];
    const cam = camera.position;
    const jumped = this.hasCam && Math.hypot(cam.x - this.lastX, cam.z - this.lastZ) > 80;
    this.hasCam = true;
    if (jumped) {
      this.pool.clear();
      this.kindAcc.fill(0);
      this.warmLeft = WARM_FRAMES;
      this.gatherAt = -1;
    }
    this.lastX = cam.x;
    this.lastZ = cam.z;
    const now = performance.now();
    if (this.gatherAt < 0 || now - this.gatherAt > 400 || jumped) {
      this.mouths = gatherMouths(layout, cam.x, cam.y, cam.z, this.tier, tails);
      this.gatherAt = now;
    }
    const wind: Wind = { dir: windDir, speed: windSpeed, rain };
    this.windDir = windDir;
    const sub = this.warmLeft > 0 ? 16 : 1;
    const stepDt = this.warmLeft > 0 ? 1 / 30 : Math.min(Math.max(dt, 0), 0.05);
    const plume = readLaunchPlume();
    camera.getWorldDirection(this.camDir);
    this.forward.x = this.camDir.x;
    this.forward.y = this.camDir.y;
    this.forward.z = this.camDir.z;
    const axis = launchStretchAxis(cam);
    this.plumeUp.x = axis.x;
    this.plumeUp.y = axis.y;
    this.plumeUp.z = axis.z;
    if (stepDt > 0) {
      for (let i = 0; i < sub; i++) {
        this.spawn(stepDt, cam, this.forward);
        this.pool.step(stepDt, wind, plume, cam, this.forward);
      }
    }
    if (this.warmLeft > 0) this.warmLeft--;
    this.upload(cam.x, cam.y, cam.z);
  }

  private mountMesh(cap: number): void {
    this.puff = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.shade = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.tint = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.move = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.puff.setUsage(DynamicDrawUsage);
    this.shade.setUsage(DynamicDrawUsage);
    this.tint.setUsage(DynamicDrawUsage);
    this.move.setUsage(DynamicDrawUsage);
    const puff = this.puff;
    const shade = this.shade;
    const tint = this.tint;
    const move = this.move;
    if (this.geo) resources.release(this.geo);
    this.geo = resources.geometry(() => {
      const g = new PlaneGeometry(1, 1);
      g.setAttribute('iPuff', puff);
      g.setAttribute('iShade', shade);
      g.setAttribute('iTint', tint);
      g.setAttribute('iMove', move);
      return g;
    }, { label: 'smoke-puffs', owner: 'smoke' });
    const prev = this.mesh;
    this.mesh = new InstancedMesh(this.geo, smokeMaterial(), cap);
    this.mesh.name = 'smoke-puffs';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    if (prev) prev.removeFromParent();
    this.root.add(this.mesh);
    this.cap = cap;
  }

  private pick(list: Mouth[], kind: number, wsum: number): Mouth {
    let t = (this.cursor[kind] ?? 0) + 1;
    if (t >= wsum) t = 0;
    this.cursor[kind] = t;
    let acc = 0;
    for (const m of list) {
      acc += m.weight;
      if (t < acc) return m;
    }
    return list[list.length - 1]!;
  }

  private spawn(dt: number, cam: { x: number; y: number; z: number }, fwd: { x: number; y: number; z: number }): void {
    const cap = this.cap;
    const scale = PUFF_SCALE[this.tier];
    const groups = new Map<number, Mouth[]>();
    for (const m of this.mouths) {
      const list = groups.get(m.kind);
      if (list) list.push(m);
      else groups.set(m.kind, [m]);
    }
    for (const [kind, list] of groups) {
      const name = KIND_NAME[kind];
      if (!name) continue;
      const budget = aliveBudget(this.tier, name);
      let wsum = 0;
      for (const m of list) wsum += m.weight;
      if (wsum <= 0) continue;
      const life = list[0]!.life;
      let a = (this.kindAcc[kind] ?? 0) + (budget / Math.max(0.4, life)) * dt;
      let guard = 0;
      while (a >= 1 && guard++ < 64) {
        const mouth = this.pick(list, kind, wsum);
        if (!this.pool.spawn(mouth, scale, cap, budget, cam, fwd)) {
          a = Math.min(a, 0.999);
          break;
        }
        a -= 1;
      }
      this.kindAcc[kind] = a;
    }
  }

  private upload(cx: number, cy: number, cz: number): void {
    const list = this.pool.live;
    const n = list.length;
    this.order.length = n;
    for (let i = 0; i < n; i++) this.order[i] = i;
    this.order.sort((a, b) => {
      const pa = list[a]!;
      const pb = list[b]!;
      const da = (pa.x - cx) ** 2 + (pa.y - cy) ** 2 + (pa.z - cz) ** 2;
      const db = (pb.x - cx) ** 2 + (pb.y - cy) ** 2 + (pb.z - cz) ** 2;
      return db - da;
    });
    const puff = this.puff.array as Float32Array;
    const shade = this.shade.array as Float32Array;
    const tint = this.tint.array as Float32Array;
    const move = this.move.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const p = list[this.order[i]!]!;
      const u = p.age / p.life;
      const fadeIn = Math.min(1, u / (p.kind === 5 ? 0.08 : 0.1));
      const tail = p.kind === 0 || p.kind === 2 ? 0.2 : 0.36;
      const fadeOut = Math.min(1, (1 - u) / tail);
      const dist = Math.hypot(p.x - cx, p.y - cy, p.z - cz);
      let size = p.size0 + (p.size1 - p.size0) * Math.min(1, u / 0.55);
      let lifeA = fadeIn * fadeOut * p.alpha;
      let heat = p.heat;
      if (p.kind === 0 || p.kind === 2) heat *= Math.max(0, 1 - u * 0.8);
      if (p.kind === 0) {
        const edge = Math.min(1, Math.abs(p.offS) / 46);
        lifeA *= 1.15 - edge * 0.28;
        size *= 0.88 + edge * 0.32;
        size = Math.min(size, Math.max(5, dist * 0.13));
        if (dist < 28) lifeA *= Math.min(1, Math.max(0, (dist - 10) / 18));
      } else if (p.kind === 1) {
        size = Math.min(size, Math.max(4, dist * 0.14));
      }
      const o = i * 4;
      puff[o] = p.x;
      puff[o + 1] = p.y;
      puff[o + 2] = p.z;
      puff[o + 3] = size;
      shade[o] = p.spin;
      const cell = Math.floor(p.seed * 7.999);
      shade[o + 1] = (cell + Math.min(0.999, lampOf(p.kind))) / 8;
      shade[o + 2] = heat;
      shade[o + 3] = lifeA;
      const name = KIND_NAME[p.kind]!;
      const rgb = TINT[name];
      tint[o] = rgb[0] * p.shade;
      tint[o + 1] = rgb[1] * p.shade;
      tint[o + 2] = rgb[2] * p.shade;
      tint[o + 3] = p.aspect;
      const stretch = this.stretchOf(p);
      move[o] = stretch.x;
      move[o + 1] = stretch.y;
      move[o + 2] = stretch.z;
      move[o + 3] = stretch.w;
    }
    this.puff.needsUpdate = true;
    this.shade.needsUpdate = true;
    this.tint.needsUpdate = true;
    this.move.needsUpdate = true;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
  }

  /** World axis the billboard stretches along, plus the stretch factor. */
  private stretchOf(p: Puff): { x: number; y: number; z: number; w: number } {
    const jitter = 0.82 + p.seed * 0.36;
    if (p.kind === 0) {
      return { x: this.plumeUp.x, y: this.plumeUp.y, z: this.plumeUp.z, w: 1.05 * jitter };
    }
    if (p.kind === 6) {
      const L = Math.hypot(p.vx, p.vz);
      if (L > 0.15) return { x: p.vx / L, y: 0.06, z: p.vz / L, w: 2.5 * jitter };
      return { x: 0, y: 1, z: 0, w: 1.2 };
    }
    if (p.kind === 2) {
      const wx = Math.cos(this.windDir) * 0.32;
      const wz = Math.sin(this.windDir) * 0.32;
      return { x: wx, y: 1, z: wz, w: 1.85 * jitter };
    }
    if (p.kind === 5) return { x: 0, y: 1, z: 0, w: 2.05 * jitter };
    return { x: 0, y: 1, z: 0, w: 1.65 * jitter };
  }

  snapshot(): SmokeSnapshot {
    const k = this.pool.kindN;
    return {
      alive: this.pool.live.length,
      mouths: this.mouths.length,
      launch: k[0] ?? 0,
      ground: k[1] ?? 0,
      stack: k[2] ?? 0,
      vent: k[3] ?? 0,
      grate: k[4] ?? 0,
      stall: k[5] ?? 0,
      exhaust: k[6] ?? 0,
      warm: this.warmLeft,
    };
  }
}
