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
import { integrate, killParticle, plumeLean, smokeRand, smokeWindScale, spawnEmitter, spawnParticle } from './sim';
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
/** Card opacity. Stack cards overlap into one column, so each stamp stays lighter. */
const KIND_ALPHA = [0.94, 0.9, 0.92, 0.78, 0.92, 0.72, 0.86, 0.48, 0.92];
/** How many aged cards one emitter may seed, so a still shows the plume and not the first puff. */
const SEED_CAP = [12, 10, 14, 12, 14, 36];

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
        const adv = smokeWindScale(e.kind) * 0.85;
        spawnParticle(this.pool, {
          x: e.x + Math.cos(ang) * (e.radius + age * e.spread) + wx * shear * age * adv,
          y: e.y + rise * (0.55 + smokeRand() * 0.5),
          z: e.z + Math.sin(ang) * (e.radius + age * e.spread) + wz * shear * age * adv,
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
    const grown = Math.min(1, Math.max(0.35, drive.age / 10));
    const gCount = Math.min(gCap, Math.max(10, Math.floor(gCap * grown)));
    for (let n = 0; n < gCount; n++) {
      const puff = groundPuff(drive, camX, camZ, grown);
      const size1 = (tier === 'low' ? 14 : tier === 'medium' ? 20 : 26) + puff.ring * 0.14;
      spawnParticle(this.pool, {
        x: puff.x,
        y: puff.y,
        z: puff.z,
        vx: Math.cos(puff.ang) * (1.4 + grown),
        vy: 0.6,
        vz: Math.sin(puff.ang) * (1.4 + grown),
        life: 140,
        age: smokeRand() * 8,
        size0: size1,
        size1,
        kind: KIND.ground,
        heat: Math.exp(-puff.ring / 48) * Math.exp(-Math.max(0, puff.y - drive.y - 8) / 40),
        fade: 4500,
        aspect: 0.7,
        floorY: drive.y,
        slot: 1,
        slotCap: gCap,
      });
    }
    const len = Math.max(80, drive.headY - drive.y);
    const span = Math.min(len * 0.94, 1500);
    for (let n = 0; n < cCap; n++) {
      const along = 28 + (n + smokeRand() * 0.85) / cCap * (span - 28);
      const ang = smokeRand() * Math.PI * 2;
      const t = Math.max(0, Math.min(1, along / len));
      const rad = 5 + smokeRand() * 7;
      const lean = plumeLean(along, len, wind.speed);
      const size = (tier === 'low' ? 12 : tier === 'medium' ? 16 : 18) + t * (tier === 'low' ? 8 : 16) + smokeRand() * 8;
      spawnParticle(this.pool, {
        x: drive.x + Math.cos(wind.dir) * lean + Math.cos(ang) * rad,
        y: drive.y + along,
        z: drive.z + Math.sin(wind.dir) * lean + Math.sin(ang) * rad,
        vx: Math.cos(ang) * 0.4,
        vy: 0.8,
        vz: Math.sin(ang) * 0.4,
        life: 48,
        age: smokeRand() * 6,
        size0: size,
        size1: size,
        kind: KIND.column,
        heat: Math.max(0.2, (1 - t) * 0.5) + Math.exp(-rad / 7) * 0.7,
        fade: 5200,
        aspect: 1.55,
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
    if (drive.age < 28 && this.pool.slotN[1] < gCap) {
      this.groundAcc += (tier === 'low' ? 4 : 8) * dt;
      const grown = Math.min(1, drive.age / 10);
      while (this.groundAcc >= 1 && this.pool.slotN[1] < gCap) {
        const puff = groundPuff(drive, camX, camZ, grown);
        const size1 = (tier === 'low' ? 10 : 16) + puff.ring * 0.1;
        const ok = spawnParticle(this.pool, {
          x: puff.x,
          y: puff.y,
          z: puff.z,
          vx: Math.cos(puff.ang) * 1.6,
          vy: 0.7,
          vz: Math.sin(puff.ang) * 1.6,
          life: 120,
          age: 0,
          size0: size1 * 0.7,
          size1,
          kind: KIND.ground,
          heat: Math.exp(-puff.ring / 48),
          fade: 4500,
          aspect: 0.7,
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
    this.columnAcc += (tier === 'ultra' ? 6 : tier === 'high' ? 4.5 : tier === 'medium' ? 2.4 : 1.4) * dt;
    const len = Math.max(80, drive.headY - drive.y);
    while (this.columnAcc >= 1 && this.pool.slotN[2] < cCap) {
      const along = 4 + smokeRand() * Math.min(len, 220);
      const ang = smokeRand() * Math.PI * 2;
      const t = Math.max(0, Math.min(1, along / len));
      const rad = 4 + smokeRand() * 7;
      const lean = plumeLean(along, len, wind.speed);
      const size = (tier === 'low' ? 12 : 18) + t * 10;
      const ok = spawnParticle(this.pool, {
        x: drive.x + Math.cos(wind.dir) * lean + Math.cos(ang) * rad,
        y: drive.y + along,
        z: drive.z + Math.sin(wind.dir) * lean + Math.sin(ang) * rad,
        vx: Math.cos(ang) * 0.35,
        vy: 1.4,
        vz: Math.sin(ang) * 0.35,
        life: 36,
        age: 0,
        size0: size * 0.65,
        size1: size,
        kind: KIND.column,
        heat: Math.max(0.15, 0.8 * (1 - t)),
        fade: 5200,
        aspect: 1.55,
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
    let forced = 0;
    for (const t of tails) {
      const ground = frame.query.groundHeight(t.x, t.z);
      if (t.heavy === 2 && t.y < ground + 14) continue;
      const dx = t.x - frame.camX;
      const dz = t.z - frame.camZ;
      const ahead = dx * Math.sin(frame.heading) + dz * -Math.cos(frame.heading);
      if (ahead < 8 || dx * dx + dz * dz < 64) continue;
      const rate = (1.1 + t.drive * (t.heavy === 2 ? 2.2 : 4.2)) * scale;
      const exhaustCap = Math.max(4, Math.floor(cap * (KIND_SHARE[KIND.exhaust] ?? 0.1)));
      if ((this.pool.kindN[KIND.exhaust] ?? 0) >= exhaustCap) break;
      const must = forced < 1 && t.heavy !== 2 && smokeRand() < dt * 8;
      if (must) forced += 1;
      if (!must && smokeRand() > rate * dt) continue;
      const spin = t.heavy === 2;
      const truck = t.heavy === 1;
      const wakeX = (t.wx ?? Math.cos(wind.dir) * wind.speed * 0.15) * 0.72;
      const wakeZ = (t.wz ?? Math.sin(wind.dir) * wind.speed * 0.15) * 0.72;
      spawnParticle(this.pool, {
        x: t.x, y: t.y, z: t.z,
        vx: wakeX,
        vy: spin ? 0.4 : 0.35,
        vz: wakeZ,
        life: spin ? 2.4 : truck ? 1.5 : 1.2,
        age: 0,
        size0: spin ? 0.4 : truck ? 0.22 : 0.14,
        size1: spin ? 1.2 : truck ? 0.7 : 0.48,
        kind: KIND.exhaust,
        heat: truck ? 0.08 : 0.02,
        fade: spin ? 90 : 55,
        aspect: spin ? 0.7 : 0.55,
        floorY: spin ? t.y - 2 : ground,
        slot: 0,
        slotCap: cap,
      });
      if (!must) continue;
      const sp = Math.hypot(wakeX, wakeZ) || 1;
      const bx = -wakeX / sp;
      const bz = -wakeZ / sp;
      for (const back of [0.7, 1.6, 2.8, 4.2]) {
        spawnParticle(this.pool, {
          x: t.x + bx * back, y: t.y + 0.08 + back * 0.04, z: t.z + bz * back,
          vx: wakeX * 0.92, vy: 0.22, vz: wakeZ * 0.92,
          life: truck ? 1.4 : 1.1,
          age: back * 0.28,
          size0: (truck ? 0.24 : 0.14) + back * 0.04,
          size1: (truck ? 0.7 : 0.42) + back * 0.08,
          kind: KIND.exhaust,
          heat: 0.02,
          fade: 55,
          aspect: 0.5,
          floorY: ground,
          slot: 0,
          slotCap: cap,
        });
      }
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
      let px = pool.x[i]!;
      let py = pool.y[i]!;
      let pz = pool.z[i]!;
      let baseA = KIND_ALPHA[kind] ?? 0.5;
      const d = Math.sqrt(dist[i]!);
      if (kind === KIND.exhaust && d < 7) baseA *= Math.max(0.12, (d - 2.5) / 4.5);
      if ((kind === KIND.stall || kind === KIND.vent) && d < 2.4) baseA *= Math.max(0, (d - 0.7) / 1.7);
      if (kind === KIND.manhole && d < 4) baseA *= Math.max(0, (d - 1.6) / 2.4);
      // Draw the sheath a few metres toward the camera so it sits in front of
      // the gantry and over the ribbon. The offset is along the view ray, so
      // the column stays on the flame in screen space.
      if (kind === KIND.column && d > 30) {
        const pull = 48 / d;
        px += (camX - px) * pull;
        py += (camY - py) * pull;
        pz += (camZ - pz) * pull;
      }
      let heat = pool.heat[i]!;
      if (kind === KIND.barrel || kind === KIND.stack) heat *= Math.max(0, 1 - u * 1.2);
      const alpha = fadeIn * fadeOut * baseA;
      // A fat fade against the street deletes a knee-high wisp whose card meets the asphalt.
      let soft = Math.max(0.12, Math.min(4.5, size * 0.08));
      if (kind === KIND.manhole || kind === KIND.exhaust || kind === KIND.vent) {
        soft = Math.max(0.04, Math.min(0.4, size * 0.035));
      }
      for (let k = 0; k < 4; k++) {
        const v = (s * 4 + k) * 4;
        ca[v] = px;
        ca[v + 1] = py;
        ca[v + 2] = pz;
        ca[v + 3] = size;
        ma[v] = u;
        ma[v + 1] = pool.kind[i]!;
        ma[v + 2] = pool.seed[i]!;
        ma[v + 3] = alpha;
        xa[v] = heat;
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
    const colH = Math.min(1100, Math.max(80, drive.headY - drive.y));
    const height = colH;
    const halfW = 42;
    const wx = Math.cos(drive.windDir) * drive.wind;
    const wz = Math.sin(drive.windDir) * drive.wind;
    const midLean = plumeLean(height * 0.45, height, drive.wind);
    const cx = drive.x + Math.cos(drive.windDir) * midLean;
    const cy = drive.y + height * 0.5;
    const cz = drive.z + Math.sin(drive.windDir) * midLean;
    this.volume.position.set(cx, cy, cz);
    this.volume.scale.set(halfW * 2, height, halfW * 2);
    this.volume.visible = true;
    volBase.value.set(cx, cy, cz);
    volHalf.value.set(halfW, height * 0.5, halfW);
    volWind.value.set(wx, 0, wz);
    volEngine.value.set(drive.x, drive.y + 10, drive.z);
    volHeight.value = colH;
    volGroundR.value = 58;
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
      lights.push({ preset: 'flare', x: b.x, y: b.y + 0.4, z: b.z, candela: 420, range: 3.5 });
    }
    punctual = lights;
  }
}

/** Ground billow around the pad, kept off the lens. */
function groundPuff(
  drive: LaunchDrive, camX: number, camZ: number, grown: number,
): { x: number; y: number; z: number; ring: number; ang: number } {
  const away = Math.atan2(drive.z - camZ, drive.x - camX);
  const foot = smokeRand() < 0.38;
  const near = !foot && smokeRand() < 0.55;
  let ring = foot ? 4 + smokeRand() * 16 : near ? 12 + smokeRand() * 22 : 20 + grown * 46 * Math.pow(smokeRand(), 0.7);
  let ang = foot || near ? smokeRand() * Math.PI * 2 : away + (smokeRand() - 0.5) * Math.PI * 1.2;
  let x = drive.x + Math.cos(ang) * ring;
  let z = drive.z + Math.sin(ang) * ring;
  if (Math.hypot(x - camX, z - camZ) < 36) {
    ang = away + (smokeRand() - 0.5) * 1.1;
    ring = Math.max(36, ring);
    x = drive.x + Math.cos(ang) * ring;
    z = drive.z + Math.sin(ang) * ring;
  }
  const y = drive.y + (foot ? 2 + smokeRand() * 14 : near ? 4 + smokeRand() * 18 : 6 + smokeRand() * 26);
  return { x, y, z, ring, ang };
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
