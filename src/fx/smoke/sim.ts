// CPU integration. The GPU draws the billboards; this only advances birth, wind, and growth.
import { Rng } from '../../core/rng';
import { readLaunchPlume, type LaunchPlume } from './bridge';
import { KIND, type KindId, type Mouth, type Puff } from './types';

export interface Wind {
  dir: number;
  speed: number;
  rain: number;
}

export interface Xyz {
  x: number;
  y: number;
  z: number;
}

/** World up. The column is vertical on the pad, and the billboard falls back when that axis points at the camera. */
export function launchStretchAxis(_cam: Xyz): Xyz {
  return { x: 0, y: 1, z: 0 };
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
      wind: 0.3, ox: 0, oz: 0, shade: 1, along: 0, offS: 0, offD: 0,
    };
  }

  spawn(m: Mouth, scale: number, cap: number, kindBudget: number, cam: Xyz, fwd: Xyz): boolean {
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
      // Irregular column on the pad. Discrete clusters read as stacked spheres.
      const along = Math.min(0.97, 0.015 + Math.pow(r.next(), 0.62) * 0.96);
      p.along = along;
      const ang = r.next() * Math.PI * 2;
      const n1 = Math.sin(along * 14.7 + 1.3);
      const n2 = Math.sin(along * 8.4 + 4.1);
      const n3 = Math.cos(along * 21.5 + ang);
      const reach = Math.max(2.2, 2.4 + along * 13 + n1 * (1.6 + along * 5.5));
      const rad = Math.pow(r.next(), 0.58) * reach;
      p.offS = Math.cos(ang) * rad + n2 * (1.2 + along * 4.2);
      p.offD = Math.sin(ang) * rad + n3 * (1.2 + along * 3.4);
      x = plume.x + p.offS;
      y = plume.base + along * 420;
      z = plume.z + p.offD;
      const edge = Math.min(1, Math.hypot(p.offS, p.offD) / (reach + 3));
      heat = (1 - edge) * (1 - along * 0.72) * 0.95;
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
    const steamKind = m.kind === KIND.grate || m.kind === KIND.vent || m.kind === KIND.stall;
    p.spinRate = (r.next() - 0.5) * (steamKind ? 0.28 : 0.7);
    p.heat = heat * (0.65 + r.next() * 0.5);
    p.kind = m.kind;
    p.floor = m.floor;
    p.alpha = m.alpha * (0.75 + r.next() * 0.4);
    p.turb = m.turb;
    p.aspect = steamKind
      ? m.aspect * (0.85 + r.next() * 0.35)
      : m.aspect * (0.62 + r.next() * 0.85);
    p.rise = m.rise;
    p.wind = m.wind;
    p.shade = m.kind === KIND.exhaust ? 0.55 + r.next() * 0.35
      : m.kind === KIND.launch ? 0.45 + r.next() * 0.4
        : m.kind === KIND.stack ? 0.32 + r.next() * 0.55
          : 0.62 + r.next() * 0.3;
    if (m.kind === KIND.launch && plume && plume.live) {
      const edge = Math.min(1, Math.hypot(p.offS, p.offD) / (6 + p.along * 16));
      p.shade = 0.22 + (1 - edge) * 0.62 + r.next() * 0.22;
      p.heat = (1 - edge) * (1 - p.along * 0.7) * 0.95;
      const grow = 0.42 + p.along * 1.05 + r.next() * 0.28;
      p.size0 *= grow;
      p.size1 *= grow;
      p.alpha = Math.min(0.92, p.alpha * (edge < 0.45 ? 1.15 : 0.82));
    }
    if (m.kind === KIND.stack) {
      const along = Math.min(0.97, Math.pow(r.next(), 0.78));
      p.along = along;
      const ang = r.next() * Math.PI * 2;
      const lobe = Math.abs(Math.sin(along * 9.7 + m.x * 0.02 + m.z * 0.017));
      const neck = along < 0.07 ? 0.35 + along / 0.07 * 0.65 : 1;
      const reach = (0.3 + along * 2.6) * (0.4 + 0.6 * lobe) * neck;
      const rad = Math.pow(r.next(), 0.5) * reach;
      p.offS = Math.cos(ang) * rad;
      p.offD = Math.sin(ang) * rad;
      p.y = m.y + along * 58;
      p.x = m.x + p.offS;
      p.z = m.z + p.offD;
      p.shade = 0.18 + r.next() * 0.78;
      p.heat = along < 0.08 ? (1 - along / 0.08) * 0.9 : 0.02;
      p.alpha *= 0.55 + r.next() * 0.4;
      p.size0 *= 0.75 + r.next() * 0.35;
      p.size1 *= 0.7 + along * 0.28;
    }
    if (m.kind === KIND.stall) {
      const filament = Math.floor(r.next() * 3);
      const ang = filament * (Math.PI * 2 / 3) + 0.35;
      const along = Math.pow(r.next(), 0.72);
      p.along = along;
      p.ox = m.x + Math.cos(ang) * 0.05;
      p.oz = m.z + Math.sin(ang) * 0.05;
      p.x = p.ox + Math.cos(ang + 0.6) * along * 0.04;
      p.z = p.oz + Math.sin(ang + 0.6) * along * 0.035;
      p.y = m.y + along * 0.72;
      p.age = along * p.life * 0.48;
      p.shade = 0.7 + r.next() * 0.25;
    }
    if (m.kind === KIND.grate || m.kind === KIND.vent) {
      const filament = Math.floor(r.next() * 4);
      const ang = filament * (Math.PI / 2) + r.next() * 0.4;
      const rad = 0.03 + r.next() * (m.kind === KIND.grate ? 0.16 : 0.1);
      const along = r.next();
      p.along = along;
      p.ox = m.x + Math.cos(ang) * rad;
      p.oz = m.z + Math.sin(ang) * rad;
      p.x = p.ox;
      p.z = p.oz;
      const column = m.kind === KIND.grate ? 1.85 : 2.15;
      p.y = m.y + along * column;
      p.age = along * p.life * 0.45;
      p.shade = 0.62 + r.next() * 0.34;
      p.size0 *= 0.65 + (filament % 3) * 0.18 + r.next() * 0.2;
    }
    if (m.kind === KIND.exhaust) {
      const along = r.next();
      p.along = along;
      const back = 0.28 + along * 1.65;
      const side = (r.next() * 2 - 1) * (0.03 + along * 0.08);
      const rx = -m.fz;
      const rz = m.fx;
      p.x = m.x - m.fx * back + rx * side;
      p.y = m.y + along * 0.12;
      p.z = m.z - m.fz * back + rz * side;
      p.age = along * p.life * 0.35;
      p.vx = m.vx;
      p.vz = m.vz;
      p.vy = 0.06;
      p.size0 *= 0.7 + along * 0.45;
      p.size1 *= 0.75 + along * 0.4;
      p.alpha *= 0.85 + (1 - along) * 0.2;
      p.shade = 0.62 + r.next() * 0.28;
    }
    if (m.kind === KIND.ground && plume && plume.live) {
      const rr = 6 + Math.sqrt(r.next()) * 16;
      const a2 = r.next() * Math.PI * 2;
      p.x = plume.x + Math.cos(a2) * rr;
      p.z = plume.z + Math.sin(a2) * rr;
      p.y = plume.base + r.next() * 12;
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

  step(dt: number, wind: Wind, plume: LaunchPlume, cam: Xyz, fwd: Xyz): void {
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
      p.spin += p.spinRate * dt;
      if (p.kind === KIND.launch && plume.live) {
        this.placeOnRibbon(p, plume, cam, fwd);
        list[w++] = p;
        continue;
      }
      if (p.kind === KIND.stack) {
        this.placeStack(p, wind);
        list[w++] = p;
        continue;
      }
      const u = p.age / p.life;
      const shear = 1 + Math.min(1.4, Math.max(0, p.y - p.floor) / 70);
      const sink = rain * (p.kind === KIND.ground ? 0.15 : 0.45);
      const phase = p.seed * 6.28;
      if (p.kind === KIND.stall) {
        const sway = Math.sin(p.age * 1.6 + phase) * 0.04;
        p.vx = approach(p.vx, (p.ox + sway - p.x) * 4.2, dt, 0.18);
        p.vz = approach(p.vz, (p.oz + sway * 0.5 - p.z) * 4.2, dt, 0.18);
        p.vy = approach(p.vy, p.rise * (0.9 - u * 0.35), dt, 0.22);
      } else if (p.kind === KIND.exhaust) {
        p.vy = approach(p.vy, 0.08 * (1 - u), dt, 0.25);
      } else if (p.kind === KIND.grate || p.kind === KIND.vent) {
        const sway = 0.05 + u * 0.08;
        const ax = p.ox + Math.sin(phase + p.age * 0.7) * sway;
        const az = p.oz + Math.cos(phase * 1.2 + p.age * 0.55) * sway;
        p.vx = approach(p.vx, (ax - p.x) * 2.4 + wx * p.wind, dt, 0.28);
        p.vz = approach(p.vz, (az - p.z) * 2.4 + wz * p.wind, dt, 0.28);
        const targetY = p.rise * (0.85 - u * 0.35) * (1 - rain * 0.12);
        p.vy = approach(p.vy, targetY, dt, 0.35);
      } else {
        const targetY = p.rise * (1 - u * 0.72) * (1 - rain * 0.22) - sink;
        p.vy = approach(p.vy, targetY, dt, 0.7);
        const wobX = Math.sin(p.age * 0.85 + phase) * p.turb * 0.22;
        const wobZ = Math.cos(p.age * 0.67 + phase * 1.3) * p.turb * 0.22;
        p.vx = approach(p.vx, wx * p.wind * shear + wobX, dt, 0.7);
        p.vz = approach(p.vz, wz * p.wind * shear + wobZ, dt, 0.7);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < p.floor) {
        p.y = p.floor;
        p.vy *= 0.2;
      }
      list[w++] = p;
    }
    list.length = w;
  }

  /** Hold a vertical column on the pad. Lobes drift, the nozzle stays put. */
  private placeOnRibbon(p: Puff, plume: LaunchPlume, cam: Xyz, _fwd: Xyz): void {
    const u = Math.min(1, p.age / Math.max(0.2, p.life));
    const along = Math.min(0.98, p.along + u * 0.015);
    const swell = 1 + Math.sin(p.age * 0.22 + p.seed * 13) * 0.06;
    const wobS = Math.sin(p.age * 0.31 + p.seed * 17) * (0.6 + along * 2.2);
    const wobD = Math.cos(p.age * 0.27 + p.seed * 9) * (0.6 + along * 1.8);
    p.y = plume.base + along * 420 + Math.sin(p.age * 0.18 + p.seed * 8) * (1.2 + along * 3);
    p.x = plume.x + p.offS * swell + wobS;
    p.z = plume.z + p.offD * swell + wobD;
    if (Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z) < 18) p.y += 24;
  }

  /** Column seated on the flare. Radius grows with height; the mouth stays narrow. */
  private placeStack(p: Puff, wind: Wind): void {
    const u = Math.min(1, p.age / Math.max(0.2, p.life));
    const along = Math.min(0.98, p.along + u * 0.025);
    const height = 58;
    const lean = (0.8 + Math.min(10, Math.max(0, wind.speed)) * 0.35) * along * along;
    const wob = Math.sin(p.age * 0.33 + p.seed * 19) * (0.25 + along * 1.3);
    const wob2 = Math.cos(p.age * 0.29 + p.seed * 11) * (0.25 + along * 1.1);
    p.y = p.floor + along * height;
    p.x = p.ox + Math.cos(wind.dir) * lean + p.offS + wob;
    p.z = p.oz + Math.sin(wind.dir) * lean + p.offD + wob2;
  }

  kindCount(kind: KindId): number {
    return this.kindN[kind] ?? 0;
  }
}
