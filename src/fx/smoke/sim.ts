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
  const cx = plume.x;
  const cy = plume.base + len * 0.5;
  const cz = plume.z;
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
  return { len, cx, cy, cz, sx, sy, sz, ux, uy, uz, tx, ty, tz };
}

function flamePoint(plume: LaunchPlume, frame: FlameFrame, along: number): Xyz {
  const kY = along * 2 - 1;
  const halfH = frame.len * 0.5;
  return {
    x: frame.cx + frame.ux * kY * halfH + plume.leanX * along,
    y: frame.cy + frame.uy * kY * halfH,
    z: frame.cz + frame.uz * kY * halfH + plume.leanZ * along,
  };
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

  spawn(m: Mouth, scale: number, cap: number, kindBudget: number, cam: Xyz): boolean {
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
      const frame = flameFrame(plume, cam);
      let along = 0.5;
      let axis = flamePoint(plume, frame, along);
      for (let n = 0; n < 8; n++) {
        along = 0.04 + r.next() * 0.92;
        axis = flamePoint(plume, frame, along);
        const dist = Math.hypot(axis.x - cam.x, axis.y - cam.y, axis.z - cam.z);
        if (dist > 180 && dist < 1600) break;
      }
      const sideR = Math.max(20, plume.halfW * 1.85);
      const depthR = Math.max(8, plume.halfW * 0.55);
      p.along = along;
      p.offS = (r.next() * 2 - 1) * sideR * Math.sqrt(r.next());
      p.offD = (r.next() * 2 - 1) * depthR * Math.sqrt(r.next());
      x = axis.x + frame.sx * p.offS + frame.tx * p.offD;
      y = axis.y + frame.sy * p.offS + frame.ty * p.offD;
      z = axis.z + frame.sz * p.offS + frame.tz * p.offD;
      heat = Math.max(0, 1 - Math.abs(p.offS) / (sideR * 0.7)) * 0.8;
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
    p.aspect = m.aspect * (0.62 + r.next() * 0.85);
    p.rise = m.rise;
    p.wind = m.wind;
    p.shade = m.kind === KIND.exhaust ? 0.62 + r.next() * 0.45
      : m.kind === KIND.launch ? 0.5 + r.next() * 0.6
        : 0.34 + r.next() * 0.75;
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

  step(dt: number, wind: Wind, plume: LaunchPlume, cam: Xyz): void {
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
        this.placeOnRibbon(p, plume, cam);
        list[w++] = p;
        continue;
      }
      const u = p.age / p.life;
      const shear = 1 + Math.min(1.4, Math.max(0, p.y - p.floor) / 70);
      const sink = rain * (p.kind === KIND.ground ? 0.15 : 0.45);
      const targetY = p.rise * (1 - u * 0.72) * (1 - rain * 0.22) - sink;
      p.vy = approach(p.vy, targetY, dt, 0.7);
      const phase = p.seed * 6.28;
      const steam = p.kind === KIND.grate || p.kind === KIND.vent || p.kind === KIND.stall;
      if (p.kind === KIND.exhaust) {
        const wobX = Math.sin(p.age * 0.85 + phase) * p.turb * 0.28;
        const wobZ = Math.cos(p.age * 0.67 + phase * 1.3) * p.turb * 0.28;
        p.vx = p.vx * Math.exp(-dt * 0.2) + wobX * dt;
        p.vz = p.vz * Math.exp(-dt * 0.2) + wobZ * dt;
      } else if (steam) {
        const cap = p.kind === KIND.stall ? 0.4 : 2.1;
        const spread = (p.kind === KIND.stall ? 0.1 : 0.3) + u * cap;
        const ax = p.ox + Math.sin(phase + u * 2.2) * spread;
        const az = p.oz + Math.cos(phase * 1.17 + u * 1.5) * spread;
        p.vx = approach(p.vx, (ax - p.x) * 1.7 + wx * p.wind * 0.4, dt, 0.3);
        p.vz = approach(p.vz, (az - p.z) * 1.7 + wz * p.wind * 0.4, dt, 0.3);
      } else {
        const wobX = Math.sin(p.age * 0.85 + phase) * p.turb * 0.22;
        const wobZ = Math.cos(p.age * 0.67 + phase * 1.3) * p.turb * 0.22;
        p.vx = approach(p.vx, wx * p.wind * shear + wobX, dt, 0.7);
        p.vz = approach(p.vz, wz * p.wind * shear + wobZ, dt, 0.7);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.kind === KIND.stack) this.holdStack(p, dt, u);
      else if (p.y < p.floor) {
        p.y = p.floor;
        p.vy *= 0.2;
      }
      list[w++] = p;
    }
    list.length = w;
  }

  /** Stick the puff to the flame card so the column stays wrapped around the ribbon. */
  private placeOnRibbon(p: Puff, plume: LaunchPlume, cam: Xyz): void {
    const frame = flameFrame(plume, cam);
    let along = p.along;
    const wob = Math.sin(p.age * 0.7 + p.seed * 6.2) * 1.6;
    let axis = flamePoint(plume, frame, along);
    p.x = axis.x + frame.sx * (p.offS + wob) + frame.tx * p.offD;
    p.y = axis.y + frame.sy * (p.offS + wob) + frame.ty * p.offD;
    p.z = axis.z + frame.sz * (p.offS + wob) + frame.tz * p.offD;
    for (let i = 0; i < 3 && Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z) < 48; i++) {
      along = along * 0.6 + 0.25;
      axis = flamePoint(plume, frame, along);
      p.x = axis.x + frame.sx * (p.offS + wob) * 0.5 + frame.tx * p.offD * 0.5;
      p.y = axis.y + frame.sy * (p.offS + wob) * 0.5 + frame.ty * p.offD * 0.5;
      p.z = axis.z + frame.sz * (p.offS + wob) * 0.5 + frame.tz * p.offD * 0.5;
    }
  }

  private holdStack(p: Puff, dt: number, u: number): void {
    const dx = p.x - p.ox;
    const dz = p.z - p.oz;
    const dist = Math.hypot(dx, dz) || 0.001;
    const limit = 2.8 + u * 14;
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
