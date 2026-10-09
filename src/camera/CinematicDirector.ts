// Self-directing camera. Builds an endless sequence of randomized shots from a library of shot types
// (flyovers, landmark orbits, street dollies, crane-ups, telephoto lock-offs, spinner tracking, sea-wall
// runs, rooftop pans, freeway-trench runs). Every shot draws fresh continuous parameters from a crypto
// seeded RNG; a signature set + type/anchor history guarantees no shot is ever repeated.
import { MathUtils, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { Controller, Pose } from './types';
import { forwardOf } from './types';
import type { CityQuery } from '../world/CityQuery';
import { Rng, trueRandomSeed } from '../core/rng';
import type { Landmark, District } from '../world/layout';
import type { SpinnerTraffic } from '../vehicles/SpinnerTraffic';

type ShotType = 'flyover' | 'orbit' | 'street' | 'crane' | 'telephoto' | 'tracking' | 'seawall' | 'rooftop' | 'trench';

interface Shot {
  type: ShotType;
  anchor: string;
  duration: number;
  fov: number;
  focus: Vector3;
  /** t in [0, 1]; writes camera position + look target */
  eval(t: number, pos: Vector3, look: Vector3): boolean | void;
  signature: string;
}

const TYPE_WEIGHTS: Record<ShotType, number> = {
  flyover: 3, orbit: 3, street: 4, crane: 2, telephoto: 2, tracking: 2, seawall: 1.5, rooftop: 2, trench: 1.5,
};

const LANDMARK_WEIGHTS: Record<string, number> = {
  'wallace-pyramid': 4, 'lapd-hq': 3, 'k-megablock-tower': 2, 'lax-spaceport-towers': 1, 'el-segundo-refinery': 1.2, 'city-hall': 0.6,
};

const STREET_DISTRICTS = ['little-tokyo-market', 'historic-core', 'k-megablock', 'dtla', 'financial-megatowers', 'hollywood', 'civic-center', 'westside'];
const FLY_DISTRICTS = ['dtla', 'financial-megatowers', 'little-tokyo-market', 'historic-core', 'wallace-vernon', 'south-la-megablocks', 'lakewood-megablocks', 'coastal-strip', 'harbor', 'hollywood', 'long-beach'];

const tmp = new Vector3();

export class CinematicDirector implements Controller {
  readonly id = 'cine' as const;
  private rng = new Rng(trueRandomSeed());
  private shot: Shot | null = null;
  private next: Shot | null = null;
  private t = 0;
  private history: Shot[] = [];
  private signatures = new Set<string>();
  private active = false;
  private pos = new Vector3();
  private look = new Vector3();
  shotCount = 0;
  /** extra streaming focus point (pre-loads the next shot's area) */
  prefetch: Vector3 | null = null;
  /** debug/automation: freeze the current shot (no clock, no fades) */
  hold = false;

  constructor(
    private camera: PerspectiveCamera,
    private query: CityQuery,
    private traffic: SpinnerTraffic | null,
    private fade: (v: number) => void,
  ) {}

  enter(_from: Pose): void {
    this.active = true;
    this.shot = this.plan();
    this.t = 0;
    this.fade(0);
  }

  exit(): void {
    this.active = false;
    this.prefetch = null;
    this.fade(0);
  }

  get label(): string {
    return this.shot ? `${this.shot.type} · ${this.shot.anchor}` : '';
  }

  pose(): Pose {
    const d = tmp.copy(this.look).sub(this.pos).normalize();
    return { position: this.pos.clone(), heading: Math.atan2(d.x, -d.z), pitch: Math.asin(MathUtils.clamp(d.y, -1, 1)) };
  }

  /** Skip to the next shot (UI button / N key). */
  cut(): void {
    this.t = 1e9;
  }

  /**
   * Replace the current shot with a slow slide in front of a hologram face.
   * `yaw` is the panel yaw; the camera starts along that normal.
   */
  frameFace(anchor: string, focus: Vector3, yaw: number, dist: number, eyeY: number): void {
    const f = focus.clone();
    this.shot = {
      type: 'orbit',
      anchor,
      duration: 24,
      fov: 50,
      focus: f.clone(),
      signature: 'zz-holo-face',
      eval: (t, pos, look) => {
        const a = yaw + (t - 0.45) * 0.45;
        pos.set(f.x + Math.sin(a) * dist, eyeY + Math.sin(t * Math.PI) * 8, f.z + Math.cos(a) * dist);
        look.copy(f);
      },
    };
    this.t = 0.35;
    this.next = null;
    this.prefetch = null;
    this.active = true;
  }

  update(dt: number): void {
    if (!this.active || !this.shot) return;
    if (!this.hold) this.t += dt;
    const s = this.shot;
    if (!this.next && s.duration - this.t < 3) {
      this.next = this.plan();
      this.prefetch = this.next.focus;
    }
    if (this.t >= s.duration) {
      this.shot = this.next ?? this.plan();
      this.next = null;
      this.prefetch = null;
      this.t = 0;
    }
    const cur = this.shot;
    const u = Math.min(1, this.t / cur.duration);
    const ok = cur.eval(u, this.pos, this.look);
    if (ok === false) this.t = cur.duration; // shot invalidated (e.g. tracked car respawned)
    // slow fades on ~1/3 of transitions, hard cuts otherwise
    const fadeIn = cur.signature.charCodeAt(0) % 3 === 0 ? Math.min(1, this.t / 0.8) : 1;
    const fadeOut = cur.signature.charCodeAt(1) % 3 === 0 ? Math.min(1, (cur.duration - this.t) / 0.8) : 1;
    this.fade(this.hold ? 0 : 1 - Math.min(fadeIn, fadeOut));
    this.camera.position.copy(this.pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
    if (Math.abs(this.camera.fov - cur.fov) > 0.01) {
      this.camera.fov = cur.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  // ------------------------------------------------------------------ planning
  private plan(): Shot {
    for (let attempt = 0; attempt < 40; attempt++) {
      const type = this.pickType();
      const shot = this.build(type);
      if (!shot) continue;
      if (this.signatures.has(shot.signature)) continue;
      const recentAnchors = this.history.slice(-5).map((h) => h.anchor);
      if (recentAnchors.includes(shot.anchor) && attempt < 30) continue;
      this.signatures.add(shot.signature);
      if (this.signatures.size > 20000) this.signatures.clear();
      this.history.push(shot);
      if (this.history.length > 40) this.history.shift();
      this.shotCount++;
      return shot;
    }
    return this.buildFlyover(true)!;
  }

  private pickType(): ShotType {
    const recent = this.history.slice(-6).map((h) => h.type);
    const last = recent[recent.length - 1];
    const entries = (Object.entries(TYPE_WEIGHTS) as [ShotType, number][])
      .filter(([t]) => t !== last)
      .filter(([t]) => t !== 'tracking' || this.traffic)
      .map(([t, w]) => [t, w / (1 + recent.filter((r) => r === t).length * 1.5)] as [ShotType, number]);
    let r = this.rng.next() * entries.reduce((a, [, w]) => a + w, 0);
    for (const [t, w] of entries) if ((r -= w) <= 0) return t;
    return entries[0][0];
  }

  private build(type: ShotType): Shot | null {
    switch (type) {
      case 'flyover': return this.buildFlyover(false);
      case 'orbit': return this.buildOrbit();
      case 'street': return this.buildStreet(false);
      case 'crane': return this.buildStreet(true);
      case 'telephoto': return this.buildTelephoto();
      case 'tracking': return this.buildTracking();
      case 'seawall': return this.buildSeawall();
      case 'rooftop': return this.buildRooftop();
      case 'trench': return this.buildTrench();
    }
  }

  private sig(type: string, anchor: string, p: Vector3, heading: number): string {
    return `${type}|${anchor}|${Math.round(p.x / 60)},${Math.round(p.y / 30)},${Math.round(p.z / 60)}|${Math.round((heading * 180) / Math.PI / 8)}`;
  }

  private pickLandmark(): Landmark {
    const ls = this.query.layout.landmarks;
    const ws = ls.map((l) => LANDMARK_WEIGHTS[l.id] ?? (l.type === 'megatower' ? 0.8 : 0.3));
    let r = this.rng.next() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < ls.length; i++) if ((r -= ws[i]) <= 0) return ls[i];
    return ls[0];
  }

  private districtById(id: string): District | undefined {
    return this.query.layout.districts.find((d) => d.id === id);
  }

  private randomPointIn(d: District): [number, number] | null {
    for (let k = 0; k < 30; k++) {
      const x = this.rng.range(d.bbox[0], d.bbox[2]);
      const z = this.rng.range(d.bbox[1], d.bbox[3]);
      if (this.query.district(x, z) === d && !this.query.layout.isOcean(x, z)) return [x, z];
    }
    return null;
  }

  private buildFlyover(fallback: boolean): Shot | null {
    const r = this.rng;
    const d = this.districtById(fallback ? 'dtla' : r.pick(FLY_DISTRICTS));
    if (!d) return null;
    const p = this.randomPointIn(d);
    if (!p) return null;
    const heading = r.range(0, Math.PI * 2);
    const alt = r.range(190, 480);
    const speed = r.range(22, 65);
    const pitch = -r.range(0.12, 0.5);
    const dur = r.range(8, 13);
    const start = new Vector3(p[0], alt + this.query.groundHeight(p[0], p[1]), p[1]);
    const dir = forwardOf(heading, 0, new Vector3());
    const pitchDrift = r.range(-0.06, 0.06);
    return {
      type: 'flyover', anchor: d.id, duration: dur, fov: r.range(42, 64), focus: start.clone(),
      signature: this.sig('flyover', d.id, start, heading),
      eval: (t, pos, look) => {
        pos.copy(start).addScaledVector(dir, speed * dur * t);
        look.copy(pos).add(forwardOf(heading, pitch + pitchDrift * t, tmp).multiplyScalar(100));
      },
    };
  }

  private buildOrbit(): Shot | null {
    const r = this.rng;
    const l = this.pickLandmark();
    const size = Math.max(l.baseWidth, l.baseDepth ?? 0, 60);
    const H = l.height;
    const big = H > 1000;
    const radius = big ? r.range(H * 0.9, H * 1.8) : size * r.range(1.6, 3.2) + r.range(120, 320);
    const targetY = H * r.range(0.25, 0.7);
    const camY = Math.max(big ? 260 : 180, targetY + H * r.range(-0.3, 0.35));
    const a0 = r.range(0, Math.PI * 2);
    const sweep = r.range(0.25, 0.6) * (r.chance(0.5) ? 1 : -1) * (big ? 0.6 : 1);
    const dur = r.range(9, 14);
    const center = new Vector3(l.x, targetY, l.z);
    const rise = r.range(-0.08, 0.12) * H;
    const focus = new Vector3(l.x + Math.cos(a0) * radius, camY, l.z + Math.sin(a0) * radius);
    return {
      type: 'orbit', anchor: l.id, duration: dur, fov: r.range(38, 58), focus,
      signature: this.sig('orbit', l.id, focus, a0),
      eval: (t, pos, look) => {
        const a = a0 + sweep * t;
        pos.set(l.x + Math.cos(a) * radius, Math.max(60, camY + t * rise), l.z + Math.sin(a) * radius);
        look.copy(center);
      },
    };
  }

  /** Street dolly (crane = false) or vertical crane-up from street level (crane = true). */
  private buildStreet(crane: boolean): Shot | null {
    const r = this.rng;
    const d = this.districtById(r.pick(STREET_DISTRICTS));
    if (!d) return null;
    const p = this.randomPointIn(d);
    if (!p) return null;
    const fab = this.query.fabricAt(p[0], p[1]);
    const blocks = fab.blocks.filter((b) => b.district === d);
    if (!blocks.length) return null;
    const b = r.pick(blocks);
    // street centre line next to one block edge, running along grid axis B
    const side = r.chance(0.5) ? 1 : -1;
    const off = b.la / 2 + b.street / 2;
    const cx = b.cx + b.ax * off * side, cz = b.cz + b.az * off * side;
    const along = r.range(-b.lb / 2, b.lb / 2);
    const dirSign = r.chance(0.5) ? 1 : -1;
    const dx = b.bx * dirSign, dz = b.bz * dirSign;
    const start = new Vector3(cx + b.bx * along, 0, cz + b.bz * along);
    const ground = this.query.groundHeight(start.x, start.z);
    const height = crane ? 2 : r.range(1.6, 5.5);
    const speed = crane ? 0 : r.range(0.8, 3.2);
    const dur = crane ? r.range(10, 14) : r.range(8, 12);
    const craneTop = r.range(110, 230);
    start.y = ground + height;
    // validate the path stays in open air
    for (let k = 0; k <= 4; k++) {
      const q = start.clone().add(new Vector3(dx, 0, dz).multiplyScalar(speed * dur * (k / 4)));
      if (this.query.insideSolid(q.x, q.y, q.z, 0.8, true)) return null;
    }
    const heading = Math.atan2(dx, -dz) + (crane ? r.range(-0.4, 0.4) : r.range(-0.15, 0.15));
    const pitch0 = crane ? r.range(0.25, 0.55) : r.range(0.02, 0.22);
    const pitch1 = crane ? -r.range(0.05, 0.3) : pitch0 + r.range(-0.05, 0.05);
    return {
      type: crane ? 'crane' : 'street', anchor: `${d.id}#${b.i},${b.j}`, duration: dur, fov: crane ? r.range(50, 65) : r.range(40, 62),
      focus: start.clone(),
      signature: this.sig(crane ? 'crane' : 'street', d.id, start, heading),
      eval: (t, pos, look) => {
        const e = t * t * (3 - 2 * t);
        pos.set(start.x + dx * speed * dur * t, crane ? ground + 2 + (craneTop - 2) * e : start.y, start.z + dz * speed * dur * t);
        look.copy(pos).add(forwardOf(heading, MathUtils.lerp(pitch0, pitch1, e), tmp).multiplyScalar(50));
      },
    };
  }

  private buildTelephoto(): Shot | null {
    const r = this.rng;
    const l = this.pickLandmark();
    const H = l.height;
    const dist = H > 1000 ? r.range(5500, 9500) : r.range(1600, 3500);
    const a = r.range(0, Math.PI * 2);
    const camY = r.range(120, 420);
    const pos0 = new Vector3(l.x + Math.cos(a) * dist, camY, l.z + Math.sin(a) * dist);
    if (this.query.insideSolid(pos0.x, pos0.y, pos0.z, 3, true) || this.query.insideLandmark(pos0.x, pos0.y, pos0.z, 10)) return null;
    const target = new Vector3(l.x, H * r.range(0.35, 0.75), l.z);
    const drift = new Vector3(r.range(-1, 1), r.range(-0.3, 0.3), r.range(-1, 1)).multiplyScalar(r.range(4, 12));
    const dur = r.range(9, 14);
    const fovWanted = MathUtils.clamp((Math.atan2(H * 0.9, dist) * 360) / Math.PI, 8, 26);
    return {
      type: 'telephoto', anchor: l.id, duration: dur, fov: fovWanted, focus: pos0.clone(),
      signature: this.sig('telephoto', l.id, pos0, a),
      eval: (t, pos, look) => {
        pos.copy(pos0).addScaledVector(drift, t * dur);
        look.copy(target);
      },
    };
  }

  private buildTracking(): Shot | null {
    const tr = this.traffic;
    if (!tr || !tr.vehicles.length) return null;
    const r = this.rng;
    const car = r.pick(tr.vehicles);
    const offSide = r.range(18, 55) * (r.chance(0.5) ? 1 : -1);
    const offBack = r.range(-30, 40);
    const offUp = r.range(-8, 20);
    const dur = r.range(7, 11);
    let last = car.p.clone();
    return {
      type: 'tracking', anchor: `car@${Math.round(car.p.x)}`, duration: dur, fov: r.range(30, 50), focus: car.p.clone(),
      signature: this.sig('tracking', 'car', car.p, offSide),
      eval: (_t, pos, look) => {
        if (car.p.distanceTo(last) > 300) return false;
        last = car.p.clone();
        const right = tmp.set(-car.dir.z, 0, car.dir.x);
        pos.copy(car.p).addScaledVector(right, offSide).addScaledVector(car.dir, -offBack);
        pos.y += offUp;
        look.copy(car.p);
      },
    };
  }

  private buildSeawall(): Shot | null {
    const r = this.rng;
    const walls = this.query.layout.seaWalls;
    const w = r.pick(walls);
    const i = r.int(0, w.pts.length - 2);
    const [ax, az] = w.pts[i], [bx, bz] = w.pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    let nx = -uz, nz = ux;
    if (!this.query.layout.isOcean(ax + nx * 400, az + nz * 400)) { nx = -nx; nz = -nz; }
    const dirS = r.chance(0.5) ? 1 : -1;
    const start = new Vector3(ax + (bx - ax) * r.range(0.1, 0.5), w.crestHeight + r.range(10, 70), az + (bz - az) * r.range(0.1, 0.5));
    const off = r.range(20, 140);
    start.x += nx * off;
    start.z += nz * off;
    const speed = r.range(18, 45);
    const dur = r.range(8, 12);
    const lookSide = r.range(-0.35, 0.2);
    return {
      type: 'seawall', anchor: `${w.id}#${i}`, duration: dur, fov: r.range(45, 65), focus: start.clone(),
      signature: this.sig('seawall', w.id, start, dirS),
      eval: (t, pos, look) => {
        pos.set(start.x + ux * dirS * speed * dur * t, start.y, start.z + uz * dirS * speed * dur * t);
        look.set(pos.x + ux * dirS * 100 - nx * lookSide * 100, pos.y - 22, pos.z + uz * dirS * 100 - nz * lookSide * 100);
      },
    };
  }

  private buildRooftop(): Shot | null {
    const r = this.rng;
    const d = this.districtById(r.pick(['dtla', 'financial-megatowers', 'south-la-megablocks', 'lakewood-megablocks', 'historic-core', 'long-beach']));
    if (!d) return null;
    const p = this.randomPointIn(d);
    if (!p) return null;
    const fab = this.query.fabricAt(p[0], p[1]);
    const tall = fab.boxes.filter((b) => b.detail === 0 && b.y0 + b.h > 70);
    if (!tall.length) return null;
    const b = r.pick(tall);
    const top = b.y0 + b.h;
    const pos0 = new Vector3(b.x, top + r.range(2, 6), b.z);
    // stand near an edge
    pos0.x += Math.cos(b.yaw) * b.w * 0.4 * (r.chance(0.5) ? 1 : -1);
    pos0.z += Math.sin(b.yaw) * b.d * 0.4 * (r.chance(0.5) ? 1 : -1);
    if (this.query.insideSolid(pos0.x, pos0.y, pos0.z, 0.5, true)) return null;
    const h0 = r.range(0, Math.PI * 2);
    const pan = r.range(0.3, 0.8) * (r.chance(0.5) ? 1 : -1);
    const pitch = -r.range(0.02, 0.2);
    const dur = r.range(9, 13);
    return {
      type: 'rooftop', anchor: `${d.id}@${Math.round(b.x)},${Math.round(b.z)}`, duration: dur, fov: r.range(48, 70), focus: pos0.clone(),
      signature: this.sig('rooftop', d.id, pos0, h0),
      eval: (t, pos, look) => {
        pos.copy(pos0);
        look.copy(pos0).add(forwardOf(h0 + pan * t, pitch, tmp).multiplyScalar(100));
      },
    };
  }

  private buildTrench(): Shot | null {
    const r = this.rng;
    const f = r.pick(this.query.layout.freeways);
    const i = r.int(0, f.pts.length - 2);
    const [ax, az] = f.pts[i], [bx, bz] = f.pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 400) return null;
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    const speed = r.range(25, 60);
    const dur = Math.min(r.range(8, 12), (len * 0.8) / speed);
    const t0 = r.range(0, Math.max(0, len - speed * dur));
    const alt = r.range(18, 70);
    const start = new Vector3(ax + ux * t0, alt + this.query.groundHeight(ax + ux * t0, az + uz * t0), az + uz * t0);
    if (!this.query.layout.inBounds(start.x, start.z)) return null;
    const heading = Math.atan2(ux, -uz);
    const pitch = -r.range(0.02, 0.18);
    return {
      type: 'trench', anchor: `${f.id}#${i}`, duration: dur, fov: r.range(50, 68), focus: start.clone(),
      signature: this.sig('trench', f.id, start, heading),
      eval: (t, pos, look) => {
        pos.set(start.x + ux * speed * dur * t, start.y, start.z + uz * speed * dur * t);
        look.copy(pos).add(forwardOf(heading, pitch, tmp).multiplyScalar(100));
      },
    };
  }
}
