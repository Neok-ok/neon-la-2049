// CPU integration. The GPU draws the billboards; this only advances birth, wind, and growth.
import { Rng } from '../../core/rng';
import { readLaunchPlume, type LaunchPlume } from './bridge';
import { KIND, type KindId, type Mouth, type Puff } from './types';

export interface Wind {
  dir: number;
  speed: number;
  rain: number;
}

function columnRadius(h: number): number {
  const t = Math.min(1, Math.max(0, h) / 320);
  return 24 + t * 78;
}

function approach(current: number, target: number, dt: number, tau: number): number {
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

export class SmokePool {
  live: Puff[] = [];
  private free: Puff[] = [];
  private rng: Rng;
  readonly kindN = [0, 0, 0, 0, 0, 0, 0];

  constructor(seed: number) {
    this.rng = new Rng(seed);
  }

  clear(): void {
    for (const p of this.live) this.free.push(p);
    this.live.length = 0;
    this.kindN.fill(0);
  }

  private take(): Puff {
    return this.free.pop() ?? {
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1,
      size0: 1, size1: 2, seed: 0, spin: 0, spinRate: 0, heat: 0,
      kind: 0, floor: 0, alpha: 0.2, turb: 0, aspect: 1, rise: 1,
      wind: 0.3, ox: 0, oz: 0, shade: 1,
    };
  }

  spawn(m: Mouth, scale: number, cap: number, kindBudget: number): boolean {
    if (this.live.length >= cap) return false;
    if (this.kindN[m.kind]! >= kindBudget) return false;
    const r = this.rng;
    const p = this.take();
    const ang = r.next() * Math.PI * 2;
    const rad = m.radius * Math.sqrt(r.next());
    const plume = m.kind === KIND.launch || m.kind === KIND.ground ? readLaunchPlume() : null;
    let x = m.x + Math.cos(ang) * rad;
    let y = m.y + r.next() * Math.max(0.15, m.radius * 0.25);
    let z = m.z + Math.sin(ang) * rad;
    let heat = m.heat;
    if (plume && plume.live && m.kind === KIND.launch) {
      const span = Math.min(340, Math.max(36, plume.head - plume.base));
      const h = Math.pow(r.next(), 1.7) * span;
      const rr = columnRadius(h) * Math.sqrt(r.next());
      const lean = Math.min(1, h / 420);
      x = plume.x + Math.cos(ang) * rr + plume.leanX * lean;
      z = plume.z + Math.sin(ang) * rr + plume.leanZ * lean;
      y = plume.base + h;
      heat = Math.max(0, 1 - rr / 22) * Math.max(0, 1 - h / 90) * 0.9;
    }
    p.x = x;
    p.y = y;
    p.z = z;
    p.ox = m.x;
    p.oz = m.z;
    p.vx = m.vx + Math.cos(ang) * m.spread * r.next();
    p.vz = m.vz + Math.sin(ang) * m.spread * r.next();
    p.vy = m.rise * (0.55 + r.next() * 0.7);
    p.age = 0;
    p.life = m.life * (0.75 + r.next() * 0.5);
    p.size0 = m.size0 * scale * (0.75 + r.next() * 0.5);
    p.size1 = m.size1 * scale * (0.8 + r.next() * 0.45);
    p.seed = r.next();
    p.spin = r.next() * Math.PI * 2;
    p.spinRate = (r.next() - 0.5) * 1.4;
    p.heat = heat * (0.65 + r.next() * 0.5);
    p.kind = m.kind;
    p.floor = m.floor;
    p.alpha = m.alpha * (0.75 + r.next() * 0.4);
    p.turb = m.turb;
    p.aspect = m.aspect * (0.85 + r.next() * 0.3);
    p.rise = m.rise;
    p.wind = m.wind;
    p.shade = 0.42 + r.next() * 0.7;
    if (m.kind === KIND.ground && plume && plume.live) {
      const rr = 16 + Math.sqrt(r.next()) * 54;
      const a2 = r.next() * Math.PI * 2;
      p.x = plume.x + Math.cos(a2) * rr;
      p.z = plume.z + Math.sin(a2) * rr;
      p.y = plume.base + r.next() * 8;
      p.ox = plume.x;
      p.oz = plume.z;
      const out = Math.hypot(p.x - plume.x, p.z - plume.z) || 1;
      p.vx = ((p.x - plume.x) / out) * (3 + r.next() * 5);
      p.vz = ((p.z - plume.z) / out) * (3 + r.next() * 5);
      p.vy = 1.2 + r.next() * 3.5;
      p.heat *= 0.35;
    }
    this.live.push(p);
    this.kindN[m.kind]!++;
    return true;
  }

  step(dt: number, wind: Wind, plume: LaunchPlume): void {
    const wx = Math.cos(wind.dir) * wind.speed;
    const wz = Math.sin(wind.dir) * wind.speed;
    const rain = wind.rain;
    const list = this.live;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      p.age += dt;
      if (p.age >= p.life) {
        this.kindN[p.kind]!--;
        this.free.push(p);
        continue;
      }
      const u = p.age / p.life;
      const shear = 1 + Math.min(1.4, Math.max(0, p.y - p.floor) / 70);
      const sink = rain * (p.kind === KIND.launch || p.kind === KIND.ground ? 0.15 : 0.45);
      const targetY = p.rise * (1 - u * 0.72) * (1 - rain * 0.22) - sink;
      p.vy = approach(p.vy, targetY, dt, 0.7);
      if (p.kind !== KIND.exhaust) {
        const twx = wx * p.wind * shear;
        const twz = wz * p.wind * shear;
        p.vx = approach(p.vx, twx, dt, 0.9);
        p.vz = approach(p.vz, twz, dt, 0.9);
      } else {
        p.vx *= Math.exp(-dt * 0.35);
        p.vz *= Math.exp(-dt * 0.35);
      }
      const roll = p.turb * dt;
      p.vx += Math.sin(p.y * 0.08 + p.seed * 6.2 + p.age) * roll;
      p.vz += Math.cos(p.x * 0.07 + p.seed * 4.1) * roll;
      p.vy += Math.sin(p.z * 0.09 + p.seed * 2.2) * roll * 0.35;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.spin += p.spinRate * dt;
      if (p.kind === KIND.launch && plume.live) this.holdColumn(p, plume, dt);
      else if (p.kind === KIND.stack) this.holdStack(p, dt, u);
      else if (p.y < p.floor) {
        p.y = p.floor;
        p.vy *= 0.2;
      }
      list[w++] = p;
    }
    list.length = w;
  }

  private holdColumn(p: Puff, plume: LaunchPlume, dt: number): void {
    const h = p.y - plume.base;
    const lean = Math.min(1, Math.max(0, h) / 420);
    const ax = plume.x + plume.leanX * lean;
    const az = plume.z + plume.leanZ * lean;
    const dx = p.x - ax;
    const dz = p.z - az;
    const dist = Math.hypot(dx, dz) || 0.001;
    const limit = columnRadius(h);
    if (dist > limit) {
      const k = 1 - Math.exp(-dt * 1.6);
      p.x += (ax + (dx / dist) * limit - p.x) * k;
      p.z += (az + (dz / dist) * limit - p.z) * k;
    }
  }

  private holdStack(p: Puff, dt: number, u: number): void {
    const dx = p.x - p.ox;
    const dz = p.z - p.oz;
    const dist = Math.hypot(dx, dz) || 0.001;
    const limit = 3.5 + u * 16;
    if (dist > limit) {
      const k = 1 - Math.exp(-dt * 1.3);
      p.x += (p.ox + (dx / dist) * limit - p.x) * k;
      p.z += (p.oz + (dz / dist) * limit - p.z) * k;
    }
  }

  kindCount(kind: KindId): number {
    return this.kindN[kind] ?? 0;
  }
}
