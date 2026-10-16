// One instanced draw. The buffer is this tier's cap, so a phone does not allocate the ultra count.
import {
  DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Mesh, PlaneGeometry, Vector3,
  type Scene, type Camera,
} from 'three/webgpu';
import type { CityLayout } from '../../world/layout';
import type { Tier } from '../../core/quality';
import { resources } from '../../core/memory';
import { NITS } from '../../lighting/presets.ts';
import { visualSeed } from '../../core/rng';
import { buildKitMeshes, type KitInstance } from '../../districts/_shared/kit/batch';
import { steamCardGain } from '../../districts/_shared/kit/materials';
import { setLaunchColumnCover } from '../../districts/lax-spaceport/launch';
import { setFlareSmokeCover } from '../../districts/_shared/refinery/flames';
import { readLaunchPlume } from './bridge';
import { smokeDetail, smokeMaterial } from './material';
import { launchStretchAxis, SmokePool, type Wind } from './sim';
import { PUFF_CAP, PUFF_DETAIL, PUFF_SCALE, aliveBudget } from './tiers';
import { KIND_NAME, type Mouth, type Puff, type SmokeSnapshot } from './types';
import {
  exhaustPose, gatherMouths, launchPose, stallPose, streetSteamPose, type SmokePose, type Tailpipe,
} from './anchors';

const TINT: Record<(typeof KIND_NAME)[number], [number, number, number]> = {
  launch: [0.22, 0.21, 0.2],
  ground: [0.16, 0.15, 0.14],
  stack: [0.26, 0.25, 0.23],
  vent: [0.78, 0.8, 0.84],
  grate: [0.82, 0.84, 0.88],
  stall: [0.9, 0.92, 0.95],
  exhaust: [0.7, 0.72, 0.74],
};

/** How much practical light this kind takes. Exhaust stays a grey trail. */
function lampOf(kind: number): number {
  if (kind === 6) return 0.03;
  if (kind === 0 || kind === 1) return 0.06;
  if (kind === 2) return 0.42;
  if (kind === 4 || kind === 3) return 0.5;
  if (kind === 5) return 0.95;
  return 0.22;
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
  /** Capture holds a fixed step after the warm so a reframe still grows a trail. */
  private holdStep = false;
  private gatherAt = -1;
  private lastX = 0;
  private lastZ = 0;
  private hasCam = false;
  private windDir = 0;
  private potKey = '';
  private potMeshes: Mesh[] = [];
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
    setLaunchColumnCover(0);
    setFlareSmokeCover(0);
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
    this.clearPots();
    this.root.removeFromParent();
    if (this.geo) resources.release(this.geo);
    this.pool.clear();
    steamCardGain.value = 1;
    setLaunchColumnCover(1);
    setFlareSmokeCover(1);
  }

  seal(): void {
    this.warmLeft = 0;
    this.holdStep = true;
  }

  pose(kind: 'stall' | 'exhaust' | 'street' | 'launch', layout: CityLayout): SmokePose | null {
    if (kind === 'stall') return stallPose(layout);
    if (kind === 'street') return streetSteamPose(layout);
    if (kind === 'launch') return launchPose(layout);
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
    const moved = this.hasCam ? Math.hypot(cam.x - this.lastX, cam.z - this.lastZ) : 0;
    const jumped = moved > 120;
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
    if (this.gatherAt < 0 || now - this.gatherAt > 400 || moved > 5 || jumped) {
      this.mouths = gatherMouths(layout, cam.x, cam.y, cam.z, this.tier, tails);
      this.gatherAt = now;
    }
    const wind: Wind = { dir: windDir, speed: windSpeed, rain };
    this.windDir = windDir;
    const sub = this.warmLeft > 0 ? 16 : 1;
    const stepDt = this.warmLeft > 0 || this.holdStep ? 1 / 30 : Math.min(Math.max(dt, 0), 0.05);
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
    this.syncPots();
    this.upload(cam.x, cam.y, cam.z);
  }

  /** A closed pot on each stall mouth. The dressed cylinder is an open dark ring and does not read. */
  private syncPots(): void {
    const stalls = this.mouths.filter((m) => m.kind === 5);
    const key = stalls.map((s) => `${s.x.toFixed(2)}:${s.y.toFixed(2)}:${s.z.toFixed(2)}`).join('|');
    if (key === this.potKey) return;
    this.potKey = key;
    this.clearPots();
    if (!stalls.length) return;
    const items: KitInstance[] = [];
    // The street kit multiplies this by NITS.kit. Stay under the lamp-head shell.
    const rim = Math.min(12, NITS.lampHead) / NITS.kit;
    const belly = 4 / NITS.kit;
    for (const s of stalls) {
      items.push({
        template: 'drum',
        x: s.x, y: s.y - 0.16, z: s.z, yaw: 0,
        sx: 0.38, sy: 0.32, sz: 0.38,
        color: [0.42, 0.26, 0.16],
        emissive: [belly, belly * 0.3, belly * 0.08],
        metal: 0.78,
      });
      items.push({
        template: 'drum',
        x: s.x, y: s.y + 0.01, z: s.z, yaw: 0.5,
        sx: 0.46, sy: 0.045, sz: 0.46,
        color: [0.72, 0.4, 0.18],
        emissive: [rim, rim * 0.34, rim * 0.08],
        metal: 0.4,
      });
    }
    this.potMeshes = buildKitMeshes(items, 'smoke-pot');
    for (const mesh of this.potMeshes) this.root.add(mesh);
  }

  private clearPots(): void {
    for (const mesh of this.potMeshes) {
      mesh.removeFromParent();
      resources.release(mesh.geometry);
    }
    this.potMeshes = [];
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
      const fadeIn = Math.min(1, u / (p.kind === 0 ? 0.03 : p.kind === 5 ? 0.04 : p.kind === 4 || p.kind === 3 || p.kind === 6 ? 0.05 : 0.1));
      const tail = p.kind === 0 ? 0.06 : p.kind === 2 ? 0.2 : p.kind === 4 || p.kind === 3 || p.kind === 6 ? 0.14 : 0.36;
      const fadeOut = Math.min(1, (1 - u) / tail);
      const dist = Math.hypot(p.x - cx, p.y - cy, p.z - cz);
      let size = p.size0 + (p.size1 - p.size0) * Math.min(1, u / 0.55);
      let lifeA = fadeIn * fadeOut * p.alpha;
      let heat = p.heat;
      if (p.kind === 2) {
        const h = Math.min(1, Math.max(0, (p.y - p.floor) / 7));
        heat *= Math.max(0, 1 - h * h);
      }
      if (p.kind === 0) {
        const low = this.tier === 'low';
        const nozzle = Math.max(0, 1 - p.along / (low ? 0.085 : 0.05));
        heat = Math.max(heat, nozzle * 1.15);
        lifeA = Math.min(low ? 0.38 : 0.32, lifeA);
        size *= 0.94 + p.seed * 0.12;
        if (low && nozzle > 0.35) size *= 1.08;
        const puffCap = low ? 20 : this.tier === 'medium' ? 16 : 13;
        size = Math.min(size, puffCap);
        if (dist < 22) lifeA *= Math.min(1, Math.max(0, (dist - 8) / 14));
      } else if (p.kind === 2) {
        size *= 0.88 + p.seed * 0.28;
      } else if (p.kind === 6) {
        size *= 0.85 + p.along * 0.2;
        size = Math.min(size, this.tier === 'low' ? 0.32 : this.tier === 'medium' ? 0.26 : 0.22);
        lifeA = Math.min(0.62, lifeA) * Math.pow(1 - Math.min(1, p.along), 0.85);
        heat = 0;
      } else if (p.kind === 1) {
        size = Math.min(size, Math.max(2.5, dist * 0.06));
      }
      const o = i * 4;
      puff[o] = p.x;
      puff[o + 1] = p.y;
      puff[o + 2] = p.z;
      puff[o + 3] = size;
      shade[o] = p.spin;
      const cell = Math.floor(p.seed * 7.999);
      let lamp = lampOf(p.kind);
      if (p.kind === 4 || p.kind === 3) {
        const h = Math.min(1, Math.max(0, (p.y - p.floor) / 2.8));
        const belly = (1 - h) * (1 - h);
        lifeA *= 0.55 + belly * 0.4;
        lamp *= 0.4 + belly * 0.55;
        heat = 0;
      } else if (p.kind === 5) {
        const h = Math.min(1, Math.max(0, (p.y - p.floor) / 0.7));
        lifeA *= 1 - h * 0.88;
        heat = 0;
        lamp = 0.85;
      } else if (p.kind === 6) {
        lamp = 0.15 + Math.pow(1 - Math.min(1, p.along), 1.4) * 0.55;
      }
      shade[o + 1] = (cell + Math.min(0.999, lamp)) / 8;
      shade[o + 2] = heat;
      shade[o + 3] = lifeA;
      const name = KIND_NAME[p.kind]!;
      const rgb = TINT[name];
      let shadeK = p.shade;
      if (p.kind === 0) {
        const radial = Math.min(1, Math.hypot(p.offS, p.offD) / Math.max(4, p.turb));
        shadeK = Math.min(1.2, 0.48 + radial * 0.62 + p.seed * 0.12);
      } else if (p.kind === 2) {
        const mouth = Math.max(0, 1 - Math.max(0, p.y - p.floor) / 10);
        shadeK *= 0.22 + p.seed * 0.95 + mouth * 0.4;
      } else if (p.kind === 5) {
        shadeK *= 1.35;
      }
      let tr = rgb[0] * shadeK;
      let tg = rgb[1] * shadeK;
      let tb = rgb[2] * shadeK;
      if (p.kind === 4 || p.kind === 3) {
        // White-grey vapor. A little sodium at the mouth, where the street lamp
        // lights the column from below. Not a sign color, and not a flame core.
        const h = Math.min(1, Math.max(0, (p.y - p.floor) / 1.4));
        const wash = (1 - h) * (1 - h) * 0.16;
        tr = tr * (1 - wash) + 0.95 * wash;
        tg = tg * (1 - wash) + 0.58 * wash;
        tb = tb * (1 - wash) + 0.26 * wash;
      } else if (p.kind === 6) {
        // Tail lamps are red. The puff catches that only while it is still at the bumper.
        const tail = Math.pow(1 - Math.min(1, p.along), 1.7);
        const k = tail * 0.48;
        tr = tr * (1 - k) + 1.45 * k;
        tg = tg * (1 - k) + 0.08 * k;
        tb = tb * (1 - k) + 0.04 * k;
      } else if (p.kind === 5) {
        const near = Math.pow(1 - Math.min(1, p.along), 2);
        const k = near * 0.12;
        tr = tr * (1 - k) + 1.0 * k;
        tg = tg * (1 - k) + 0.72 * k;
        tb = tb * (1 - k) + 0.45 * k;
      }
      tint[o] = tr;
      tint[o + 1] = tg;
      tint[o + 2] = tb;
      // 0 backlit plume, 0.72 filled stack, 0.84 thin exhaust, 1 soft steam.
      tint[o + 3] = p.kind === 0 ? 0 : p.kind === 2 ? 0.72 : p.kind === 6 ? 0.84 : 1;
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
    const jitter = 0.94 + p.seed * 0.12;
    if (p.kind === 0) {
      return { x: this.plumeUp.x, y: this.plumeUp.y, z: this.plumeUp.z, w: (1.06 + p.along * 0.1) * jitter };
    }
    if (p.kind === 6) {
      const L = Math.hypot(p.vx, p.vz) || 1;
      // Along the bumper, not up. A vertical card was the chimney.
      return {
        x: -p.vx / L * 0.92,
        y: 0.18,
        z: -p.vz / L * 0.92,
        w: (1.7 + p.along * 0.35) * jitter,
      };
    }
    if (p.kind === 2) {
      const wx = Math.cos(this.windDir) * 0.55;
      const wz = Math.sin(this.windDir) * 0.55;
      const billow = 0.82 + p.seed * 0.36;
      return { x: wx, y: 1, z: wz, w: (1.15 + p.along * 0.7) * billow };
    }
    if (p.kind === 5) return { x: Math.sin(p.seed * 12) * 0.12, y: 1, z: Math.cos(p.seed * 9) * 0.12, w: 1.85 * (0.86 + p.seed * 0.28) };
    if (p.kind === 4 || p.kind === 3) {
      const h = Math.min(1, Math.max(0, (p.y - p.floor) / 3.05));
      const wx = Math.cos(this.windDir) * h * 0.7;
      const wz = Math.sin(this.windDir) * h * 0.7;
      return { x: wx, y: 1, z: wz, w: (1.04 + h * 0.38) * jitter };
    }
    return { x: 0, y: 1, z: 0, w: 1.2 * jitter };
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
