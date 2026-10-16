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

/**
 * Curl of the gust field. Finite differences, not a compute shader:
 * the same idea as a particle turbulence force, kept on the CPU so the
 * WebGL fallback still runs it.
 */
function curl(seed: number, age: number, h: number): { x: number; y: number; z: number } {
  const e = 0.21;
  const y0 = gust(seed, age, h);
  const y1 = gust(seed, age, h + e);
  const a0 = gust(seed + 2.3, age, h);
  const a1 = gust(seed + 2.3, age + e, h);
  const h0 = gust(seed + 5.1, age + h, 0.4);
  const h1 = gust(seed + 5.1, age + h + e, 0.4);
  return {
    x: (y1.z - y0.z) * 1.5 - (a1.y - a0.y) * 1.3,
    y: (h1.x - h0.x) * 1.05 - (y1.x - y0.x) * 0.75,
    z: (a1.x - a0.x) * 1.5 - (h1.z - h0.z) * 1.3,
  };
}

/** Bounded gust so a column frays instead of sliding as one ribbon. */
function gust(seed: number, age: number, h: number): { x: number; y: number; z: number } {
  const a = age * 1.7 + seed * 12.3;
  const b = h * 0.85 + seed * 4.1;
  const a2 = a * 2.37 + 1.9;
  const b2 = b * 1.71 + seed * 3;
  return {
    x: Math.sin(a * 1.3 + b) * 0.48 + Math.sin(a2 * 1.7 + b2) * 0.34 + Math.sin(a * 4.2 + seed) * 0.18,
    y: Math.sin(a * 0.9 + b * 1.4) * 0.28 + Math.sin(a2 * 0.6 + 2.2) * 0.16,
    z: Math.cos(a * 1.1 + b * 0.7) * 0.48 + Math.cos(a2 + b2 * 0.8) * 0.34 + Math.cos(a * 3.6 + seed * 5) * 0.18,
  };
}

/** Irregular swell. A single sine reads as a sausage link. */
function billow(along: number, seed: number): number {
  const n1 = Math.abs(Math.sin(along * 5.7 + seed * 4.2));
  const n2 = Math.abs(Math.sin(along * 13.1 + 1.7 + seed));
  const n3 = Math.abs(Math.sin(along * 2.6 + seed * 9.3));
  return 0.42 + n1 * 0.34 + n2 * 0.16 + n3 * 0.22;
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
      // Irregular column. The edge is the bright rim; the core stays thin so backlight reads.
      const along = Math.min(0.97, 0.008 + r.next() * 0.96);
      p.along = along;
      const pinch = billow(along, r.next());
      const ang = r.next() * Math.PI * 2;
      const n2 = Math.sin(along * 8.4 + 2.4) + Math.sin(along * 19.2) * 0.45;
      const n3 = Math.cos(along * 11.6 + ang) + Math.cos(along * 23.5 + 0.6) * 0.4;
      // Narrow at the throat, then a wide shaft. The foot must not become a disc.
      const throat = Math.min(1, along / 0.07);
      const reach = (10 + along * 78) * pinch * (0.42 + throat * 0.58);
      const rad = Math.pow(r.next(), 0.42) * reach;
      // A slow bend shared by the whole slice, so the shaft billows instead of staying a tube.
      const bendS = Math.sin(along * 5.2) * (3 + along * 18);
      const bendD = Math.cos(along * 3.6 + 0.7) * (2.4 + along * 14);
      p.offS = Math.cos(ang) * rad + n2 * (3.4 + along * 12) * pinch + bendS;
      p.offD = Math.sin(ang) * rad + n3 * (3 + along * 10) * pinch + bendD;
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
      const edge = Math.min(1, Math.hypot(p.offS, p.offD) / (6 + p.along * 16));
      // The still looks up the column. Heat has to reach the lower frame, then die
      // so the shaft stays a backlit grey mass against the sky.
      // Heat stays in the throat. A hot disc any higher reads as a slab across the shaft.
      const nozzle = Math.max(0, 1 - p.along / 0.035);
      p.shade = 0.38 + edge * 0.72 + r.next() * 0.3;
      p.heat = nozzle * (0.9 + r.next() * 0.25);
      const grow = 0.55 + Math.sin(p.along * Math.PI) * 0.34 + r.next() * 0.28;
      p.size0 *= grow * (nozzle > 0.5 ? 0.62 : 1);
      p.size1 *= grow * (nozzle > 0.5 ? 0.7 : 1);
      p.alpha = Math.min(0.4, p.alpha * (0.1 + edge * 0.55 + nozzle * 0.22 + r.next() * 0.08));
      if (p.along > 0.8) {
        const t = (p.along - 0.8) / 0.2;
        const tear = 0.62 + Math.abs(Math.sin(p.seed * 17 + p.along * 23)) * 0.45;
        p.size0 *= (1 - t * 0.28) * tear;
        p.size1 *= (1 - t * 0.2) * tear;
        p.offS += Math.sin(p.along * 18 + p.seed * 12) * t * 5;
        p.offD += Math.cos(p.along * 14 + p.seed * 9) * t * 5;
        p.alpha *= 1 - t * 0.22;
      }
    }
    if (m.kind === KIND.stack) {
      const along = Math.min(0.97, 0.004 + r.next() * 0.97);
      p.along = along;
      const ang = r.next() * Math.PI * 2;
      const lobe = billow(along * 2.1, m.x * 0.01 + m.z * 0.008);
      const neck = along < 0.05 ? 0.7 + (along / 0.05) * 0.3 : 1;
      const fat = 0.78 + Math.abs(Math.sin(along * 6.6 + m.x * 0.01)) * 0.48;
      // Radius stays inside the puff size so the column is one mass, not a stipple.
      const reach = (3.2 + along * 6.4) * (0.7 + lobe * 0.45) * neck * fat;
      const rad = Math.pow(r.next(), 0.4) * reach;
      const lobe2 = Math.sin(along * 8.4 + m.z * 0.02) + Math.sin(along * 3.1 + m.x * 0.01) * 0.55;
      p.offS = Math.cos(ang) * rad + lobe2 * along * 2.4;
      p.offD = Math.sin(ang) * rad + Math.cos(along * 6.2 + m.x * 0.01) * along * 2.1;
      p.y = m.y + along * 72;
      p.x = m.x + p.offS;
      p.z = m.z + p.offD;
      p.shade = 0.28 + r.next() * 0.85;
      const belly = Math.max(0, 1 - along / 0.08);
      p.heat = belly * belly * (0.55 + r.next() * 0.35);
      p.alpha *= (0.7 + (1 - along) * 0.22) * (0.65 + r.next() * 0.4);
      const bulge = 0.72 + Math.abs(Math.sin(along * 9 + r.next() * 4)) * 0.55;
      p.size0 *= (0.75 + r.next() * 0.4) * (along < 0.08 ? 0.7 : 1);
      p.size1 *= (0.8 + along * 0.4) * bulge;
    }
    if (m.kind === KIND.stall) {
      const filament = Math.floor(r.next() * 5);
      const ang = filament * (Math.PI * 2 / 5) + r.next() * 0.55;
      // Most of the wisp stays on the rim. The tail thins out before it can reach the sign.
      const along = r.next() * r.next();
      p.along = along;
      const rim = 0.05 + r.next() * 0.05;
      p.ox = m.x + Math.cos(ang) * rim;
      p.oz = m.z + Math.sin(ang) * rim;
      p.x = p.ox + Math.sin(along * 13 + filament) * along * 0.06;
      p.z = p.oz + Math.cos(along * 11 + filament * 1.7) * along * 0.05;
      p.y = m.y - 0.01 + along * 0.42;
      p.age = along * p.life * 0.35;
      p.heat = along < 0.35 ? 0.95 : 0.25 + r.next() * 0.2;
      p.shade = 0.9 + r.next() * 0.35;
      p.alpha *= (0.75 + r.next() * 0.35) * Math.pow(1 - along, 1.05);
      p.size0 *= 0.7 + r.next() * 0.45;
      p.size1 *= 0.8 + along * 0.6;
    }
    if (m.kind === KIND.grate || m.kind === KIND.vent) {
      const filament = Math.floor(r.next() * 6);
      const ang = filament * (Math.PI / 3) + r.next() * 0.4;
      const rad = r.next() * (m.kind === KIND.grate ? 0.16 : 0.1);
      const along = r.next();
      p.along = along;
      p.ox = m.x + Math.cos(ang) * rad;
      p.oz = m.z + Math.sin(ang) * rad;
      const column = m.kind === KIND.grate ? 2.45 : 2.3;
      const shear = along * along;
      const g = gust(r.next(), along * 1.6, along * column);
      const edge = rad / (m.kind === KIND.grate ? 0.16 : 0.1);
      const kick = 0.03 + shear * (0.55 + edge * 1.15);
      p.x = p.ox + g.x * kick;
      p.z = p.oz + g.z * kick;
      p.y = m.y + along * column;
      p.vy = 0.12 + along * 0.22;
      p.age = p.life * (0.05 + along * 0.22);
      p.shade = 0.4 + r.next() * 0.7;
      p.size0 *= 0.4 + (filament % 3) * 0.18 + r.next() * 0.28;
      p.alpha *= (1 - along * 0.45) * (1 - Math.min(0.62, edge * 0.55));
    }
    if (m.kind === KIND.exhaust) {
      // Denser on the bumper than in the thin top, so the trail reads as attached.
      const along = Math.pow(r.next(), 1.15);
      p.along = along;
      const fl = Math.hypot(m.fx, m.fz) || 1;
      // Unit forward, not road speed. A frozen car would otherwise drive the puff through the boot.
      p.vx = m.fx / fl;
      p.vz = m.fz / fl;
      p.vy = 0;
      p.ox = m.x;
      p.oz = m.z;
      p.floor = m.y;
      p.size0 *= 0.9 + along * 0.45;
      p.size1 *= 1.05 + along * 0.7;
      const gap = along < 0.03 ? 0.25 + (along / 0.03) * 0.75 : 1;
      const fade = Math.pow(1 - along, 0.55);
      p.alpha *= gap * (0.42 + fade * 0.75);
      p.shade = 0.48 + r.next() * 0.3;
      this.placeExhaust(p);
    }
    if (m.kind === KIND.ground && plume && plume.live) {
      // Skirt outside the shaft. A ring through the foot stacks into a slab.
      const rr = 28 + Math.sqrt(r.next()) * 26;
      const a2 = r.next() * Math.PI * 2;
      p.x = plume.x + Math.cos(a2) * rr;
      p.z = plume.z + Math.sin(a2) * rr;
      p.y = plume.base + r.next() * 3.2;
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
      if (p.kind === KIND.exhaust) {
        this.placeExhaust(p);
        list[w++] = p;
        continue;
      }
      const u = p.age / p.life;
      const shear = 1 + Math.min(1.4, Math.max(0, p.y - p.floor) / 70);
      const sink = rain * (p.kind === KIND.ground ? 0.15 : 0.45);
      const phase = p.seed * 6.28;
      if (p.kind === KIND.stall) {
        const n = gust(p.seed, p.age, p.y - p.floor);
        const c = curl(p.seed, p.age * 2.2, p.y - p.floor);
        const cap = p.floor + 0.52;
        const sway = Math.sin(p.age * 7.4 + phase) * 0.02;
        p.vx = approach(p.vx, (p.ox + sway - p.x) * 3.4 + n.x * 0.22 + c.x * 0.16, dt, 0.05);
        p.vz = approach(p.vz, (p.oz + sway * 0.7 - p.z) * 3.4 + n.z * 0.22 + c.z * 0.16, dt, 0.05);
        const rise = p.y > cap ? -1.1 : p.rise * (0.9 - u);
        p.vy = approach(p.vy, rise + n.y * 0.08, dt, 0.05);
      } else if (p.kind === KIND.grate || p.kind === KIND.vent) {
        const h = Math.max(0, p.y - p.floor);
        const h01 = Math.min(1, h / 2.2);
        const pin = (1 - h01) * (1 - h01);
        const shear = h01 * h01;
        const n = gust(p.seed, p.age, h);
        const c = curl(p.seed + 1.2, p.age * 0.8, h * 1.4);
        const sway = (0.03 + h01 * 0.2) * Math.sin(phase + p.age * 0.85);
        const ax = p.ox + sway;
        const az = p.oz + Math.cos(phase * 1.3 + p.age * 0.7) * sway * 0.65;
        const edge = Math.min(1, Math.hypot(p.x - p.ox, p.z - p.oz) / 0.45);
        const windK = p.wind * (0.1 + shear * 1.55) * (1 + edge * 0.9);
        const turb = p.turb * (0.2 + shear);
        p.vx = approach(p.vx, (ax - p.x) * (0.8 + pin * 7) + wx * windK + n.x * turb + c.x * turb * 0.65, dt, 0.2);
        p.vz = approach(p.vz, (az - p.z) * (0.8 + pin * 7) + wz * windK + n.z * turb + c.z * turb * 0.65, dt, 0.2);
        // The spawn already fills the column. A hard rise lifts it off the grate.
        const targetY = (0.18 + shear * 0.28) * (1 - rain * 0.15);
        p.vy = approach(p.vy, targetY + n.y * 0.06 * shear, dt, 0.22);
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

  /** Ribbon behind the bumper. Climbs, and stays off the lamp. */
  private placeExhaust(p: Puff): void {
    const along = Math.min(0.98, p.along);
    let fx = p.vx;
    let fz = p.vz;
    const fl = Math.hypot(fx, fz);
    if (fl < 1e-4) {
      fx = 0;
      fz = 1;
    } else {
      fx /= fl;
      fz /= fl;
    }
    const rx = -fz;
    const rz = fx;
    const n = gust(p.seed, p.age * 0.65, along * 5);
    // Stay just behind the bumper. Walking the trail toward the lens swings it off the car.
    // Clear of the boot so the root is visible behind the bumper, not eaten by the body.
    const back = 0.88 + n.z * along * 0.06;
    const climb = 0.02 + along * 4.6;
    const side = (p.seed - 0.5) * (0.05 + along * 0.14) + n.x * (0.03 + along * 0.06);
    p.x = p.ox - fx * back + rx * side;
    p.y = p.floor + climb + n.y * along * 0.2;
    p.z = p.oz - fz * back + rz * side;
  }

  /** Hold a vertical column on the pad. Lobes drift, the nozzle stays put. */
  private placeOnRibbon(p: Puff, plume: LaunchPlume, cam: Xyz, _fwd: Xyz): void {
    const u = Math.min(1, p.age / Math.max(0.2, p.life));
    const along = Math.min(0.98, p.along + u * 0.015);
    const swell = 1 + Math.sin(p.age * 0.31 + p.seed * 13) * (0.1 + along * 0.18);
    const n = gust(p.seed, p.age, along * 28);
    const c = curl(p.seed, p.age * 0.6, along * 16);
    const amp = 2.4 + along * 8;
    const crown = along > 0.84 ? (along - 0.84) * 0.45 : 0;
    p.y = plume.base + along * 420 + (n.y + c.y * 0.6) * (1.2 + along * 5);
    p.x = plume.x + p.offS * swell + (n.x * 0.45 + c.x) * amp * (1 + crown);
    p.z = plume.z + p.offD * swell + (n.z * 0.45 + c.z) * amp * (1 + crown);
    if (Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z) < 18) p.y += 24;
  }

  /** Fuller column on the flare. The mouth stays narrow and hot; the body billows. */
  private placeStack(p: Puff, wind: Wind): void {
    const u = Math.min(1, p.age / Math.max(0.2, p.life));
    const along = Math.min(0.98, p.along + u * 0.02);
    const height = 72;
    const lean = (1.6 + Math.min(12, Math.max(0, wind.speed)) * 0.45) * along * along;
    const n = gust(p.seed, p.age * 0.8, along * 18);
    const c = curl(p.seed, p.age * 0.55, along * 14);
    const lobe = billow(along * 2.2, p.seed + p.ox * 0.01);
    const body = (1.3 + lobe * 2.6) * (0.18 + along * 1.05);
    const swell = 0.86 + lobe * 0.34;
    const wave = Math.sin(along * 7.6 + 0.4) * (1.2 + along * 4.4);
    const wave2 = Math.cos(along * 4.8 + 1.2) * (0.9 + along * 3.6);
    p.y = p.floor + along * height + (n.y * 0.45 + c.y * 0.35) * along * 3.2;
    p.x = p.ox + Math.cos(wind.dir) * lean + p.offS * swell + (c.x * 0.7 + n.x * 0.4) * body + wave;
    p.z = p.oz + Math.sin(wind.dir) * lean + p.offD * swell + (c.z * 0.7 + n.z * 0.4) * body + wave2;
  }

  kindCount(kind: KindId): number {
    return this.kindN[kind] ?? 0;
  }
}
