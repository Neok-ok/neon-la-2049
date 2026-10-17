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
import { billboardStretch, launchStretchAxis, SmokePool, type Wind } from './sim';
import { PUFF_CAP, PUFF_DETAIL, PUFF_SCALE, aliveBudget } from './tiers';
import { KIND_NAME, type Mouth, type SmokeSnapshot } from './types';
import {
  exhaustMouths, exhaustPose, gatherMouths, launchPose, stallPose, streetSteamPose, type SmokePose, type Tailpipe,
} from './anchors';

const TINT: Record<(typeof KIND_NAME)[number], [number, number, number]> = {
  launch: [0.52, 0.5, 0.46],
  ground: [0.16, 0.15, 0.14],
  stack: [0.26, 0.25, 0.23],
  vent: [0.78, 0.8, 0.84],
  grate: [0.82, 0.84, 0.88],
  stall: [0.9, 0.92, 0.95],
  exhaust: [0.9, 0.91, 0.93],
};

/** How much practical light this kind takes. Exhaust catches the street, not a lamp. */
function lampOf(kind: number): number {
  if (kind === 6) return 0.28;
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
  private exhaustX = 0;
  private exhaustZ = 0;
  private exhaustOn = false;
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

  /** Grow the plume again after a camera jump. Capture freezes dt, so warm is the only clock. */
  rewarm(): void {
    this.warmLeft = WARM_FRAMES;
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
    this.pool.launchFront = tier === 'low' ? 0.32 : 0.14;
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
    this.refreshExhaust(tails);
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

  /** Tailpipes move. Replace exhaust mouths every frame so the plume stays on the bumper. */
  private refreshExhaust(tails: readonly Tailpipe[]): void {
    let w = 0;
    for (let i = 0; i < this.mouths.length; i++) {
      if (this.mouths[i]!.kind !== 6) this.mouths[w++] = this.mouths[i]!;
    }
    this.mouths.length = w;
    const next = exhaustMouths(tails, this.tier);
    for (const m of next) this.mouths.push(m);
    const hero = next[0];
    if (hero) {
      const jump = this.exhaustOn && Math.hypot(hero.x - this.exhaustX, hero.z - this.exhaustZ) > 2.5;
      if (jump) {
        this.pool.dropKind(6);
        this.kindAcc[6] = 0;
        this.warmLeft = Math.max(this.warmLeft, WARM_FRAMES);
      }
      this.exhaustX = hero.x;
      this.exhaustZ = hero.z;
      this.exhaustOn = true;
    }
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
        const nozzle = Math.max(0, 1 - p.along / (low ? 0.07 : 0.05));
        heat = Math.max(heat, nozzle * 1.15);
        lifeA = Math.min(low ? 0.36 : 0.34, lifeA);
        size *= 0.86 + p.seed * 0.28;
        if (low && nozzle > 0.35) size *= 1.06;
        const puffCap = low ? 16 : this.tier === 'medium' ? 13 : this.tier === 'high' ? 11 : 10;
        size = Math.min(size, puffCap);
        // Medium and above were thin enough that the shaft opened into separate puffs.
        // Low keeps the fill that cleared.
        if (!low) size = Math.min(puffCap, size * (this.tier === 'medium' ? 1.14 : 1.18));
        // Far side of the shaft fades so the column has depth instead of a stack of discs.
        const axisD = Math.hypot(p.ox - cx, p.oz - cz);
        const puffD = Math.hypot(p.x - cx, p.z - cz);
        const depthT = Math.max(-1, Math.min(1, (puffD - axisD) / 12));
        lifeA *= Math.min(1, 0.58 + (1 - depthT) * 0.26);
        if (dist < 22) lifeA *= Math.min(1, Math.max(0, (dist - 8) / 14));
      } else if (p.kind === 2) {
        size *= 0.9 + p.seed * 0.2;
        if (this.tier === 'medium') size *= 1.08;
        else if (this.tier === 'low') size *= 1.08;
        else size *= 1.06;
      } else if (p.kind === 6) {
        // Small at the pipe, wider and much thinner as it rises. A 0.5 m cap
        // read as a chimney on a tailpipe.
        size *= (0.85 + p.seed * 0.22) * (0.78 + p.along * 0.55);
        size = Math.min(size, this.tier === 'low' ? 0.36 : this.tier === 'medium' ? 0.32 : 0.26);
        const away = Math.hypot(p.x - p.ox, p.z - p.oz);
        const lift = Math.max(0, p.y - p.floor);
        const trail = Math.pow(1 - Math.min(1, p.along), 0.55);
        const spread = 1 - Math.min(1, Math.max(0, away - 0.16) / 0.32);
        const roof = 1 - Math.min(1, Math.max(0, lift - 0.4) / 1.15);
        lifeA = Math.min(this.tier === 'low' ? 0.32 : 0.28, lifeA) * (0.48 + 0.52 * trail) * spread * roof;
        // A car down the block must not stamp discs onto the grate or the flare.
        if (dist > 10) lifeA *= Math.max(0, 1 - (dist - 10) / 8);
        heat = 0;
      } else if (p.kind === 5) {
        // Low is a short cloud on the lid. Medium and above stay a little smaller
        // so the wisp does not become a disc on the lit wall.
        size = Math.min(Math.max(size, 0.09), this.tier === 'low' ? 0.12 : 0.18);
        const away = Math.hypot(p.x - p.ox, p.z - p.oz);
        lifeA *= 1 - Math.min(1, Math.max(0, away - (this.tier === 'low' ? 0.2 : 0.28)) / 0.4);
        if (this.tier === 'low') lifeA = Math.min(0.58, lifeA * 0.92);
        else lifeA = Math.min(0.62, lifeA * 1.08);
      } else if (p.kind === 1) {
        size = Math.min(size, Math.max(2.5, dist * 0.06));
      }
      if (p.kind === 4 || p.kind === 3) {
        // High and ultra were leaving separate coins. Medium already reads as one column.
        // Low's clip was tight enough to split the same column into discs.
        if (this.tier === 'high' || this.tier === 'ultra') size *= 1.1;
        else if (this.tier === 'low') size *= 1.08;
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
        lifeA *= 0.68 + belly * 0.28;
        lamp *= 0.4 + belly * 0.55;
        heat = 0;
      } else if (p.kind === 5) {
        const h = Math.min(1, Math.max(0, (p.y - p.floor) / 0.62));
        lifeA *= (1 - h * 0.42);
        heat = 0;
        lamp = 0.9;
      } else if (p.kind === 6) {
        lamp = 0.32;
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
        shadeK *= 0.55 + p.seed * 0.4 + mouth * 0.22;
      } else if (p.kind === 5) {
        shadeK *= 1.2;
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
        const tail = Math.pow(Math.max(0, 1 - p.along / 0.18), 1.5);
        const k = tail * 0.14;
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
      // 0 plume, 0.50 stall, 0.53 exhaust, 0.72 stack, 1 grate and vent.
      tint[o + 3] = p.kind === 0 ? 0 : p.kind === 2 ? 0.72 : p.kind === 6 ? 0.53 : p.kind === 5 ? 0.5 : 1;
      const stretch = billboardStretch(p, this.windDir, this.plumeUp);
      move[o] = stretch.x;
      move[o + 1] = stretch.y;
      move[o + 2] = stretch.z;
      // Low exhaust stretched toward a ribbon, and the ribbon's sides were the
      // facets. The rise axis is unchanged.
      const lowStretch = p.kind === 6 ? 1.45 : p.kind === 5 ? 1.28 : stretch.w;
      move[o + 3] = this.tier === 'low' && (p.kind === 6 || p.kind === 5) ? Math.min(stretch.w, lowStretch) : stretch.w;
    }
    this.puff.needsUpdate = true;
    this.shade.needsUpdate = true;
    this.tint.needsUpdate = true;
    this.move.needsUpdate = true;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
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
