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

interface FlameFrame {
  len: number;
  halfH: number;
  cx: number;
  cy: number;
  cz: number;
  sx: number;
  sy: number;
  sz: number;
  ux: number;
  uy: number;
  uz: number;
  tx: number;
  ty: number;
  tz: number;
}

/**
 * The launch flame is one camera-facing card. Its long axis is not world-up
 * when the camera looks up the gantry, so a vertical column misses the ribbon.
 * This matches the card in launch.ts: side = worldUp × toCam, up = toCam × side.
 */
function flameFrame(plume: LaunchPlume, cam: Xyz): FlameFrame {
  const len = Math.max(24, plume.head - plume.base);
  // The wide column quad (launch.ts writeQuad 2). Its card is the ribbon in frame.
  const cx = plume.x;
  const cy = plume.base + len * 0.42;
  const cz = plume.z;
  const halfH = len * 0.4;
  let tx = cam.x - cx;
  let ty = cam.y - cy;
  let tz = cam.z - cz;
  const tl = Math.hypot(tx, ty, tz) || 1;
  tx /= tl;
  ty /= tl;
  tz /= tl;
  let sx = tz;
  let sy = 0;
  let sz = -tx;
  const sl = Math.hypot(sx, sz) || 1;
  sx /= sl;
  sz /= sl;
  const ux = ty * sz - tz * sy;
  const uy = tz * sx - tx * sz;
  const uz = tx * sy - ty * sx;
  return { len, halfH, cx, cy, cz, sx, sy, sz, ux, uy, uz, tx, ty, tz };
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
      // World-vertical column on the pad. The flame card leans toward the
      // camera, so riding that card parks the smoke beside the nozzle.
      const clusters = 16;
      const cluster = Math.floor(r.next() * clusters);
      const along = Math.min(0.96, Math.max(0.01, (cluster + r.next() * 0.55) / clusters));
      p.along = along;
      const lobe = cluster * 2.4;
      const reach = 2.5 + along * along * 22;
      const jitter = (3 + along * 9) * (0.35 + r.next() * 0.65);
      p.offS = Math.cos(lobe) * reach * 0.55 + (r.next() * 2 - 1) * jitter;
      p.offD = Math.sin(lobe) * reach * 0.55 + (r.next() * 2 - 1) * jitter;
      x = plume.x + p.offS;
      y = plume.base + along * 440;
      z = plume.z + p.offD;
      const edge = Math.min(1, Math.hypot(p.offS, p.offD) / (reach + 4));
      heat = (1 - edge) * 0.62 * (1 - along * 0.55);
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
      const edge = Math.min(1, Math.hypot(p.offS, p.offD) / (8 + p.along * 24));
      const band = Math.floor(p.along * 16);
      p.shade = (0.82 - edge * 0.4) * (0.7 + ((band * 5 + 2) % 7) / 9);
      p.heat = (1 - edge) * 0.72 * (1 - p.along * 0.5);
      const grow = 0.55 + p.along * 1.15;
      p.size0 *= grow;
      p.size1 *= grow;
      p.alpha = Math.min(0.9, p.alpha * (edge < 0.5 ? 1.2 : 0.95));
    }
    if (m.kind === KIND.stack) {
      const band = Math.floor(r.next() * 8);
      const ang = (band * 0.9 + r.next() * 0.6) ;
      const rad = 0.6 + (band % 3) * 1.8 + r.next() * 1.4;
      p.y = m.y + band * 4.2 + r.next() * 1.6;
      p.x = m.x + Math.cos(ang) * rad;
      p.z = m.z + Math.sin(ang) * rad;
      p.shade = 0.28 + ((band * 3) % 5) / 5 * 0.62;
      if (band < 2) p.heat = Math.max(p.heat, 0.55);
    }
    if (m.kind === KIND.stall) {
      const filament = Math.floor(r.next() * 5);
      const ang = filament * (Math.PI * 2 / 5) + 0.3;
      p.ox = m.x + Math.cos(ang) * 0.09;
      p.oz = m.z + Math.sin(ang) * 0.09;
      p.x = p.ox;
      p.z = p.oz;
      p.y = m.y + r.next() * 0.04;
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
        const wobX = Math.sin(p.age * 1.3 + phase) * 0.16;
        const wobZ = Math.cos(p.age * 1.05 + phase * 1.3) * 0.16;
        p.vx = p.vx * Math.exp(-dt * 0.35) + wobX * dt;
        p.vz = p.vz * Math.exp(-dt * 0.35) + wobZ * dt;
        p.vy = approach(p.vy, 0.05 * (1 - u), dt, 0.28);
      } else if (p.kind === KIND.grate || p.kind === KIND.vent) {
        const spread = 0.04 + u * u * (p.kind === KIND.grate ? 0.42 : 0.22);
        const ax = p.ox + Math.sin(phase + p.age * 0.5) * spread;
        const az = p.oz + Math.cos(phase * 1.31 + p.age * 0.38) * spread * 0.75;
        p.vx = approach(p.vx, (ax - p.x) * 1.5 + wx * p.wind, dt, 0.32);
        p.vz = approach(p.vz, (az - p.z) * 1.5 + wz * p.wind, dt, 0.32);
        const targetY = p.rise * (1 - u * 0.5) * (1 - rain * 0.18);
        p.vy = approach(p.vy, targetY, dt, 0.4);
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
      if (p.kind === KIND.stack) this.holdStack(p, dt, u, wind);
      else if (p.y < p.floor) {
        p.y = p.floor;
        p.vy *= 0.2;
      }
      list[w++] = p;
    }
    list.length = w;
  }

  /** Hold a vertical column on the pad. Lobes drift, the nozzle stays put. */
  private placeOnRibbon(p: Puff, plume: LaunchPlume, cam: Xyz, _fwd: Xyz): void {
    const frame = flameFrame(plume, cam);
    const u = Math.min(1, p.age / Math.max(0.2, p.life));
    const along = Math.min(0.98, p.along + u * 0.02);
    const wob = Math.sin(p.age * 0.45 + p.seed * 17) * (1.5 + along * 4);
    p.y = plume.base + along * 440;
    p.x = plume.x + p.offS + wob + frame.tx * (3 + along * 4);
    p.z = plume.z + p.offD + Math.cos(p.age * 0.4 + p.seed * 11) * (1.2 + along * 3) + frame.tz * (3 + along * 4);
    if (Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z) < 18) p.y += 24;
  }

  private holdStack(p: Puff, dt: number, u: number, wind: Wind): void {
    // Same lean the flare sprite uses, zero at the mouth. Height lobes
    // push the column into billows instead of a smooth capsule.
    const lean = 1.5 + Math.min(12, Math.max(0, wind.speed)) * 0.55;
    const rise = Math.max(0, p.y - p.floor);
    const lift = Math.min(1.8, rise / 16);
    const ox = p.ox + Math.cos(wind.dir) * lean * lift;
    const oz = p.oz + Math.sin(wind.dir) * lean * lift;
    const px = -Math.sin(wind.dir);
    const pz = Math.cos(wind.dir);
    const bulge = Math.sin(rise * 0.15 + 0.4) * (3.2 + lift * 8);
    const personal = (p.seed - 0.5) * (2.2 + lift * 4.5);
    const tx = ox + px * (bulge + personal);
    const tz = oz + pz * (bulge + personal * 0.65);
    const k = 1 - Math.exp(-dt * (1.3 + u));
    p.x += (tx - p.x) * k;
    p.z += (tz - p.z) * k;
  }

  kindCount(kind: KindId): number {
    return this.kindN[kind] ?? 0;
  }
}
