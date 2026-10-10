// District bus, street pool, PA and the harbor horn. Ticked from MarketAudio.update,
// which the frame loop already calls. No per-district branch in App.ts.
import { CityLayout } from '../world/layout';
import { U } from '../atmosphere/uniforms';
import { allHolograms } from '../world/holograms/registry';
import type { Tier } from '../core/quality';
import { hash2i } from '../core/rng';
import { crowdAudioSnap, crowdShareOf } from '../districts/little-tokyo-market/crowd';
import type { Ambience } from './Ambience';
import './beds';
import { makeSlot, mountCityGraph, type CityGraph, type StreetSlot } from './graph';
import { hornEnvelope, mixTargets, slotLevel } from './mix';
import { SLOT_KINDS, VOICE_CAP, bedOrQuiet, blendBeds, type DistrictBed, type SlotKind } from './registry';
import { setListener, setPos } from './synth';

interface Vec3 { x: number; y: number; z: number }
interface SpinnerAt extends Vec3 { dist: number; closing?: number; heavy?: boolean }

interface Candidate {
  x: number;
  y: number;
  z: number;
  kind: SlotKind;
  key: number;
  d2: number;
}

const HEARD = 0.004;
const KIND_SALT: Record<SlotKind, number> = { sizzle: 1, murmur: 2, neon: 3, steam: 4, clatter: 5 };

export class CitySound {
  voices = 0;
  voiceCap = VOICE_CAP.medium;
  districtId = '';
  private graph: CityGraph | null = null;
  private aId = '';
  private bId = '';
  private aW = 0;
  private bW = 0;
  private lastMs = 0;
  private holoAt = 0;
  private holos: Array<{ x: number; y: number; z: number; band: string }> = [];
  private readonly pool: Candidate[] = Array.from({ length: 48 }, () => ({
    x: 0, y: 0, z: 0, kind: 'sizzle', key: 0, d2: 0,
  }));
  private candN = 0;
  private awningNear = 0;
  private spinnerOn = 0;
  private camX = 0;
  private camZ = 0;
  private readonly used = [0, 0, 0, 0, 0, 0, 0, 0];
  private readonly bedMix: DistrictBed = {
    drone: 0, murmur: 0, pa: 0, industrial: 0, canyon: 0,
    stalls: 0, neon: 0, steam: 0, foghorn: 0, tongue: 0,
  };
  private readonly mixOut = {
    drone: 0, murmur: 0, industrial: 0, pa: 0, canyon: 0, awning: 0, horn: 0, street: 1, open: 1,
  };
  private layout: CityLayout | null = null;

  constructor(private ambience: Ambience) {}

  update(
    cam: Vec3,
    forward: Vec3,
    up: Vec3,
    rain: number,
    inMarket: boolean,
    alt: number,
    sizzleAt: Vec3 | null,
    spinnerAt: SpinnerAt | null,
  ): void {
    const now = performance.now();
    const dt = this.lastMs ? Math.min(0.1, (now - this.lastMs) / 1000) : 0.016;
    this.lastMs = now;
    this.camX = cam.x;
    this.camZ = cam.z;
    this.follow(cam.x, cam.z, dt);

    const ctx = this.ambience.context;
    const master = this.ambience.output;
    if (!ctx || !master) {
      this.voices = 0;
      return;
    }
    const tier = liveTier();
    this.voiceCap = VOICE_CAP[tier];
    if (!this.graph) this.graph = mountCityGraph(ctx, master, this.voiceCap);
    this.syncSlots(ctx, master, this.voiceCap);

    const bedA = bedOrQuiet(this.aId);
    const bedB = bedOrQuiet(this.bId || this.aId);
    const bed = blendBeds(bedA, bedB, this.aW, this.bW, this.bedMix);
    const presence = this.aW * presenceOf(this.aId) + this.bW * presenceOf(this.bId || this.aId);
    const g = this.graph;
    const t = ctx.currentTime;
    const interior = this.ambience.interiorAmount;
    this.awningNear = this.peekAwning(cam);
    const mix = mixTargets({
      bed,
      presence,
      rain,
      alt,
      interior,
      night: nightAmount(),
      traffic: this.ambience.trafficAmount,
      hornEnv: hornEnvelope(t),
      awningNear: this.awningNear,
      inMarket,
    }, this.mixOut);

    aim(g.drone.gain, mix.drone, t, 0.45);
    aim(g.murmur.gain, mix.murmur, t, 0.4);
    aim(g.industrial.gain, mix.industrial, t, 0.5);
    aim(g.awning.gain, mix.awning, t, 0.35);
    aim(g.horn.gain, mix.horn, t, 0.08);
    aim(g.wet.gain, mix.pa * mix.canyon * 0.7, t, 0.4);
    aim(g.feedback.gain, 0.16 + mix.canyon * 0.22, t, 0.5);
    aim(g.delay.delayTime, 0.11 + mix.canyon * 0.1, t, 0.5);
    const tongueB = this.bId ? bedOrQuiet(this.bId).tongue : bedA.tongue;
    for (let i = 0; i < g.pa.length; i++) {
      let w = 0;
      if (i === bedA.tongue) w += this.aW;
      if (i === tongueB) w += this.bW;
      aim(g.pa[i]!.gain, mix.pa * w, t, 0.35);
    }

    this.placeStreet(cam, alt, rain, sizzleAt, mix.street, mix.open, presence, bed, t);
    this.placeSpinner(spinnerAt, interior, t);
    setListener(ctx, cam, forward, up);

    let n = this.ambience.bedVoices();
    n += heard(mix.drone) + heard(mix.murmur) + heard(mix.industrial) + heard(mix.awning) + heard(mix.horn);
    if (mix.pa > HEARD) n += 1;
    for (const s of g.slots) if (s.connected && s.target > HEARD) n += 1;
    this.voices = n + this.spinnerOn;
  }

  private follow(x: number, z: number, dt: number): void {
    if (!this.layout) this.layout = new CityLayout();
    const id = this.layout.districtAt(x, z).id;
    this.districtId = id;
    if (!this.aId) {
      this.aId = id;
      this.aW = 1;
      return;
    }
    if (id !== this.aId) {
      this.bId = this.aId;
      this.bW = this.aW;
      this.aId = id;
      this.aW = 0;
    }
    const k = 1 - Math.exp(-dt / 1.35);
    this.aW += (1 - this.aW) * k;
    this.bW += (0 - this.bW) * k;
    if (this.bW < 0.02) {
      this.bW = 0;
      this.bId = '';
    }
  }

  private syncSlots(ctx: BaseAudioContext, master: AudioNode, cap: number): void {
    const g = this.graph;
    if (!g) return;
    while (g.slots.length < cap) {
      g.slots.push(makeSlot(ctx, master, g.white, SLOT_KINDS[g.slots.length]!));
    }
    for (let i = 0; i < g.slots.length; i++) {
      const slot = g.slots[i]!;
      const on = i < cap;
      if (on && !slot.connected) {
        slot.pan.connect(master);
        slot.connected = true;
      } else if (!on && slot.connected) {
        slot.target = 0;
        aim(slot.gain.gain, 0, ctx.currentTime, 0.08);
        slot.pan.disconnect();
        slot.connected = false;
      }
    }
  }

  private placeStreet(
    cam: Vec3, alt: number, rain: number, sizzleAt: Vec3 | null,
    street: number, open: number, presence: number, bed: DistrictBed, t: number,
  ): void {
    const g = this.graph;
    if (!g) return;
    this.candN = 0;
    const ground = cam.y - alt;
    let awningD = 18;
    const life = crowdAudioSnap().life;
    const limit = Math.min(life.length, 40);
    for (let i = 0; i < limit; i++) {
      const s = life[i]!;
      const dx = s.x - cam.x;
      const dz = s.z - cam.z;
      const d = Math.hypot(dx, dz);
      if (s.kind === 'awning') awningD = Math.min(awningD, d);
      if (d > 32) continue;
      if (s.kind === 'queue') {
        this.add(s.x, ground + 1.15, s.z, 'sizzle');
        this.add(s.x + 0.4, ground + 1.05, s.z, 'clatter');
        this.add(s.x, ground + 1.3, s.z, 'steam');
      } else {
        this.add(s.x, ground + 1.6, s.z, 'murmur');
        this.add(s.x, ground + 2.4, s.z, 'steam');
      }
    }
    if (sizzleAt) this.add(sizzleAt.x, sizzleAt.y + 1.1, sizzleAt.z, 'sizzle');
    this.awningNear = Math.max(0, 1 - awningD / 14);

    if (nowSec() - this.holoAt > 0.5) {
      this.holoAt = nowSec();
      this.holos = allHolograms();
    }
    for (let i = 0; i < this.holos.length; i++) {
      const h = this.holos[i]!;
      if (h.band !== 'street') continue;
      const dx = h.x - cam.x;
      const dz = h.z - cam.z;
      if (dx * dx + dz * dz > 100) continue;
      if (Math.abs(h.y - (ground + 3)) > 18) continue;
      this.add(h.x, h.y, h.z, 'neon');
    }

    const used = this.used;
    let usedN = 0;
    for (let i = 0; i < g.slots.length; i++) {
      const slot = g.slots[i]!;
      if (!slot.connected) continue;
      const best = this.nearest(slot, used, usedN);
      if (!best) {
        slot.key = 0;
        slot.target = 0;
        aim(slot.gain.gain, 0, t, 0.12);
        continue;
      }
      used[usedN++] = best.key;
      slot.key = best.key;
      setPos(slot.pan, best.x, best.y, best.z);
      slot.target = slotLevel(slot.kind, bed, Math.sqrt(best.d2), rain, street, open, presence);
      aim(slot.gain.gain, slot.target, t, 0.1);
    }
  }

  private peekAwning(cam: Vec3): number {
    const life = crowdAudioSnap().life;
    let awningD = 18;
    const n = Math.min(life.length, 40);
    for (let i = 0; i < n; i++) {
      const s = life[i]!;
      if (s.kind !== 'awning') continue;
      const d = Math.hypot(s.x - cam.x, s.z - cam.z);
      if (d < awningD) awningD = d;
    }
    return Math.max(0, 1 - awningD / 14);
  }

  private add(x: number, y: number, z: number, kind: SlotKind): void {
    if (this.candN >= this.pool.length) return;
    const c = this.pool[this.candN++]!;
    c.x = x;
    c.y = y;
    c.z = z;
    c.kind = kind;
    c.key = hash2i(Math.round(x * 2), Math.round(z * 2), KIND_SALT[kind]);
    const dx = x - this.camX;
    const dz = z - this.camZ;
    c.d2 = dx * dx + dz * dz;
  }

  private nearest(slot: StreetSlot, used: number[], usedN: number): Candidate | null {
    let best: Candidate | null = null;
    let bestD = Infinity;
    let held: Candidate | null = null;
    let heldD = Infinity;
    for (let i = 0; i < this.candN; i++) {
      const c = this.pool[i]!;
      if (c.kind !== slot.kind || taken(used, usedN, c.key)) continue;
      if (c.d2 < bestD) {
        bestD = c.d2;
        best = c;
      }
      if (c.key === slot.key && c.d2 < heldD) {
        heldD = c.d2;
        held = c;
      }
    }
    if (held && heldD < bestD * 1.45) return held;
    return best;
  }

  private placeSpinner(spinnerAt: SpinnerAt | null, interior: number, t: number): void {
    const g = this.graph;
    if (!g) return;
    const reach = spinnerAt?.heavy ? 950 : 700;
    const open = 1 - 0.7 * interior;
    if (spinnerAt && spinnerAt.dist < reach) {
      setPos(g.spinnerPan, spinnerAt.x, spinnerAt.y, spinnerAt.z);
      const u = 1 - spinnerAt.dist / reach;
      const level = u * u * (spinnerAt.heavy ? 0.2 : 0.16) * open;
      aim(g.spinner.gain, level, t, 0.08);
      const doppler = Math.max(0.75, Math.min(1.3, 1 + (spinnerAt.closing ?? 0) / 340));
      const freq = ((spinnerAt.heavy ? 90 : 180) + u * (spinnerAt.heavy ? 420 : 900)) * doppler;
      aim(g.spinnerFilter.frequency, freq, t, 0.05);
      this.spinnerOn = level > HEARD ? 1 : 0;
    } else {
      aim(g.spinner.gain, 0, t, 0.1);
      this.spinnerOn = 0;
    }
  }
}

function presenceOf(id: string): number {
  const share = crowdShareOf(id);
  const snap = crowdAudioSnap();
  if (!id || snap.districtId !== id) return share;
  if (snap.want <= 0) return 0;
  return share * Math.min(1, snap.count / snap.want);
}

function taken(used: number[], n: number, key: number): boolean {
  for (let i = 0; i < n; i++) if (used[i] === key) return true;
  return false;
}

function aim(param: AudioParam, value: number, time: number, tc: number): void {
  param.setTargetAtTime(value, time, tc);
}

function heard(v: number): number {
  return v > HEARD ? 1 : 0;
}

function nightAmount(): number {
  const u = U.night as unknown as { value?: number };
  const v = u.value;
  return typeof v === 'number' && Number.isFinite(v) ? v : 1;
}

function liveTier(): Tier {
  const w = window as unknown as { __nla?: { app?: { quality?: { tier?: Tier } } } };
  return w.__nla?.app?.quality?.tier ?? 'medium';
}

function nowSec(): number {
  return performance.now() / 1000;
}
