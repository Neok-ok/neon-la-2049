// Particle advection. Wind is the shared weather vector. Curl noise is the
// local roll. Rain damps loft, adds a sideways push, and shortens the visible life.
import type { CityQuery } from '../../world/CityQuery';
import { curl } from './curl';
import { KIND, type Emitter, type Pool, type Slot, type Wind } from './types';

let rng = 0x6d2b79f5;
let flip = 0;

export function smokeRand(): number {
  rng = Math.imul(rng ^ (rng >>> 15), 0x6d2b79f5);
  rng ^= rng + Math.imul(rng ^ (rng >>> 7), rng | 61);
  return ((rng ^ (rng >>> 14)) >>> 0) / 4294967296;
}

export function reseedSmoke(seed: number): void {
  rng = (seed >>> 0) || 1;
}

function copySlot(pool: Pool, from: number, to: number): void {
  pool.x[to] = pool.x[from]!;
  pool.y[to] = pool.y[from]!;
  pool.z[to] = pool.z[from]!;
  pool.vx[to] = pool.vx[from]!;
  pool.vy[to] = pool.vy[from]!;
  pool.vz[to] = pool.vz[from]!;
  pool.age[to] = pool.age[from]!;
  pool.life[to] = pool.life[from]!;
  pool.size0[to] = pool.size0[from]!;
  pool.size1[to] = pool.size1[from]!;
  pool.seed[to] = pool.seed[from]!;
  pool.kind[to] = pool.kind[from]!;
  pool.heat[to] = pool.heat[from]!;
  pool.fade[to] = pool.fade[from]!;
  pool.aspect[to] = pool.aspect[from]!;
  pool.floorY[to] = pool.floorY[from]!;
  pool.slot[to] = pool.slot[from]!;
}

export function killParticle(pool: Pool, i: number): void {
  if (i < 0 || i >= pool.n) return;
  const slot = pool.slot[i]! as Slot;
  const kind = pool.kind[i] ?? 0;
  pool.slotN[slot] = Math.max(0, pool.slotN[slot] - 1);
  pool.kindN[kind] = Math.max(0, (pool.kindN[kind] ?? 0) - 1);
  const last = pool.n - 1;
  if (i !== last) copySlot(pool, last, i);
  pool.n = last;
}

export interface SpawnOpt {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  age: number;
  size0: number;
  size1: number;
  kind: number;
  heat: number;
  fade: number;
  aspect: number;
  floorY: number;
  slot: Slot;
  slotCap: number;
}

export function spawnParticle(pool: Pool, o: SpawnOpt): boolean {
  if (pool.slotN[o.slot] >= o.slotCap || pool.n >= pool.cap) return false;
  const i = pool.n++;
  pool.slotN[o.slot] += 1;
  pool.x[i] = o.x;
  pool.y[i] = o.y;
  pool.z[i] = o.z;
  pool.vx[i] = o.vx;
  pool.vy[i] = o.vy;
  pool.vz[i] = o.vz;
  pool.age[i] = o.age;
  pool.life[i] = Math.max(0.4, o.life);
  pool.size0[i] = o.size0;
  pool.size1[i] = o.size1;
  pool.seed[i] = smokeRand();
  pool.kind[i] = o.kind;
  pool.heat[i] = o.heat;
  pool.fade[i] = o.fade;
  pool.aspect[i] = o.aspect;
  pool.floorY[i] = o.floorY;
  pool.slot[i] = o.slot;
  pool.kindN[o.kind] = (pool.kindN[o.kind] ?? 0) + 1;
  return true;
}

export function spawnEmitter(
  pool: Pool, e: Emitter, slotCap: number, rateScale: number, wind: Wind, dt: number, kindCap: number,
): void {
  e.acc += e.rate * rateScale * dt;
  let guard = 0;
  while (e.acc >= 1 && guard++ < 4) {
    if ((pool.kindN[e.kind] ?? 0) >= kindCap) {
      e.acc = Math.min(e.acc, 1);
      break;
    }
    const ang = smokeRand() * Math.PI * 2;
    const rad = Math.sqrt(smokeRand()) * e.radius;
    const wx = Math.cos(wind.dir) * wind.speed;
    const wz = Math.sin(wind.dir) * wind.speed;
    const ok = spawnParticle(pool, {
      x: e.x + Math.cos(ang) * rad,
      y: e.y + smokeRand() * 0.25,
      z: e.z + Math.sin(ang) * rad,
      vx: Math.cos(ang) * e.spread * smokeRand() + wx * 0.15,
      vy: e.rise * (0.65 + smokeRand() * 0.7),
      vz: Math.sin(ang) * e.spread * smokeRand() + wz * 0.15,
      life: e.life * (0.75 + smokeRand() * 0.5),
      age: 0,
      size0: e.size0,
      size1: e.size1,
      kind: e.kind,
      heat: e.heat,
      fade: e.fade,
      aspect: e.aspect,
      floorY: e.floorY,
      slot: 0,
      slotCap,
    });
    if (!ok) {
      e.acc = Math.min(e.acc, 1);
      break;
    }
    e.acc -= 1;
  }
}

function buoy(kind: number): number {
  switch (kind) {
    case KIND.vent: return 1.15;
    case KIND.manhole: return 0.42;
    case KIND.roof: return 0.95;
    case KIND.stall: return 0.72;
    case KIND.barrel: return 1.45;
    case KIND.stack: return 1.7;
    case KIND.exhaust: return 0.55;
    case KIND.column: return 2.6;
    case KIND.ground: return 0.7;
    default: return 1;
  }
}

function dragK(kind: number): number {
  if (kind === KIND.column) return 0.09;
  if (kind === KIND.ground) return 0.22;
  if (kind === KIND.stack) return 0.18;
  return 0.45;
}

function turb(kind: number): number {
  if (kind === KIND.column || kind === KIND.ground) return 7.5;
  if (kind === KIND.stack) return 1.8;
  if (kind === KIND.barrel) return 0.9;
  return 0.45;
}

/**
 * One integration step. Building tests stay inside 100 m and only for street puffs:
 * a launch cloud is an open apron, and testing every card against the city is the
 * frame that would hitch.
 */
export function integrate(
  pool: Pool,
  dt: number,
  wind: Wind,
  query: CityQuery,
  time: number,
  camX: number,
  camZ: number,
): void {
  const wx = Math.cos(wind.dir) * wind.speed;
  const wz = Math.sin(wind.dir) * wind.speed;
  const rain = wind.rain;
  const loft = 1 - rain * 0.62;
  const push = 1 + rain * 0.32;
  const lifeCut = 1 + rain * 0.35;
  const near2 = 100 * 100;
  flip ^= 1;

  for (let i = pool.n - 1; i >= 0; i--) {
    const kind = pool.kind[i]!;
    const life = pool.life[i]!;
    let age = pool.age[i]! + dt;
    const cut = kind >= KIND.column ? 1 + rain * 0.12 : lifeCut;
    if (age >= life / cut) {
      killParticle(pool, i);
      continue;
    }
    pool.age[i] = age;

    let x = pool.x[i]!;
    let y = pool.y[i]!;
    let z = pool.z[i]!;
    const ground = query.groundHeight(x, z);
    const alt = Math.max(0, y - ground);
    const shear = 1 + Math.min(2.1, alt / 60);
    const c = curl(x * 0.07 + time * 0.05, y * 0.07, z * 0.07, 0.18);
    const roll = turb(kind);
    let vx = pool.vx[i]! + (wx * shear * push + c[0] * roll) * dt;
    let vy = pool.vy[i]! + (buoy(kind) * loft + c[1] * roll * 0.35) * dt;
    let vz = pool.vz[i]! + (wz * shear * push + c[2] * roll) * dt;
    // Rain knocks the loft down and adds a little downward drift.
    vy -= rain * 1.4 * dt;
    const damp = Math.exp(-dt * dragK(kind));
    vx *= damp;
    vy *= damp;
    vz *= damp;
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;

    const floorY = Math.max(pool.floorY[i]!, ground + 0.08);
    if (y < floorY) {
      y = floorY;
      if (vy < 0.3) vy = kind === KIND.manhole ? 0.25 : 0.45;
    }

    const street = pool.slot[i] === 0;
    const dx = x - camX;
    const dz = z - camZ;
    if (street && dx * dx + dz * dz < near2 && (i & 1) === flip) {
      if (query.insideSolid(x, y, z, 0.3, false)) {
        const roof = query.floorBelow(x, y + 36, z, false);
        if (roof > y - 0.4 && roof < y + 36 && roof > ground + 2) {
          y = roof + 0.35;
          vy = Math.max(vy, 0.7);
        } else {
          age = Math.max(age, life * 0.9);
          pool.age[i] = age;
        }
      }
    }

    pool.x[i] = x;
    pool.y[i] = y;
    pool.z[i] = z;
    pool.vx[i] = vx;
    pool.vy[i] = vy;
    pool.vz[i] = vz;
  }
}
