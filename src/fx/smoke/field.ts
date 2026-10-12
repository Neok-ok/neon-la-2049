// One billboard draw for every street puff and the launch cards, plus the
// ray-marched plume on high and ultra. Buffers are the size of the tier
// that is showing.
import {
  BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, type Scene,
} from 'three/webgpu';
import type { Tier } from '../../core/quality';
import { resources } from '../../core/memory';
import { kitSteamGain } from '../../districts/_shared/kit/materials';
import type { PunctualInput } from '../../lighting/validate.ts';
import type { CityQuery } from '../../world/CityQuery';
import { smokeRain, smokeMaterial } from './material';
import { launchDrive, type LaunchDrive } from './launchDrive';
import { barrelLights, gatherEmitters } from './places';
import { integrate, killParticle, smokeRand, spawnEmitter, spawnParticle } from './sim';
import {
  LAUNCH_COLUMN_CAP, LAUNCH_GROUND_CAP, RATE_SCALE, SMOKE_CAP, streetCap,
} from './tiers';
import { KIND, createPool, type Emitter, type Pool, type Tailpipe, type Wind } from './types';
import {
  launchVolumeMesh, syncVolumeSteps, volBase, volDensity, volEngine, volGroundR,
  volHalf, volHeight, volWind, volumeActive,
} from './volume';

/** Share of the street budget. Indexed by KIND. Launch kinds stay on their own slots. */
const KIND_SHARE = [0.16, 0.12, 0.12, 0.1, 0.14, 0.22, 0.14];
/** Card opacity. Street steam stays translucent so wisps do not fuse into a bank. */
const KIND_ALPHA = [0.78, 0.68, 0.74, 0.72, 0.86, 0.7, 0.58, 0.52, 0.62];
/** How many aged cards one emitter may seed, so a grate is a wisp and a stack is a column. */
const SEED_CAP = [4, 4, 5, 6, 8, 18];

export interface SmokeFrame {
  dt: number;
  time: number;
  tier: Tier;
  camX: number;
  camY: number;
  camZ: number;
  wind: number;
  windDir: number;
  rain: number;
  /** Compass radians. Street steam uses it so a pot plume sits in the look direction. */
  heading: number;
  query: CityQuery;
  tails: readonly Tailpipe[];
}

export interface SmokeSnapshot {
  particles: number;
  emitters: number;
  draws: number;
  volume: boolean;
  launch: boolean;
  cap: number;
  street: number;
  ground: number;
  column: number;
  byKind: number[];
  near: Array<{ kind: number; dist: number; dy: number }>;
}

let punctual: PunctualInput[] = [];

export function smokePunctual(): PunctualInput[] {
  return punctual;
}

export class SmokeField {
  private pool: Pool = createPool(0);
  private geo: BufferGeometry | null = null;
  private readonly mesh: Mesh;
  private readonly volume: Mesh;
  private tier: Tier = 'low';
  private emitters: Emitter[] = [];
  private anchorX = 1e9;
  private anchorZ = 1e9;
  private gatherAt = -1e9;
  private launchId = 0;
  private lingered = false;
  private groundAcc = 0;
  private columnAcc = 0;
  private order: number[] = [];
  private dist: number[] = [];
  private camX = 0;
  private camY = 0;
  private camZ = 0;

  constructor(scene: Scene) {
    kitSteamGain.value = 0;
    const cap = SMOKE_CAP.low;
    this.tier = 'low';
    this.pool = createPool(cap);
    this.geo = resources.geometry(() => buildGeo(cap), { label: 'smoke-billboards', owner: 'smoke', evictable: true });
    this.mesh = new Mesh(this.geo, smokeMaterial(false));
    this.mesh.name = 'smoke-field';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
    this.volume = launchVolumeMesh();
    scene.add(this.mesh, this.volume);
  }

  conceal(): void {
    this.mesh.visible = false;
    this.volume.visible = false;
  }

  snapshot(): SmokeSnapshot {
    const drive = launchDrive();
    return {
      particles: this.pool.n,
      emitters: this.emitters.length,
      draws: (this.mesh.visible ? 1 : 0) + (this.volume.visible ? 1 : 0),
      volume: this.volume.visible,
      launch: drive.burning || (drive.id > 0 && drive.age < 180),
      cap: this.pool.cap,
      street: this.pool.slotN[0],
      ground: this.pool.slotN[1],
      column: this.pool.slotN[2],
      byKind: this.pool.kindN.slice(),
      near: this.nearest(),
    };
  }

  private nearest(): Array<{ kind: number; dist: number; dy: number }> {
    const pool = this.pool;
    const rows: Array<{ kind: number; dist: number; dy: number }> = [];
    for (let i = 0; i < pool.n; i++) {
      const dx = pool.x[i]! - this.camX;
      const dy = pool.y[i]! - this.camY;
      const dz = pool.z[i]! - this.camZ;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 40) continue;
      rows.push({ kind: pool.kind[i]!, dist: Math.round(dist * 10) / 10, dy: Math.round(dy * 10) / 10 });
    }
    rows.sort((a, b) => a.dist - b.dist);
    return rows.slice(0, 6);
  }

  update(frame: SmokeFrame): void {
    const dt = Math.min(0.08, Math.max(0, frame.dt));
    this.camX = frame.camX;
    this.camY = frame.camY;
    this.camZ = frame.camZ;
    this.ensure(frame.tier);
    smokeRain.value = frame.rain;
    const wind: Wind = { dir: frame.windDir, speed: frame.wind, rain: frame.rain };
    if (Math.hypot(frame.camX - this.anchorX, frame.camZ - this.anchorZ) > 26 || frame.time - this.gatherAt > 2.4) {
      this.emitters = gatherEmitters(
        frame.query.layout, frame.query, frame.camX, frame.camY, frame.camZ, frame.heading, frame.tier,
      );
      this.anchorX = frame.camX;
      this.anchorZ = frame.camZ;
      this.gatherAt = frame.time;
      this.seedEmitters(wind, frame.tier);
    }
    const drive = launchDrive();
    this.noteLaunch(drive, wind, frame.camX, frame.camZ);
    let left = dt;
    while (left > 1e-4) {
      const h = Math.min(0.034, left);
      const scale = RATE_SCALE[frame.tier];
      const cap = streetCap(frame.tier);
      for (const e of this.emitters) {
        const share = KIND_SHARE[e.kind] ?? 0.08;
        const kindCap = Math.max(3, Math.floor(cap * share));
        spawnEmitter(this.pool, e, cap, scale, wind, h, kindCap);
      }
      this.emitLaunch(h, drive, frame.tier, wind, frame.camX, frame.camZ);
      this.emitTails(h, frame, wind);
      integrate(this.pool, h, wind, frame.query, frame.time, frame.camX, frame.camZ);
      left -= h;
    }
    this.write(frame.camX, frame.camY, frame.camZ);
    this.placeVolume(drive, frame.tier);
    this.writeLights(drive, frame.camX, frame.camZ);
  }

  /** A still should show a plume, not the first puff leaving the grate. */
  private seedEmitters(wind: Wind, tier: Tier): void {
    const cap = streetCap(tier);
    const wx = Math.cos(wind.dir) * wind.speed;
    const wz = Math.sin(wind.dir) * wind.speed;
    const rainCut = 1 + wind.rain * 0.35;
    for (const e of this.emitters) {
      const share = KIND_SHARE[e.kind] ?? 0.08;
      const kindCap = Math.max(4, Math.floor(cap * share));
      const have = this.pool.kindN[e.kind] ?? 0;
      if (have >= kindCap * 0.55) continue;
      const ceiling = SEED_CAP[e.kind] ?? 4;
      const want = Math.min(kindCap - have, ceiling, Math.max(3, Math.round(e.rate * Math.min(e.life, 12) * 0.45)));
      for (let n = 0; n < want; n++) {
        const age = smokeRand() * Math.min(e.life * 0.82, e.life / rainCut * 0.9);
        const ang = smokeRand() * Math.PI * 2;
        const rise = e.rise * age;
        const shear = 1 + Math.min(2.1, rise / 60);
        spawnParticle(this.pool, {
          x: e.x + Math.cos(ang) * (e.radius + age * e.spread) + wx * shear * age * 0.28,
          y: e.y + rise * (0.55 + smokeRand() * 0.5),
          z: e.z + Math.sin(ang) * (e.radius + age * e.spread) + wz * shear * age * 0.28,
          vx: Math.cos(ang) * e.spread,
          vy: e.rise * 0.6,
          vz: Math.sin(ang) * e.spread,
          life: e.life * (0.85 + smokeRand() * 0.3),
          age,
          size0: e.size0,
          size1: e.size1,
          kind: e.kind,
          heat: e.heat * Math.max(0, 1 - age / Math.max(1.5, e.life * 0.45)),
          fade: e.fade,
          aspect: e.aspect,
          floorY: e.floorY,
          slot: 0,
          slotCap: cap,
        });
      }
    }
  }

  private ensure(tier: Tier): void {
    const cap = SMOKE_CAP[tier];
    const lit = tier !== 'low';
    this.mesh.material = smokeMaterial(lit);
    if (this.tier === tier && this.pool.cap === cap && this.geo) return;
    this.tier = tier;
    if (this.geo) resources.release(this.geo);
    this.pool = createPool(cap);
    this.geo = resources.geometry(() => buildGeo(cap), { label: 'smoke-billboards', owner: 'smoke', evictable: true });
    this.mesh.geometry = this.geo;
    this.order = [];
    this.dist = [];
    this.launchId = 0;
  }

  private noteLaunch(drive: LaunchDrive, wind: Wind, camX: number, camZ: number): void {
    if (drive.id <= 0) return;
    if (drive.id !== this.launchId) {
      this.launchId = drive.id;
      this.lingered = false;
      this.groundAcc = 0;
      this.columnAcc = 0;
      this.dropSlot(1);
      this.dropSlot(2);
      this.prefill(drive, wind, camX, camZ);
    }
    if (!drive.burning && !this.lingered && drive.age > 2) {
      this.lingered = true;
      for (let i = 0; i < this.pool.n; i++) {
        if (this.pool.slot[i] !== 2 && this.pool.slot[i] !== 1) continue;
        const extra = this.pool.slot[i] === 1 ? 90 : 70;
        this.pool.life[i] = this.pool.age[i]! + extra;
      }
    }
  }

  private dropSlot(slot: 1 | 2): void {
    for (let i = this.pool.n - 1; i >= 0; i--) {
      if (this.pool.slot[i] === slot) killParticle(this.pool, i);
    }
  }

  private prefill(drive: LaunchDrive, wind: Wind, camX: number, camZ: number): void {
    const tier = drive.tier;
    const gCap = LAUNCH_GROUND_CAP[tier];
    const cCap = LAUNCH_COLUMN_CAP[tier];
    const wx = Math.cos(wind.dir) * wind.speed;
    const wz = Math.sin(wind.dir) * wind.speed;
    const grown = Math.min(1, Math.max(0.15, drive.age / 12));
    const gCount = Math.min(gCap, Math.max(8, Math.floor(gCap * grown)));
    for (let n = 0; n < gCount; n++) {
      const age = smokeRand() * Math.min(Math.max(drive.age, 1), 80);
      const ang = smokeRand() * Math.PI * 2;
      const climb = smokeRand();
      const ring = climb < 0.45
        ? (6 + grown * 26) * Math.pow(smokeRand(), 0.9)
        : (4 + grown * 14) * Math.pow(smokeRand(), 1.1);
      const yLift = climb < 0.45 ? 5 + smokeRand() * 16 + age * 0.2 : 12 + smokeRand() * 28;
      const size1 = tier === 'low' ? 22 : tier === 'medium' ? 36 : 44;
      const heat = Math.exp(-ring / 46) * Math.exp(-Math.max(0, yLift - 10) / 55);
      spawnParticle(this.pool, {
        x: drive.x + Math.cos(ang) * ring + wx * age * 0.2,
        y: drive.y + yLift,
        z: drive.z + Math.sin(ang) * ring + wz * age * 0.2,
        vx: Math.cos(ang) * (2.2 + grown * 2),
        vy: 1.4,
        vz: Math.sin(ang) * (2.2 + grown * 2),
        life: 120 + smokeRand() * 40,
        age,
        size0: 12,
        size1,
        kind: KIND.ground,
        heat,
        fade: 4500,
        aspect: 0.72,
        floorY: drive.y,
        slot: 1,
        slotCap: gCap,
      });
    }
    const h = Math.min(280, Math.max(40, drive.headY - drive.y));
    const front = Math.atan2(camZ - drive.z, camX - drive.x);
    for (let n = 0; n < cCap; n++) {
      const along = smokeRand() * h;
      const nearSide = smokeRand() < 0.72;
      const ang = nearSide ? front + (smokeRand() - 0.5) * 1.7 : smokeRand() * Math.PI * 2;
      const rad = (nearSide ? 2.2 + smokeRand() * 4.2 : 5 + smokeRand() * 7) * (0.75 + along / Math.max(h, 1) * 0.45);
      const len = Math.max(24, drive.headY - drive.y);
      const lift = Math.max(0, Math.min(1, (along - 0.14 * len) / Math.max(1, 0.72 * len)));
      const lean = (10 + Math.min(12, wind.speed) * 1.4) * lift;
      const size1 = tier === 'low' ? 20 : tier === 'medium' ? 32 : 40;
      spawnParticle(this.pool, {
        x: drive.x + Math.cos(wind.dir) * lean + Math.cos(ang) * rad,
        y: drive.y + along,
        z: drive.z + Math.sin(wind.dir) * lean + Math.sin(ang) * rad,
        vx: Math.cos(ang) * 1.4,
        vy: 6 + smokeRand() * 5,
        vz: Math.sin(ang) * 1.4,
        life: 28 + smokeRand() * 12,
        age: smokeRand() * 2.5,
        size0: tier === 'low' ? 10 : 7,
        size1,
        kind: KIND.column,
        heat: Math.max(0.15, 1 - rad / 16) * (1 - along / Math.max(h, 1) * 0.55),
        fade: 5200,
        aspect: 1.35,
        floorY: drive.y,
        slot: 2,
        slotCap: cCap,
      });
    }
  }

  private emitLaunch(dt: number, drive: LaunchDrive, tier: Tier, wind: Wind, camX: number, camZ: number): void {
    if (!drive.burning || drive.id <= 0) return;
    const gCap = LAUNCH_GROUND_CAP[tier];
    const cCap = LAUNCH_COLUMN_CAP[tier];
    if (drive.age < 22 && this.pool.slotN[1] < gCap) {
      this.groundAcc += (tier === 'low' ? 4 : 10) * dt;
      const grown = Math.min(1, drive.age / 14);
      while (this.groundAcc >= 1 && this.pool.slotN[1] < gCap) {
        const ang = smokeRand() * Math.PI * 2;
        const ring = (6 + grown * 50) * Math.pow(smokeRand(), 0.85);
        const yLift = 6 + smokeRand() * 22;
        const ok = spawnParticle(this.pool, {
          x: drive.x + Math.cos(ang) * ring,
          y: drive.y + yLift,
          z: drive.z + Math.sin(ang) * ring,
          vx: Math.cos(ang) * (3 + grown * 4),
          vy: 1.6 + smokeRand(),
          vz: Math.sin(ang) * (3 + grown * 4),
          life: 110 + smokeRand() * 30,
          age: 0,
          size0: 10,
          size1: tier === 'low' ? 32 : 54,
          kind: KIND.ground,
          heat: Math.exp(-ring / 40) * Math.exp(-yLift / 50),
          fade: 4500,
          aspect: 0.68,
          floorY: drive.y,
          slot: 1,
          slotCap: gCap,
        });
        if (!ok) {
          this.groundAcc = Math.min(this.groundAcc, 2);
          break;
        }
        this.groundAcc -= 1;
      }
    }
    this.columnAcc += (tier === 'ultra' ? 8 : tier === 'high' ? 6 : tier === 'medium' ? 3.5 : 2) * dt;
    const h = Math.min(240, Math.max(20, drive.headY - drive.y));
    const wx = Math.cos(wind.dir) * wind.speed;
    const wz = Math.sin(wind.dir) * wind.speed;
    const front = Math.atan2(camZ - drive.z, camX - drive.x);
    while (this.columnAcc >= 1 && this.pool.slotN[2] < cCap) {
      const along = smokeRand() * h * 0.45;
      const nearSide = smokeRand() < 0.72;
      const ang = nearSide ? front + (smokeRand() - 0.5) * 1.7 : smokeRand() * Math.PI * 2;
      const rad = nearSide ? 2.4 + smokeRand() * 4 : 5 + smokeRand() * 6;
      const ok = spawnParticle(this.pool, {
        x: drive.x + Math.cos(ang) * rad + wx * 0.15,
        y: drive.y + 4 + along,
        z: drive.z + Math.sin(ang) * rad + wz * 0.15,
        vx: Math.cos(ang) * 1.4,
        vy: 8 + smokeRand() * 5,
        vz: Math.sin(ang) * 1.4,
        life: 24 + smokeRand() * 10,
        age: 0,
        size0: 7,
        size1: tier === 'low' ? 24 : 42,
        kind: KIND.column,
        heat: Math.max(0.25, 1 - rad / 12),
        fade: 5200,
        aspect: 1.25,
        floorY: drive.y,
        slot: 2,
        slotCap: cCap,
      });
      if (!ok) {
        this.columnAcc = Math.min(this.columnAcc, 2);
        break;
      }
      this.columnAcc -= 1;
    }
  }

  private emitTails(dt: number, frame: SmokeFrame, wind: Wind): void {
    const cap = streetCap(frame.tier);
    const scale = RATE_SCALE[frame.tier];
    const tails = frame.tails.slice().sort((a, b) => {
      const da = (a.x - frame.camX) ** 2 + (a.z - frame.camZ) ** 2;
      const db = (b.x - frame.camX) ** 2 + (b.z - frame.camZ) ** 2;
      return da - db;
    });
    for (const t of tails) {
      const ground = frame.query.groundHeight(t.x, t.z);
      if (t.heavy === 2 && t.y < ground + 14) continue;
      const rate = (1.1 + t.drive * (t.heavy === 2 ? 2.2 : 4.2)) * scale;
      const exhaustCap = Math.max(4, Math.floor(cap * (KIND_SHARE[KIND.exhaust] ?? 0.1)));
      if ((this.pool.kindN[KIND.exhaust] ?? 0) >= exhaustCap) break;
      if (smokeRand() > rate * dt) continue;
      const spin = t.heavy === 2;
      const truck = t.heavy === 1;
      const wakeX = t.wx ?? Math.cos(wind.dir) * wind.speed * 0.15;
      const wakeZ = t.wz ?? Math.sin(wind.dir) * wind.speed * 0.15;
      spawnParticle(this.pool, {
        x: t.x, y: t.y, z: t.z,
        vx: wakeX,
        vy: spin ? 0.35 : 0.55,
        vz: wakeZ,
        life: spin ? 3.2 : truck ? 2.4 : 1.8,
        age: 0,
        size0: spin ? 0.7 : truck ? 0.5 : 0.32,
        size1: spin ? 2.6 : truck ? 1.8 : 1.15,
        kind: KIND.exhaust,
        heat: truck ? 0.08 : 0.02,
        fade: spin ? 90 : 22,
        aspect: spin ? 0.85 : 1.55,
        floorY: spin ? t.y - 2 : ground,
        slot: 0,
        slotCap: cap,
      });
    }
  }

  private write(camX: number, camY: number, camZ: number): void {
    const geo = this.geo;
    if (!geo) return;
    const pool = this.pool;
    const n = pool.n;
    this.mesh.visible = n > 0;
    if (!n) {
      geo.setDrawRange(0, 0);
      return;
    }
    const order = this.order;
    const dist = this.dist;
    order.length = n;
    for (let i = 0; i < n; i++) {
      const dx = pool.x[i]! - camX;
      const dy = pool.y[i]! - camY;
      const dz = pool.z[i]! - camZ;
      dist[i] = dx * dx + dy * dy + dz * dz;
      order[i] = i;
    }
    order.sort((a, b) => dist[b]! - dist[a]!);
    const ctr = geo.getAttribute('sctr') as BufferAttribute;
    const meta = geo.getAttribute('smeta') as BufferAttribute;
    const extra = geo.getAttribute('sxtra') as BufferAttribute;
    const ca = ctr.array as Float32Array;
    const ma = meta.array as Float32Array;
    const xa = extra.array as Float32Array;
    for (let s = 0; s < n; s++) {
      const i = order[s]!;
      const life = Math.max(0.2, pool.life[i]!);
      const u = Math.min(1, pool.age[i]! / life);
      const size = pool.size0[i]! + (pool.size1[i]! - pool.size0[i]!) * Math.pow(u, 0.55);
      const fadeIn = Math.min(1, u / 0.06);
      const fadeOut = Math.min(1, (1 - u) / 0.28);
      const kind = pool.kind[i]!;
      let baseA = KIND_ALPHA[kind] ?? 0.5;
      if (kind === KIND.exhaust) {
        const d = Math.sqrt(dist[i]!);
        if (d < 7) baseA *= Math.max(0.12, (d - 2.5) / 4.5);
      }
      const alpha = fadeIn * fadeOut * baseA;
      // A fat fade against the street deletes a 1 m puff whose card touches the ground.
      const soft = Math.max(0.15, Math.min(4.5, size * 0.08));
      for (let k = 0; k < 4; k++) {
        const v = (s * 4 + k) * 4;
        ca[v] = pool.x[i]!;
        ca[v + 1] = pool.y[i]!;
        ca[v + 2] = pool.z[i]!;
        ca[v + 3] = size;
        ma[v] = u;
        ma[v + 1] = pool.kind[i]!;
        ma[v + 2] = pool.seed[i]!;
        ma[v + 3] = alpha;
        xa[v] = pool.heat[i]!;
        xa[v + 1] = pool.aspect[i]!;
        xa[v + 2] = soft;
        xa[v + 3] = pool.fade[i]!;
      }
    }
    geo.setDrawRange(0, n * 6);
    ctr.needsUpdate = true;
    meta.needsUpdate = true;
    extra.needsUpdate = true;
  }

  private placeVolume(drive: LaunchDrive, tier: Tier): void {
    const alive = drive.id > 0 && drive.age > 0.2 && drive.age < 200;
    if (!volumeActive(tier) || !alive) {
      this.volume.visible = false;
      volDensity.value = 0;
      return;
    }
    const grown = Math.min(1, drive.age / 14);
    const ring = 18 + grown * 130;
    const colH = Math.min(400, Math.max(50, drive.headY - drive.y));
    const height = Math.max(colH + 30, 90);
    const halfW = ring + 46;
    const wx = Math.cos(drive.windDir) * drive.wind;
    const wz = Math.sin(drive.windDir) * drive.wind;
    const lean = height * 0.08;
    const cx = drive.x + wx * lean * 0.35;
    const cy = drive.y + height * 0.5;
    const cz = drive.z + wz * lean * 0.35;
    this.volume.position.set(cx, cy, cz);
    this.volume.scale.set(halfW * 2, height, halfW * 2);
    this.volume.visible = true;
    volBase.value.set(cx, cy, cz);
    volHalf.value.set(halfW, height * 0.5, halfW);
    volWind.value.set(wx, 0, wz);
    volEngine.value.set(drive.x, drive.y + 10, drive.z);
    volHeight.value = colH;
    volGroundR.value = Math.min(180, ring + 20);
    const fade = drive.burning ? 1 : Math.max(0, 1 - Math.max(0, drive.age - 36) / 110);
    volDensity.value = fade;
    syncVolumeSteps(tier);
  }

  private writeLights(drive: LaunchDrive, camX: number, camZ: number): void {
    const lights: PunctualInput[] = [];
    if (drive.burning && drive.id > 0) {
      lights.push({ preset: 'flare', x: drive.x, y: drive.y + 7, z: drive.z, candela: 42000, range: 200 });
      const mid = Math.min(120, Math.max(18, (drive.headY - drive.y) * 0.22));
      lights.push({
        preset: 'flare',
        x: drive.x + Math.cos(drive.windDir) * mid * 0.12,
        y: drive.y + mid,
        z: drive.z + Math.sin(drive.windDir) * mid * 0.12,
        candela: 9000,
        range: 140,
      });
    }
    for (const b of barrelLights(this.emitters, camX, camZ, 3)) {
      lights.push({ preset: 'flare', x: b.x, y: b.y + 0.3, z: b.z, candela: 1100, range: 8 });
    }
    punctual = lights;
  }
}

function buildGeo(cap: number): BufferGeometry {
  const pos = new Float32Array(cap * 4 * 3);
  const ctr = new Float32Array(cap * 4 * 4);
  const meta = new Float32Array(cap * 4 * 4);
  const extra = new Float32Array(cap * 4 * 4);
  const corner = new Float32Array(cap * 4 * 2);
  const idx = new Uint16Array(cap * 6);
  const cs = [-1, -1, 1, -1, 1, 1, -1, 1];
  for (let i = 0; i < cap; i++) {
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      corner[v * 2] = cs[k * 2]!;
      corner[v * 2 + 1] = cs[k * 2 + 1]!;
    }
    const b = i * 6;
    const v0 = i * 4;
    idx[b] = v0;
    idx[b + 1] = v0 + 1;
    idx[b + 2] = v0 + 2;
    idx[b + 3] = v0;
    idx[b + 4] = v0 + 2;
    idx[b + 5] = v0 + 3;
  }
  const g = new BufferGeometry();
  const cA = new BufferAttribute(ctr, 4);
  const mA = new BufferAttribute(meta, 4);
  const xA = new BufferAttribute(extra, 4);
  cA.setUsage(DynamicDrawUsage);
  mA.setUsage(DynamicDrawUsage);
  xA.setUsage(DynamicDrawUsage);
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('sctr', cA);
  g.setAttribute('smeta', mA);
  g.setAttribute('sxtra', xA);
  g.setAttribute('scorner', new BufferAttribute(corner, 2));
  g.setIndex(new BufferAttribute(idx, 1));
  g.setDrawRange(0, 0);
  return g;
}
