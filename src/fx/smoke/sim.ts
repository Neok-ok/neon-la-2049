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

/** Bounded gust so a column frays instead of sliding as one ribbon. */
function gust(seed: number, age: number, h: number): { x: number; y: number; z: number } {
  const a = age * 1.7 + seed * 12.3;
  const b = h * 0.85 + seed * 4.1;
  return {
    x: Math.sin(a * 1.3 + b) * 0.62 + Math.sin(a * 2.7 + seed * 9) * 0.38,
    y: Math.sin(a * 0.9 + b * 1.4) * 0.4,
    z: Math.cos(a * 1.1 + b * 0.7) * 0.62 + Math.cos(a * 2.2 + seed * 5) * 0.38,
  };
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
      // Pinched column. Swells read as billows; the gaps keep it from a smooth tube.
      const along = Math.min(0.97, 0.01 + Math.pow(r.next(), 0.9) * 0.96);
      p.along = along;
      const pinch = 0.42 + 0.58 * Math.abs(Math.sin(along * 17.5 + 0.6));
      const ang = r.next() * Math.PI * 2;
      const n2 = Math.sin(along * 9.2 + 2.4);
      const n3 = Math.cos(along * 13.6 + ang);
      const reach = (3.4 + along * 15.5) * pinch;
      const rad = Math.pow(r.next(), 0.55) * reach;
      p.offS = Math.cos(ang) * rad + n2 * (1.4 + along * 5.2) * pinch;
      p.offD = Math.sin(ang) * rad + n3 * (1.4 + along * 4.4) * pinch;
      x = plume.x + p.offS;
      y = plume.base + along * 420;
      z = plume.z + p.offD;
      const edge = Math.min(1, Math.hypot(p.offS, p.offD) / (reach + 2.5));
      heat = Math.pow(1 - edge, 1.4) * Math.max(0, 1 - along / 0.22) * (0.55 + r.next() * 0.7);
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
      const edge = Math.min(1, Math.hypot(p.offS, p.offD) / (5 + p.along * 14));
      // Dark core, brighter torn edge. The nozzle heat is separate.
      p.shade = 0.22 + edge * 0.85 + r.next() * 0.28;
      p.heat = Math.pow(Math.max(0, 1 - edge), 1.3) * Math.max(0, 1 - p.along / 0.22) * (0.7 + r.next() * 0.55);
      const grow = 0.4 + p.along * 0.85 + r.next() * 0.7;
      p.size0 *= grow;
      p.size1 *= grow;
      p.alpha = Math.min(0.46, p.alpha * (0.16 + (1 - edge) * 0.55 + r.next() * 0.12));
    }
    if (m.kind === KIND.stack) {
      const along = Math.min(0.97, 0.012 + r.next() * 0.96);
      p.along = along;
      const ang = r.next() * Math.PI * 2;
      const lobe = 0.55 + 0.45 * Math.abs(Math.sin(along * 7.4 + m.x * 0.013 + m.z * 0.011));
      const lobe2 = Math.sin(along * 12.2 + m.z * 0.02);
      const neck = along < 0.04 ? 0.62 + (along / 0.04) * 0.38 : 1;
      const reach = (2.6 + along * 10.5) * lobe * neck;
      const rad = Math.pow(r.next(), 0.48) * reach;
      p.offS = Math.cos(ang) * rad + lobe2 * along * 2.6;
      p.offD = Math.sin(ang) * rad + Math.cos(along * 9.1 + m.x * 0.01) * along * 2.2;
      p.y = m.y + along * 78;
      p.x = m.x + p.offS;
      p.z = m.z + p.offD;
      p.shade = 0.18 + r.next() * 0.82;
      const belly = Math.max(0, 1 - along / 0.18);
      p.heat = belly * (0.45 + r.next() * 0.7);
      p.alpha *= 0.55 + r.next() * 0.5;
      p.size0 *= 0.62 + r.next() * 0.7;
      p.size1 *= 0.7 + along * 0.7;
    }
    if (m.kind === KIND.stall) {
      const filament = Math.floor(r.next() * 4);
      const ang = filament * (Math.PI / 2) + r.next() * 0.35;
      const along = Math.pow(r.next(), 0.55);
      p.along = along;
      p.ox = m.x + Math.cos(ang) * 0.035;
      p.oz = m.z + Math.sin(ang) * 0.035;
      p.x = p.ox;
      p.z = p.oz;
      p.y = m.y + along * 0.4;
      p.age = along * p.life * 0.62;
      p.heat = 0.72 + r.next() * 0.28;
      p.shade = 0.78 + r.next() * 0.2;
      p.alpha *= 0.75 + r.next() * 0.2;
    }
    if (m.kind === KIND.grate || m.kind === KIND.vent) {
      const filament = Math.floor(r.next() * 4);
      const ang = filament * (Math.PI / 2) + r.next() * 0.45;
      const rad = 0.02 + r.next() * (m.kind === KIND.grate ? 0.34 : 0.16);
      const along = r.next();
      p.along = along;
      p.ox = m.x + Math.cos(ang) * rad;
      p.oz = m.z + Math.sin(ang) * rad;
      const column = m.kind === KIND.grate ? 2.25 : 2.4;
      const shear = along * along;
      const g = gust(r.next(), along * 1.4, along * column);
      p.x = p.ox + g.x * shear * 0.28;
      p.z = p.oz + g.z * shear * 0.28;
      p.y = m.y + along * column;
      p.age = p.life * (0.18 + along * 0.4);
      p.shade = 0.5 + r.next() * 0.45;
      p.size0 *= 0.5 + (filament % 3) * 0.18 + r.next() * 0.28;
      const edge = rad / (m.kind === KIND.grate ? 0.36 : 0.18);
      p.alpha *= 1 - Math.min(0.55, edge * 0.4);
    }
    if (m.kind === KIND.exhaust) {
      const along = r.next();
      p.along = along;
      const back = 0.25 + along * 7.4;
      const side = (r.next() * 2 - 1) * (0.04 + along * 0.42);
      const rx = -m.fz;
      const rz = m.fx;
      const g = gust(r.next(), along, back);
      p.x = m.x - m.fx * back + rx * side + g.x * along * 0.16;
      p.y = m.y + along * 0.85 + (r.next() - 0.4) * 0.08;
      p.z = m.z - m.fz * back + rz * side + g.z * along * 0.16;
      p.age = along * p.life * 0.55;
      p.vx = m.vx;
      p.vz = m.vz;
      p.vy = 0.18 + along * 0.45;
      p.size0 *= 0.7 + along * 0.85;
      p.size1 *= 0.75 + along * 0.9;
      p.alpha *= 0.35 + (1 - along) * 0.65;
      p.shade = 0.45 + r.next() * 0.4;
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
        const n = gust(p.seed, p.age, p.y - p.floor);
        const cap = p.floor + 0.42;
        const sway = Math.sin(p.age * 3.4 + phase) * 0.025;
        p.vx = approach(p.vx, (p.ox + sway - p.x) * 9 + n.x * 0.1, dt, 0.08);
        p.vz = approach(p.vz, (p.oz + sway * 0.6 - p.z) * 9 + n.z * 0.1, dt, 0.08);
        const rise = p.y > cap ? -0.55 : p.rise * (0.8 - u * 0.75);
        p.vy = approach(p.vy, rise, dt, 0.1);
      } else if (p.kind === KIND.exhaust) {
        const n = gust(p.seed, p.age, p.along * 4);
        p.vy = approach(p.vy, 0.16 * (1 - u) + n.y * 0.05, dt, 0.28);
      } else if (p.kind === KIND.grate || p.kind === KIND.vent) {
        const h = Math.max(0, p.y - p.floor);
        const h01 = Math.min(1, h / 2.2);
        const pin = (1 - h01) * (1 - h01);
        const shear = h01 * h01;
        const n = gust(p.seed, p.age, h);
        const sway = (0.03 + h01 * 0.16) * Math.sin(phase + p.age * 0.85);
        const ax = p.ox + sway;
        const az = p.oz + Math.cos(phase * 1.3 + p.age * 0.7) * sway * 0.65;
        const edge = Math.min(1, Math.hypot(p.x - p.ox, p.z - p.oz) / 0.4);
        const windK = p.wind * (0.1 + shear * 1.7) * (1 + edge * 0.85);
        p.vx = approach(p.vx, (ax - p.x) * (0.8 + pin * 7) + wx * windK + n.x * p.turb * (0.25 + shear), dt, 0.2);
        p.vz = approach(p.vz, (az - p.z) * (0.8 + pin * 7) + wz * windK + n.z * p.turb * (0.25 + shear), dt, 0.2);
        const targetY = p.rise * (1.0 - u * 0.45) * (1 - rain * 0.2);
        p.vy = approach(p.vy, targetY + n.y * 0.12 * shear, dt, 0.28);
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
    const swell = 1 + Math.sin(p.age * 0.22 + p.seed * 13) * (0.1 + along * 0.16);
    const n = gust(p.seed, p.age, along * 28);
    const amp = 1.6 + along * 9;
    p.y = plume.base + along * 420 + n.y * (1.4 + along * 4);
    p.x = plume.x + p.offS * swell + n.x * amp;
    p.z = plume.z + p.offD * swell + n.z * amp;
    if (Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z) < 18) p.y += 24;
  }

  /** Fuller column on the flare. The mouth stays narrow and hot; the body billows. */
  private placeStack(p: Puff, wind: Wind): void {
    const u = Math.min(1, p.age / Math.max(0.2, p.life));
    const along = Math.min(0.98, p.along + u * 0.02);
    const height = 78;
    const lean = (1.6 + Math.min(12, Math.max(0, wind.speed)) * 0.5) * along * along;
    const n = gust(p.seed, p.age * 0.8, along * 18);
    const billow = (Math.sin(p.age * 0.42 + p.seed * 19 + along * 8) + n.x * 0.65) * (1.4 + along * 3.4);
    const billow2 = (Math.cos(p.age * 0.33 + p.seed * 11 + along * 5.4) + n.z * 0.65) * (1.3 + along * 2.8);
    const swell = 1 + Math.sin(p.age * 0.24 + p.seed * 7) * 0.18 * (0.25 + along);
    p.y = p.floor + along * height + n.y * along * 3.2;
    p.x = p.ox + Math.cos(wind.dir) * lean + p.offS * swell + billow;
    p.z = p.oz + Math.sin(wind.dir) * lean + p.offD * swell + billow2;
  }

  kindCount(kind: KindId): number {
    return this.kindN[kind] ?? 0;
  }
}
