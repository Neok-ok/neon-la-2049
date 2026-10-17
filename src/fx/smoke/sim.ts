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

/**
 * Fraction up the pad column. The still frames the first ~180 m, and the
 * crown of that frame is where a thin shell turns into separate spheres.
 * Overlap the shaft and that crown. Almost nothing is spent above the frame.
 */
function launchAlong(r: Rng, low: boolean): number {
  const roll = r.next();
  if (roll < (low ? 0.2 : 0.14)) return Math.pow(r.next(), 0.65) * (low ? 0.07 : 0.05);
  if (roll < 0.5) return 0.02 + r.next() * 0.2;
  if (roll < 0.96) return 0.14 + r.next() * 0.28;
  return 0.4 + r.next() * 0.12;
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
    let launchReach = 0;
    if (plume && plume.live && m.kind === KIND.launch) {
      // The still looks up the first ~180 m. Pack that shaft, and keep a thicker throat on Low.
      const low = scale >= 1.3;
      const along = launchAlong(r, low);
      p.along = along;
      const nozzleBand = low ? 0.07 : 0.05;
      const throat = Math.min(1, along / nozzleBand);
      const lobe = 0.78 + (billow(along, r.next()) - 0.42) * 0.7;
      const ang = r.next() * Math.PI * 2;
      // A filled core that widens slowly. A radius that grew with height
      // left the crown as a shell of separate spheres.
      const reach = ((low ? 16 : 13) * (0.88 + throat * 0.14) + along * (low ? 26 : 22)) * lobe;
      const rad = Math.pow(r.next(), 0.58) * reach * 0.82;
      const bendS = Math.sin(along * 3.6) * (1.4 + along * 7);
      const bendD = Math.cos(along * 2.7 + 0.7) * (1.2 + along * 6);
      const n2 = Math.sin(along * 8.4 + 1.4) * (0.8 + along * 2.2);
      const n3 = Math.cos(along * 6.2 + 0.6) * (0.8 + along * 2);
      p.offS = Math.cos(ang) * rad + bendS + n2;
      p.offD = Math.sin(ang) * rad + bendD + n3;
      launchReach = Math.max(4, reach);
      x = plume.x + p.offS;
      y = plume.base + along * 420;
      z = plume.z + p.offD;
      const nozzle = Math.max(0, 1 - along / nozzleBand);
      heat = nozzle * (0.85 + r.next() * 0.3);
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
      const low = scale >= 1.3;
      const nozzleBand = low ? 0.07 : 0.05;
      p.turb = launchReach;
      const radial = Math.min(1, Math.hypot(p.offS, p.offD) / Math.max(4, p.turb));
      const falloff = Math.pow(1 - radial, 1.15);
      const nozzle = Math.max(0, 1 - p.along / nozzleBand);
      // Several soft layers, not one opaque disc. The crown was a stack of those discs.
      p.shade = 0.62 + radial * 0.28 + r.next() * 0.12;
      p.heat = nozzle * (0.9 + r.next() * 0.25);
      const grow = 0.9 + Math.sin(p.along * Math.PI) * 0.1 + r.next() * 0.14;
      const throat = 1 + nozzle * (low ? 0.22 : 0.1);
      p.size0 *= grow * throat;
      p.size1 *= grow * throat * (0.85 + (1 - radial) * 0.2);
      p.alpha = Math.min(low ? 0.36 : 0.3, (0.14 + falloff * 0.16 + nozzle * (low ? 0.1 : 0.06)) * (0.86 + r.next() * 0.28));
      if (p.along < 0.1) {
        // The service stack sits on this point. Keep the core thin so the tower
        // shows, and leave the bright vapor on the flanks.
        const rim = Math.min(1, Math.hypot(p.offS, p.offD) / Math.max(6, launchReach));
        p.alpha *= 0.32 + rim * 0.9;
        p.heat = Math.max(p.heat, (1 - p.along / 0.1) * (0.35 + rim * 0.55));
      }
      if (p.along > 0.72) {
        const t = (p.along - 0.72) / 0.28;
        p.size0 *= 1 - t * 0.18;
        p.size1 *= 1 - t * 0.12;
        p.alpha *= 1 - t * 0.4;
      }
    }
    if (m.kind === KIND.stack) {
      const along = Math.min(0.97, 0.004 + r.next() * 0.97);
      p.along = along;
      const ang = r.next() * Math.PI * 2;
      const lobe = billow(along * 2.1, m.x * 0.01 + m.z * 0.008);
      const neck = along < 0.05 ? 0.7 + (along / 0.05) * 0.3 : 1;
      const fat = 0.55 + Math.abs(Math.sin(along * 6.6 + m.x * 0.01)) * 0.72;
      // Radius stays inside the puff size so the column is one mass, not a stipple.
      const reach = (3.2 + along * 6.4) * (0.7 + lobe * 0.45) * neck * fat;
      const rad = Math.pow(r.next(), 0.4) * reach;
      const lobe2 = Math.sin(along * 8.4 + m.z * 0.02) * 1.6 + Math.sin(along * 3.1 + m.x * 0.01) * 0.9;
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
      const filament = Math.floor(r.next() * 3);
      const ang = filament * (Math.PI * 2 / 3) + (r.next() - 0.5) * 0.28;
      // A few rising filaments on the rim. A filled disc above the pot was a bank.
      const along = Math.pow(r.next(), 1.7);
      p.along = along;
      const rim = 0.09 + r.next() * 0.04;
      p.ox = m.x + Math.cos(ang) * rim;
      p.oz = m.z + Math.sin(ang) * rim;
      p.x = p.ox + Math.sin(along * 9 + filament) * 0.012;
      p.z = p.oz + Math.cos(along * 8 + filament * 1.3) * 0.01;
      p.y = m.y + along * 0.38;
      p.age = along * p.life * 0.92;
      p.heat = 0;
      p.shade = 1.05 + r.next() * 0.2;
      p.alpha *= (0.95 + r.next() * 0.25) * Math.pow(1 - along, 0.62);
      const width = (scale >= 1.3 ? 0.055 : scale >= 1.05 ? 0.048 : 0.044) * (0.85 + r.next() * 0.3);
      p.size0 = width;
      p.size1 = width * (1.05 + along * 0.25);
      p.vy = m.rise * (0.75 + r.next() * 0.4);
    }
    if (m.kind === KIND.grate || m.kind === KIND.vent) {
      const grate = m.kind === KIND.grate;
      const ang = r.next() * Math.PI * 2;
      const disc = grate ? 0.28 : 0.14;
      const rad = Math.sqrt(r.next()) * disc;
      // Denser on the grate, still filled above it, so the column has a source.
      const along = r.next() < 0.55 ? r.next() * 0.72 : r.next();
      p.along = along;
      p.ox = m.x + Math.cos(ang) * rad;
      p.oz = m.z + Math.sin(ang) * rad;
      const column = grate ? 3.05 : 2.5;
      const shear = along * along * 0.55;
      const g = gust(r.next(), along * 1.2, along * column);
      const edge = rad / disc;
      const kick = 0.015 + shear * (0.16 + edge * 0.22);
      p.x = p.ox + g.x * kick;
      p.z = p.oz + g.z * kick;
      p.y = m.y + along * column;
      p.vy = 0.08 + along * 0.12;
      p.age = p.life * (0.08 + along * 0.1);
      p.shade = 0.55 + r.next() * 0.4;
      p.size0 *= 1.15 + r.next() * 0.3;
      p.size1 *= 1.25 + r.next() * 0.28;
      const falloff = Math.pow(1 - Math.min(1, edge), 0.85);
      p.alpha *= (0.55 + (1 - along) * 0.28) * (0.62 + falloff * 0.38);
    }
    if (m.kind === KIND.exhaust) {
      // Three braided filaments behind one pipe. Equal slices stacked into a card.
      const filament = Math.floor(r.next() * 3);
      const along = Math.min(0.98, Math.pow(r.next(), 0.78));
      p.along = along;
      p.offS = filament;
      const fl = Math.hypot(m.fx, m.fz) || 1;
      p.vx = m.fx / fl;
      p.vz = m.fz / fl;
      p.vy = 0;
      p.ox = m.x;
      p.oz = m.z;
      p.floor = m.y;
      const pipe = (scale >= 1.3 ? 1.15 : scale >= 1.05 ? 1.05 : 1) * (m.size0 > 0.06 ? 0.075 : 0.052);
      p.size0 = pipe * (0.82 + r.next() * 0.32);
      p.size1 = pipe * (1.02 + along * 0.4);
      const fade = Math.pow(1 - along * 0.9, 1.25);
      p.alpha *= fade * (0.7 + r.next() * 0.35);
      p.shade = 0.78 + r.next() * 0.28;
      p.heat = 0;
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
        const c = curl(p.seed, p.age * 1.6, p.y - p.floor);
        const sway = Math.sin(p.age * 6.2 + phase) * 0.012;
        p.vx = approach(p.vx, (p.ox + sway - p.x) * 7 + n.x * 0.1 + c.x * 0.08, dt, 0.05);
        p.vz = approach(p.vz, (p.oz + sway * 0.7 - p.z) * 7 + n.z * 0.1 + c.z * 0.08, dt, 0.05);
        // Keep rising off the rim. A cap piled the vapor into a bank under the sign.
        const rise = p.rise * (1.05 - u * 0.45);
        p.vy = approach(p.vy, rise + n.y * 0.04, dt, 0.08);
      } else if (p.kind === KIND.grate || p.kind === KIND.vent) {
        const h = Math.max(0, p.y - p.floor);
        const h01 = Math.min(1, h / 3.0);
        const pin = Math.pow(1 - h01, 1.35);
        const shear = h01 * h01;
        const n = gust(p.seed, p.age, h);
        const c = curl(p.seed + 1.2, p.age * 0.55, h);
        const sway = (0.02 + h01 * 0.08) * Math.sin(phase + p.age * 0.7);
        const ax = p.ox + sway;
        const az = p.oz + Math.cos(phase * 1.3 + p.age * 0.55) * sway * 0.6;
        const edge = Math.min(1, Math.hypot(p.x - p.ox, p.z - p.oz) / 0.4);
        const windK = p.wind * (0.06 + shear * 0.72) * (1 + edge * 0.25);
        const turb = p.turb * (0.08 + shear * 0.35);
        p.vx = approach(p.vx, (ax - p.x) * (1.4 + pin * 8) + wx * windK + n.x * turb + c.x * turb * 0.4, dt, 0.16);
        p.vz = approach(p.vz, (az - p.z) * (1.4 + pin * 8) + wz * windK + n.z * turb + c.z * turb * 0.4, dt, 0.16);
        // Stay on the grate. A hard rise lifts the column off its source.
        const targetY = (0.1 + shear * 0.16) * (1 - rain * 0.12);
        p.vy = approach(p.vy, targetY + n.y * 0.03 * shear, dt, 0.2);
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

  /**
   * Thin filaments behind the pipe. They stretch back, fray, and stay
   * inside a hand's width of the bumper line. A filled volume there was one card.
   */
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
    const filament = Math.round(p.offS);
    const n = gust(p.seed, p.age * 1.35 + filament * 1.7, along * 5);
    const c = curl(p.seed + filament * 2.1, p.age * 0.9, along * 3.2);
    const back = 0.06 + along * 1.55 + n.z * along * 0.08;
    const climb = 0.015 + along * along * 0.22 + Math.abs(n.y) * 0.03;
    const lane = (filament - 1) * 0.06;
    const side = lane + (n.x * 0.85 + c.x * 0.55) * along * 0.18;
    p.x = p.ox - fx * back + rx * side;
    p.y = p.floor + climb + c.y * along * 0.03;
    p.z = p.oz - fz * back + rz * side;
  }

  /** Hold a vertical column on the pad. Lobes drift, the nozzle stays put. */
  private placeOnRibbon(p: Puff, plume: LaunchPlume, cam: Xyz, _fwd: Xyz): void {
    const u = Math.min(1, p.age / Math.max(0.2, p.life));
    const along = Math.min(0.98, p.along + u * 0.008);
    const swell = 1 + Math.sin(p.age * 0.22 + p.seed * 9) * (0.04 + along * 0.08);
    const n = gust(p.seed, p.age * 0.45, along * 12);
    const c = curl(p.seed, p.age * 0.35, along * 8);
    // A few metres of drift. A larger kick opened gaps and the column read as clumps.
    const amp = (0.35 + along * 1.6) * (along < 0.08 ? 0.2 : 1);
    p.y = plume.base + along * 420 + (n.y + c.y * 0.45) * (0.8 + along * 2.6);
    p.x = plume.x + p.offS * swell + (n.x * 0.35 + c.x * 0.45) * amp;
    p.z = plume.z + p.offD * swell + (n.z * 0.35 + c.z * 0.45) * amp;
    // The service stack occupies the axis. Shift the lower shaft toward the
    // lens so the nozzle sits on the near face, then let the column centre
    // once it clears the crown.
    const toCamX = cam.x - plume.x;
    const toCamZ = cam.z - plume.z;
    const cd = Math.hypot(toCamX, toCamZ) || 1;
    const near = Math.max(0, 1 - along / 0.14);
    const front = near * 8;
    p.x += (toCamX / cd) * front;
    p.z += (toCamZ / cd) * front;
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
    const wave = Math.sin(along * 5.2 + 0.4) * (4.2 + along * 13);
    const wave2 = Math.cos(along * 3.4 + 1.2) * (3.1 + along * 9.5);
    p.y = p.floor + along * height + (n.y * 0.45 + c.y * 0.35) * along * 3.2;
    p.x = p.ox + Math.cos(wind.dir) * lean + p.offS * swell + (c.x * 0.7 + n.x * 0.4) * body + wave;
    p.z = p.oz + Math.sin(wind.dir) * lean + p.offD * swell + (c.z * 0.7 + n.z * 0.4) * body + wave2;
  }

  kindCount(kind: KindId): number {
    return this.kindN[kind] ?? 0;
  }
}
